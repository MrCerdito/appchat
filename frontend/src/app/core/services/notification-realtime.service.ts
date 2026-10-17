import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, takeUntil, Subject, timer, filter, fromEvent, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import {
  Notification as AppNotification,
  NotificationListResponse,
  NotificationPreferences,
  NotificationSection,
} from '../models/notification.model';

/**
 * Icono del popup del escritorio. Antes apuntaba a
 * `/assets/icons/icon-192x192.png`, ruta que no existe en este proyecto: por eso
 * todos los avisos salian sin imagen. Estos archivos si estan en el build.
 */
const ICONO_NOTIFICACION = 'favicon-192x192.png';

@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private readonly api = `${environment.apiUrl}/notifications`;
  private destroy$ = new Subject<void>();
  private initialized = false;
  private baselineLoaded = false;
  private refreshing = false;
  private currentUserId = '';

  readonly notifications = signal<AppNotification[]>([]);
  readonly total = signal<number>(0);
  readonly unreadCount = signal<number>(0);
  readonly nextPage = signal<number>(2);
  readonly loadedAll = computed(() => this.notifications().length >= this.total());
  readonly hasUnread = computed(() => this.unreadCount() > 0);
  readonly permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  readonly preferences = signal<NotificationPreferences | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {}

  init(socket: SocketService): void {
    if (this.initialized) return;
    this.initialized = true;

    this.auth.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        const id = user?.id ?? '';
        if (id && id !== this.currentUserId) {
          this.currentUserId = id;
          this.resetState();
          this.loadAll();
          this.getPreferences().subscribe({ error: () => undefined });
        } else if (!id && this.currentUserId) {
          this.currentUserId = '';
          this.resetState();
          this.preferences.set(null);
        }
      });

    socket.on<any>('notification')
      .pipe(takeUntil(this.destroy$))
      .subscribe((notif) => {
        if (!notif || !notif.id) return;
        if (notif.recipientId && notif.recipientId !== this.currentUserId) return;
        const exists = this.notifications().some((n) => n.id === notif.id);
        if (exists) return;
        this.notifications.update((list) => [notif, ...list]);
        this.unreadCount.update((c) => c + 1);
        this.total.update((t) => t + 1);

        if (notif._desktop && this.permission() === 'granted') {
          this.showDesktopNotification(notif);
        }
      });

    // Las notificaciones no dependen de que el usuario tenga abierto el panel
    // ni el módulo de correos. Se recuperan eventos perdidos al reconectar,
    // volver a la pestaña o mediante un sondeo liviano como último respaldo.
    socket.connected$
      .pipe(filter(Boolean), takeUntil(this.destroy$))
      .subscribe(() => this.refresh(true));
    timer(60_000, 60_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refresh(true));
    if (typeof document !== 'undefined') {
      fromEvent(document, 'visibilitychange')
        .pipe(filter(() => document.visibilityState === 'visible'), takeUntil(this.destroy$))
        .subscribe(() => this.refresh(true));
    }
    if (typeof window !== 'undefined') {
      fromEvent(window, 'focus')
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.refresh(true));
    }
  }

  private resetState(): void {
    this.notifications.set([]);
    this.total.set(0);
    this.unreadCount.set(0);
    this.nextPage.set(2);
    this.baselineLoaded = false;
  }

  private loadAll(): void {
    this.fetchUnreadCount().subscribe({ error: () => undefined });
    this.fetchAll(50).subscribe({
      error: () => undefined,
      complete: () => { this.baselineLoaded = true; },
    });
  }

  /** Actualiza el inicio de la bandeja y conserva el historial ya cargado. */
  refresh(notifyMissed = true): void {
    if (!this.currentUserId || this.refreshing) return;
    this.refreshing = true;
    this.http.get<NotificationListResponse>(this.api, {
      params: { page: '1', limit: '50' },
    }).subscribe({
      next: (res) => {
        const current = this.notifications().filter((n) => !this.correoVencido(n));
        const respuestaVigente = res.data.filter((n) => !this.correoVencido(n));
        const vencidasEnRespuesta = res.data.filter((n) => this.correoVencido(n));
        const ids = new Set(current.map((n) => n.id));
        const incoming = respuestaVigente.filter((n) => !ids.has(n.id));
        if (notifyMissed && this.baselineLoaded) {
          for (const n of incoming) {
            if (
              this.permission() === 'granted' &&
              this.preferences()?.[n.type as keyof NotificationPreferences]?.desktop
            ) {
              this.showDesktopNotification(n);
            }
          }
        }
        const merged = new Map<string, AppNotification>();
        for (const n of incoming) merged.set(n.id, n);
        for (const n of current) merged.set(n.id, n);
        for (const n of respuestaVigente) merged.set(n.id, n);
        this.notifications.set([...merged.values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ));
        this.total.set(Math.max(0, res.total - vencidasEnRespuesta.length));
        this.unreadCount.set(Math.max(
          0,
          res.unreadCount - vencidasEnRespuesta.filter((n) => !n.read).length,
        ));
      },
      error: () => { this.refreshing = false; },
      complete: () => { this.refreshing = false; },
    });
  }

  requestPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') {
      const unavailable = 'denied' as NotificationPermission;
      this.permission.set(unavailable);
      return Promise.resolve(unavailable);
    }
    if (Notification.permission === 'granted') {
      this.permission.set('granted');
      return Promise.resolve('granted');
    }
    if (Notification.permission === 'denied') {
      this.permission.set('denied');
      return Promise.resolve('denied');
    }
    return Notification.requestPermission()
      .then((result) => {
        this.permission.set(result);
        return result;
      })
      .catch(() => {
        this.permission.set(Notification.permission);
        return Notification.permission;
      });
  }

  private showDesktopNotification(notif: any): void {
    try {
      const desktopNotif = new window.Notification(notif.title || 'Notificacion', {
        body: notif.message || '',
        icon: ICONO_NOTIFICACION,
        badge: ICONO_NOTIFICACION,
        tag: notif.id,
        silent: notif.type === 'reunion_recordatorio',
      } as NotificationOptions);

      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
        if (notif.entityType === 'ticket' && notif.entityCodigo) {
          this.navigateToTicket(notif.entityCodigo);
        } else if (notif.entityType === 'ticket') {
          this.navigateToTicket();
        } else if (notif.entityType === 'correo') {
          // Sin esta rama el clic solo enfocaba la ventana y el aviso de correo
          // no llevaba a la bandeja, que es justo para donde se quiere ir.
          const queryParams = notif.entityId ? { correo: notif.entityId } : undefined;
          this.router.navigate(['/dashboard/correos'], { queryParams });
        } else if (notif.entityType === 'calendario') {
          this.navigateToCalendar(notif.meta?.fecha);
        } else if (notif.entityType === 'meeting') {
          const joinUrl = notif.meta?.joinUrl;
          if (typeof joinUrl === 'string' && joinUrl) {
            window.open(joinUrl, '_blank', 'noopener,noreferrer');
          }
          this.markAsRead(notif.id).subscribe({ error: () => undefined });
        }
      };

      setTimeout(() => desktopNotif.close(), 8000);
    } catch {
      // Notification API not available
    }
  }

  private navigateToTicket(codigo?: string): void {
    const user = this.auth.getUser();
    let route = '/admin/tickets';
    if (user?.role === 'advisor') route = '/dashboard/tickets';
    else if (user?.role === 'desarrollador') route = '/developer/tickets';
    else if (user?.role === 'interno') route = '/interno/tickets';
    if (codigo) {
      this.router.navigate([route], { queryParams: { highlight: codigo } });
    } else {
      this.router.navigate([route]);
    }
  }

  fetch(page = 1, limit = 20): Observable<NotificationListResponse> {
    return this.http
      .get<NotificationListResponse>(this.api, {
        params: { page: String(page), limit: String(limit) },
      })
      .pipe(
        map((res) => {
          this.notifications.set(res.data);
          this.total.set(res.total);
          this.unreadCount.set(res.unreadCount);
          this.nextPage.set(page + 1);
          return res;
        }),
      );
  }

  fetchAll(limit = 50): Observable<NotificationListResponse> {
    return new Observable<NotificationListResponse>((subscriber) => {
      const requestPage = (page: number, accumulated: AppNotification[]): void => {
        this.http
          .get<NotificationListResponse>(this.api, {
            params: { page: String(page), limit: String(limit) },
          })
          .subscribe({
            next: (res) => {
              const merged = new Map<string, AppNotification>();
              for (const n of accumulated) merged.set(n.id, n);
              for (const n of res.data) merged.set(n.id, n);
              const sorted = [...merged.values()].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              );
              this.notifications.set(sorted);
              this.total.set(res.total);
              this.unreadCount.set(res.unreadCount);
              this.nextPage.set(page + 1);
              if (sorted.length < res.total && res.data.length > 0) {
                requestPage(page + 1, sorted);
              } else {
                subscriber.next(res);
                subscriber.complete();
              }
            },
            error: (err) => subscriber.error(err),
          });
      };
      requestPage(1, []);
    });
  }

  loadMore(limit = 20): Observable<NotificationListResponse> {
    const page = this.nextPage();
    return this.http
      .get<NotificationListResponse>(this.api, {
        params: { page: String(page), limit: String(limit) },
      })
      .pipe(
        map((res) => {
          const merged = new Map<string, AppNotification>();
          for (const n of this.notifications()) if (!this.correoVencido(n)) merged.set(n.id, n);
          for (const n of res.data) if (!this.correoVencido(n) && !merged.has(n.id)) merged.set(n.id, n);
          this.notifications.set([...merged.values()]);
          this.total.set(res.total);
          this.unreadCount.set(res.unreadCount);
          this.nextPage.set(page + 1);
          return res;
        }),
      );
  }

  fetchUnreadCount(): Observable<number> {
    return this.http
      .get<any>(`${this.api}/unread-count`)
      .pipe(
        map((res) => {
          const count = typeof res === 'number' ? res : (res?.count ?? 0);
          this.unreadCount.set(count);
          return count;
        }),
      );
  }

  markAsRead(id: string): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/${id}/read`, {})
      .pipe(
        map(() => {
          const current = this.notifications();
          this.notifications.set(
            current.map((n) =>
              n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n,
            ),
          );
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }),
      );
  }

  private navigateToCalendar(fecha?: string): void {
    const role = this.auth.getUser()?.role;
    const route = role === 'admin'
      ? '/admin/calendario'
      : role === 'desarrollador'
        ? '/developer/calendario'
        : role === 'interno'
          ? '/interno/calendario'
          : '/dashboard/calendario';
    this.router.navigate([route], {
      queryParams: typeof fecha === 'string' ? { fecha } : undefined,
    });
  }

  /** Se invoca únicamente después de cargar el cuerpo del correo en la app. */
  markCorreoAbierto(correoId: string): Observable<void> {
    return this.http.patch<void>(`${this.api}/correo/${correoId}/read`, {}).pipe(
      map(() => {
        let marcadas = 0;
        const ahora = new Date().toISOString();
        this.notifications.update((items) => items.map((n) => {
          if (n.type !== 'correo_nuevo' || n.read) return n;
          const metaIds = n.meta?.['correoIds'];
          const ids: string[] = Array.isArray(metaIds) && metaIds.length
            ? metaIds.filter((id): id is string => typeof id === 'string')
            : [n.entityId];
          if (!ids.includes(correoId)) return n;
          const previos = n.meta?.['correoLeidos'];
          const leidos = new Set<string>(
            Array.isArray(previos) ? previos.filter((id): id is string => typeof id === 'string') : [],
          );
          leidos.add(correoId);
          const read = ids.every((id) => leidos.has(id));
          if (read) marcadas++;
          return {
            ...n,
            read,
            readAt: read ? ahora : null,
            meta: { ...(n.meta ?? {}), correoLeidos: [...leidos] },
          };
        }));
        if (marcadas) this.unreadCount.update((count) => Math.max(0, count - marcadas));
      }),
    );
  }

  markAllAsRead(section?: NotificationSection): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/read-all`, section ? { section } : {})
      .pipe(
        map(() => {
          const current = this.notifications();
          this.notifications.set(
            current.map((n) => this.inSection(n.type, section) && !n.read
              ? { ...n, read: true, readAt: new Date().toISOString() }
              : n),
          );
          this.unreadCount.set(current.filter((n) => !n.read && !this.inSection(n.type, section)).length);
        }),
      );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`).pipe(
      map(() => {
        const removed = this.notifications().find((n) => n.id === id);
        this.notifications.set(this.notifications().filter((n) => n.id !== id));
        this.total.update((t) => Math.max(0, t - 1));
        if (removed && !removed.read) {
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }
      }),
    );
  }

  removeMany(ids?: string[], section?: NotificationSection): Observable<void> {
    return this.http.request<void>('delete', this.api, { body: { ids, section } }).pipe(
      map(() => {
        const toRemove = new Set<string>(ids ?? this.notifications()
          .filter((n) => this.inSection(n.type, section)).map((n) => n.id));
        const keep = this.notifications().filter((n) => !toRemove.has(n.id));
        this.notifications.set(keep);
        this.total.set(keep.length);
        this.unreadCount.set(keep.filter((n) => !n.read).length);
      }),
    );
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.api}/preferences`).pipe(
      tap((prefs) => this.preferences.set(prefs)),
    );
  }

  updatePreferences(prefs: NotificationPreferences): Observable<NotificationPreferences> {
    return this.http.patch<NotificationPreferences>(`${this.api}/preferences`, prefs).pipe(
      tap((updated) => this.preferences.set(updated)),
    );
  }

  private inSection(type: string, section?: NotificationSection): boolean {
    if (!section) return true;
    if (section === 'tickets') return type.startsWith('ticket_');
    if (section === 'correos') return type === 'correo_nuevo';
    return !type.startsWith('ticket_') && type !== 'correo_nuevo';
  }

  private correoVencido(notif: AppNotification): boolean {
    return notif.type === 'correo_nuevo' &&
      Date.now() - new Date(notif.createdAt).getTime() >= 20 * 60 * 1000;
  }
}
