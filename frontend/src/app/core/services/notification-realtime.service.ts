import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, takeUntil, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import {
  Notification as AppNotification,
  NotificationListResponse,
  NotificationPreferences,
} from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private readonly api = `${environment.apiUrl}/notifications`;
  private destroy$ = new Subject<void>();
  private initialized = false;
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
  }

  private resetState(): void {
    this.notifications.set([]);
    this.total.set(0);
    this.unreadCount.set(0);
    this.nextPage.set(2);
  }

  private loadAll(): void {
    this.fetchUnreadCount().subscribe({ error: () => undefined });
    this.fetchAll(50).subscribe({ error: () => undefined });
  }

  requestPermission(): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      this.permission.set('granted');
      return;
    }
    if (Notification.permission === 'denied') {
      this.permission.set('denied');
      return;
    }
    Notification.requestPermission().then((result) => {
      this.permission.set(result);
    });
  }

  setPermission(value: 'granted' | 'denied' | 'default'): void {
    this.permission.set(value as NotificationPermission);
  }

  private showDesktopNotification(notif: any): void {
    try {
      const desktopNotif = new window.Notification(notif.title || 'Notificacion', {
        body: notif.message || '',
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-72x72.png',
        tag: notif.id,
      } as NotificationOptions);

      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
        if (notif.entityType === 'ticket' && notif.entityCodigo) {
          this.navigateToTicket(notif.entityCodigo);
        } else if (notif.entityType === 'ticket') {
          this.navigateToTicket();
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
          for (const n of this.notifications()) merged.set(n.id, n);
          for (const n of res.data) if (!merged.has(n.id)) merged.set(n.id, n);
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

  markAllAsRead(): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/read-all`, {})
      .pipe(
        map(() => {
          const current = this.notifications();
          this.notifications.set(
            current.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })),
          );
          this.unreadCount.set(0);
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

  removeMany(ids?: string[]): Observable<void> {
    return this.http.request<void>('delete', this.api, { body: { ids } }).pipe(
      map(() => {
        const toRemove = new Set<string>(ids ?? this.notifications().map((n) => n.id));
        const keep = this.notifications().filter((n) => !toRemove.has(n.id));
        this.notifications.set(keep);
        this.total.set(keep.length);
        this.unreadCount.set(keep.filter((n) => !n.read).length);
      }),
    );
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.api}/preferences`);
  }

  updatePreferences(prefs: NotificationPreferences): Observable<NotificationPreferences> {
    return this.http.patch<NotificationPreferences>(`${this.api}/preferences`, prefs);
  }
}
