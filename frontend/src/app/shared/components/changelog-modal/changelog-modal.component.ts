import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, firstValueFrom, combineLatest, interval } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { ChangelogService, Changelog } from '../../../core/services/changelog.service';
import { NotificationService } from '../../../core/services/notification.service';
import { limpiarHTML } from '../../../features/admin/modules/configuracion/components/mail-editor/mail-editor.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-changelog-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './changelog-modal.component.html',
  styleUrl: './changelog-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogModalComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly allowedRoles = ['admin', 'advisor', 'desarrollador', 'interno'];
  private readonly destroy$ = new Subject<void>();
  private userId: string | null = null;
  private lastUserId: string | null = null;
  private inflight = false;
  private sesionLista = false;
  private cargaTimer: ReturnType<typeof setTimeout> | null = null;
  private renderedForId: string | null = null;
  private readonly apiBase: string;
  private notifTimer: ReturnType<typeof setTimeout> | null = null;
  private activacionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private notificados = new Set<string>();
  private primerCarga = false;

  @ViewChild('bodyFrame') bodyFrame?: ElementRef<HTMLIFrameElement>;

  pendientes: Changelog[] = [];
  current: Changelog | null = null;
  cerrarManual = false;
  notificacion: { id: string; categoria: string; titulo: string } | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly socket: SocketService,
    private readonly service: ChangelogService,
    private readonly cdr: ChangeDetectorRef,
    private readonly notify: NotificationService,
  ) {
    this.apiBase = new URL(environment.apiUrl).origin;
  }

  ngOnInit(): void {
    this.auth.sessionReady$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ready) => {
          this.sesionLista = ready;
          if (ready) this.evaluar(this.auth.getUser());
          else this.limpiar();
        },
      });

    this.auth.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.userId = user?.id ?? null;
        if (this.sesionLista) this.evaluar(user);
      });

    this.socket
      .on<any>('changelog')
      .pipe(takeUntil(this.destroy$), debounceTime(250))
      .subscribe((item) => {
        if (this.sesionLista && this.rolHabilitado(this.auth.getUser()) && !this.cerrarManual) {
          this.programarActivacion(item);
          this.cargarPendientes();
        }
      });

    interval(60_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.sesionLista && this.rolHabilitado(this.auth.getUser()) && !this.cerrarManual) {
          this.cargarPendientes();
        }
      });
  }

  ngOnDestroy(): void {
    if (this.cargaTimer) clearTimeout(this.cargaTimer);
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.limpiarActivaciones();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private rolHabilitado(user: { role?: string } | null): boolean {
    return !!user && this.allowedRoles.includes(user.role ?? '');
  }

  private evaluar(user: { id?: string; role?: string } | null): void {
    const habilitado = this.rolHabilitado(user);
    if (habilitado) {
      if (user!.id !== this.lastUserId) {
        this.lastUserId = user!.id!;
        this.cerrarManual = false;
        this.notificados.clear();
        this.primerCarga = false;
      }
      this.programarCarga();
    } else if (!habilitado) {
      this.limpiar();
      this.lastUserId = null;
    }
  }

  private programarCarga(): void {
    if (this.cargaTimer) clearTimeout(this.cargaTimer);
    // Espera a que el shell y sus datos terminen de cargar antes de mostrar.
    this.cargaTimer = setTimeout(() => {
      this.cargaTimer = null;
      this.cargarPendientes();
    }, 1500);
  }

  private limpiar(): void {
    if (this.cargaTimer) {
      clearTimeout(this.cargaTimer);
      this.cargaTimer = null;
    }
    if (this.notifTimer) {
      clearTimeout(this.notifTimer);
      this.notifTimer = null;
    }
    this.limpiarActivaciones();
    this.notificados.clear();
    this.primerCarga = false;
    this.notificacion = null;
    this.pendientes = [];
    this.current = null;
    this.cdr.markForCheck();
  }

  formatFecha(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  cuerpoDoc(): string {
    if (!this.current) return '';
    const body = limpiarHTML(this.absolutizarUploads(this.current.cuerpo));
    if (/<html[\s>]/i.test(body)) return body;
    return this.wrapEmail(body);
  }

  frameLoad(): void {
    const frame = this.bodyFrame?.nativeElement;
    if (frame) this.syncFrameHeight(frame);
  }

  ngAfterViewInit(): void {
    this.renderSiPendiente();
  }

  ngAfterViewChecked(): void {
    this.renderSiPendiente();
  }

  marcarVistoActual(): void {
    const item = this.current;
    if (!item) return;
    this.pendientes = this.pendientes.filter((p) => p.id !== item.id);
    this.current = this.pendientes.length ? this.pendientes[0] : null;
    this.renderedForId = null;
    this.cdr.markForCheck();
    firstValueFrom(this.service.marcarVisto(item.id)).catch(() => {
      /* el avance local no depende del servidor */
    });
  }

  private renderSiPendiente(): void {
    const frame = this.bodyFrame?.nativeElement;
    if (!frame || !this.current || this.current.id === this.renderedForId) return;
    const doc = this.cuerpoDoc();
    const cd = frame.contentDocument;
    if (!cd) {
      frame.srcdoc = doc;
      this.renderedForId = this.current.id;
      return;
    }
    cd.open();
    cd.write(doc);
    cd.close();
    this.renderedForId = this.current.id;
    this.syncFrameHeight(frame);
  }

  private cargarPendientes(): void {
    if (!this.userId || this.inflight) return;
    this.inflight = true;
    firstValueFrom(this.service.pendientes())
      .then((list) => {
        this.pendientes = list;
        if (!this.current && list.length) {
          this.current = this.pendientes[0];
          this.cdr.markForCheck();
        }
        this.detectarNuevas(list);
      })
      .catch(() => {})
      .finally(() => {
        this.inflight = false;
        this.cdr.markForCheck();
      });
  }

  private detectarNuevas(list: Changelog[]): void {
    if (!this.primerCarga) {
      this.primerCarga = true;
      return;
    }
    for (const item of list) {
      if (this.notificados.has(item.id)) continue;
      this.notificados.add(item.id);
      this.notificarItem(item);
    }
  }

  private notificarItem(item: Changelog): void {
    this.notificacion = { id: item.id, categoria: item.categoria, titulo: item.titulo };
    this.cdr.markForCheck();
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notifTimer = setTimeout(() => {
      this.notificacion = null;
      this.cdr.markForCheck();
    }, 7000);
    this.notificarEscritorio(item);
  }

  cerrarNotificacion(): void {
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notificacion = null;
    this.cdr.markForCheck();
  }

  categoriaColor(cat: string): string {
    switch (cat) {
      case 'nuevo': return '#10b981';
      case 'mejora': return '#6366f1';
      case 'correccion': return '#f59e0b';
      default: return '#3b82f6';
    }
  }

  categoriaLabel(cat?: string): string {
    switch (cat) {
      case 'nuevo': return 'Novedades en el sistema';
      case 'mejora': return 'Mejoras en el sistema';
      case 'correccion': return 'Correccion en el sistema';
      default: return 'Novedad del sistema';
    }
  }

  private notificarEscritorio(item: Changelog): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const titulo = this.categoriaLabel(item.categoria);
    const cuerpo = item.titulo;
    const mostrar = () => {
      try {
        const n = new Notification(titulo, { body: cuerpo, tag: `changelog-${item.id}` });
        setTimeout(() => n.close(), 8000);
      } catch {
        /* el navegador puede rechazar la API */
      }
    };
    if (Notification.permission === 'granted') {
      mostrar();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission()
        .then((perm) => { if (perm === 'granted') mostrar(); })
        .catch(() => {});
    }
  }

  private programarActivacion(item: any): void {
    if (!item?.publicadoEl) return;
    const target = new Date(item.publicadoEl).getTime();
    const delay = target - Date.now();
    if (!(delay > 0)) return;
    const prev = this.activacionTimers.get(item.id);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.activacionTimers.delete(item.id);
      const rest = target - Date.now();
      if (rest <= 0) {
        this.cargarPendientes();
      } else {
        this.programarActivacion(item);
      }
    }, Math.min(delay, 2_147_000_000));
    this.activacionTimers.set(item.id, timer);
  }

  private limpiarActivaciones(): void {
    for (const timer of this.activacionTimers.values()) clearTimeout(timer);
    this.activacionTimers.clear();
  }

  private absolutizarUploads(html: string): string {
    if (!this.apiBase) return html;
    return html.replace(/("|\()\/(uploads\/[^")]+)/g, `$1${this.apiBase}/$2`);
  }

  private wrapEmail(body: string): string {
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>' +
      '<body style="margin:0;padding:24px 0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;overflow-wrap:break-word;word-break:break-word;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;"><tr><td align="center" style="padding:24px 12px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="padding:24px 28px;">' +
      body.replace(/\r?\n/g, '<br/>') +
      '</td></tr></table></td></tr></table>' +
      '</body></html>'
    );
  }

  private syncFrameHeight(frame: HTMLIFrameElement): void {
    try {
      const h = frame.contentWindow?.document.body?.scrollHeight;
      if (typeof h === 'number' && h > 0) frame.style.height = h + 'px';
    } catch {
      /* cross-origin no aplica */
    }
  }
}