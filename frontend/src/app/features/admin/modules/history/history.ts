import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { Message, TimelineItem, TimelineEvento } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { scrollToBottom } from '../../../../shared/utils/scroll';
import { fmtDateTimeShort, fmtDateTimeFull, fmtTime } from '../../../../shared/utils/date';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryGlobalComponent implements OnInit, OnDestroy {
  private readonly STORAGE_KEY = 'admin_history_active_session';
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly fmtDateTimeShort = fmtDateTimeShort;
  protected readonly fmtDateTimeFull = fmtDateTimeFull;
  protected readonly fmtTime = fmtTime;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessions     : Session[] = [];
  activeSession: Session | null = null;
  timeline     : TimelineItem[] = [];
  nextBefore   : string | null = null;
  hasMoreHistorial = false;
  loadingMore  = false;
  msgSearchQuery = '';
  filter       : 'all' | 'active' | 'closed' = 'active';
  search = '';
  loading = false;

  filterColegio      = '';
  filterRol          = '';
  filterSolicitud    = '';
  filterIdentificacion = '';
  filterAsesor       = '';
  showAdvancedFilters  = false;

  colegios   : string[] = [];
  roles      : string[] = [];
  solicitudes: string[] = [];
  asesores   : string[] = [];

  mobileView: 'list' | 'chat' = 'list';

  imagePreview: { src: string; name: string } | null = null;

  dateRangePreset = '';
  filterDateFrom = '';
  filterDateTo   = '';

  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private socket        : SocketService,
    private cdr           : ChangeDetectorRef,
  ) {}

  get filteredSessions(): Session[] {
    return this.sessions.filter(s => {
      const matchStatus =
        this.filter === 'all' ||
        (this.filter === 'active'  && s.status !== 'closed') ||
        (this.filter === 'closed'  && s.status === 'closed');

      const q = this.search.toLowerCase();
      const matchSearch = !q ||
        s.clientName?.toLowerCase().includes(q)     ||
        s.advisor?.name?.toLowerCase().includes(q)  ||
        s.colegio?.toLowerCase().includes(q)        ||
        s.identificacion?.toLowerCase().includes(q);

      const matchColegio    = !this.filterColegio    || s.colegio?.toLowerCase()      === this.filterColegio.toLowerCase();
      const matchRol        = !this.filterRol        || s.rol?.toLowerCase()           === this.filterRol.toLowerCase();
      const matchSolicitud  = !this.filterSolicitud  || s.tipoSolicitud?.toLowerCase() === this.filterSolicitud.toLowerCase();
      const matchId         = !this.filterIdentificacion ||
        s.identificacion?.toLowerCase().includes(this.filterIdentificacion.toLowerCase());
      const matchAsesor     = !this.filterAsesor ||
        s.advisor?.name?.toLowerCase() === this.filterAsesor.toLowerCase();

      let matchDate = true;
      if ((this.filterDateFrom || this.filterDateTo) && s.createdAt) {
        const created = new Date(s.createdAt);
        if (this.filterDateFrom) {
          const from = new Date(this.filterDateFrom);
          from.setHours(0, 0, 0, 0);
          matchDate = matchDate && created >= from;
        }
        if (this.filterDateTo) {
          const to = new Date(this.filterDateTo);
          to.setHours(23, 59, 59, 999);
          matchDate = matchDate && created <= to;
        }
      }

      return matchStatus && matchSearch && matchColegio && matchRol && matchSolicitud && matchId && matchAsesor && matchDate;
    });
  }

  get stats() {
    const list      = this.filteredSessions;
    const total     = list.length;
    const conAsesor = list.filter(s => !!s.advisor?.name).length;
    const porIa     = total - conAsesor;
    const pct       = (n: number) => total ? Math.round((n / total) * 100) : 0;
    return {
      total,
      conAsesor,
      porIa,
      pctAsesor: pct(conAsesor),
      pctIa    : pct(porIa),
    };
  }

  get filteredMessages(): TimelineItem[] {
    if (!this.msgSearchQuery.trim()) return this.timeline;
    const q = this.msgSearchQuery.toLowerCase();
    return this.timeline.filter(item => {
      if (item.kind === 'evento') {
        const d = item.detalle ?? {};
        return (
          d['pregunta']?.toLowerCase().includes(q) ||
          d['respuesta']?.toLowerCase().includes(q)
        );
      }
      return item.content?.toLowerCase().includes(q);
    });
  }

  esEvento(item: TimelineItem): item is TimelineEvento {
    return item.kind === 'evento';
  }

  eventoIcono(tipo: string): string {
    if (tipo === 'solicitud_asesor') return '🎧';
    if (tipo === 'faq_clic') return '❓';
    return 'ℹ️';
  }

  eventoTexto(item: TimelineEvento): string {
    if (item.tipo === 'solicitud_asesor') return 'El cliente solicitó hablar con un asesor';
    if (item.tipo === 'faq_clic') {
      const p = item.detalle?.['pregunta'];
      return p ? `Consultó la pregunta frecuente: "${p}"` : 'Consultó una pregunta frecuente';
    }
    return 'Evento de sesión';
  }

  ngOnInit(): void {
    this.socket.connect();
    this.loadSessions();
    this.listenSocketEvents();
  }

  ngOnDestroy(): void {
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenSocketEvents(): void {
    this.socket.on<any>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        const sessionId = msg.session?.id ?? msg.sessionId;
        if (!sessionId) return;
        if (this.activeSession && sessionId === this.activeSession.id) {
          if (!this.timeline.some(t => t.kind === 'message' && t.id === msg.id)) {
            this.timeline = [...this.timeline, { kind: 'message' as const, ...msg }];
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        }
      });

    this.socket.on<any>('session_event')
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => {
        const sessionId = evt?.sessionId ?? evt?.session_id;
        if (!sessionId || !evt?.id) return;
        if (this.activeSession && sessionId === this.activeSession.id) {
          if (!this.timeline.some(t => t.kind === 'evento' && t.id === evt.id)) {
            this.timeline = [...this.timeline, {
              kind: 'evento' as const,
              id: evt.id,
              tipo: evt.tipo,
              detalle: evt.detalle ?? null,
              createdAt: evt.createdAt ?? new Date().toISOString(),
            }];
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        }
      });

    this.socket.on<{ sessionId: string }>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string }>('session_closed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.sessions = this.sessions.map(s =>
          s.id === data.sessionId ? { ...s, status: 'closed' } : s
        );
        if (this.activeSession?.id === data.sessionId) {
          this.activeSession = { ...this.activeSession, status: 'closed' };
          sessionStorage.removeItem(this.STORAGE_KEY);
        }
        this.cdr.detectChanges();
      });
  }

  loadSessions(): void {
    this.sessionService.findAllAdmin().subscribe({
      next: (s) => {
        this.sessions = s;
        this.buildFilterOptions();
        this.restoreActiveSession();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  buildFilterOptions(): void {
    const unique = (arr: (string | undefined | null)[]) =>
      [...new Set(arr.filter((v): v is string => !!v))].sort();

    this.colegios   = unique(this.sessions.map(s => s.colegio));
    this.roles      = unique(this.sessions.map(s => s.rol));
    this.solicitudes = unique(this.sessions.map(s => s.tipoSolicitud));
    this.asesores   = unique(this.sessions.map(s => s.advisor?.name));
  }

  clearFilters(): void {
    this.search = '';
    this.filter = 'all';
    this.filterColegio = '';
    this.filterRol = '';
    this.filterSolicitud = '';
    this.filterIdentificacion = '';
    this.filterAsesor = '';
    this.dateRangePreset = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
  }

  get hasActiveFilters(): boolean {
    return !!(this.search || this.filter !== 'all' || this.filterColegio ||
      this.filterRol || this.filterSolicitud || this.filterIdentificacion ||
      this.filterAsesor || this.filterDateFrom || this.filterDateTo);
  }

  applyDatePreset(preset: string): void {
    this.dateRangePreset = preset;
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    switch (preset) {
      case 'today': {
        this.filterDateFrom = fmt(today);
        this.filterDateTo = fmt(today);
        break;
      }
      case 'yesterday': {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        this.filterDateFrom = fmt(y);
        this.filterDateTo = fmt(y);
        break;
      }
      case 'week': {
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        this.filterDateFrom = fmt(w);
        this.filterDateTo = fmt(today);
        break;
      }
      case 'month': {
        const m = new Date(today);
        m.setDate(m.getDate() - 30);
        this.filterDateFrom = fmt(m);
        this.filterDateTo = fmt(today);
        break;
      }
      case 'custom':
        this.filterDateFrom = '';
        this.filterDateTo = '';
        break;
      default:
        this.filterDateFrom = '';
        this.filterDateTo = '';
    }
  }

  selectSession(session: Session): void {
    sessionStorage.setItem(this.STORAGE_KEY, session.id);
    this.activeSession    = session;
    this.timeline         = [];
    this.nextBefore       = null;
    this.hasMoreHistorial = false;
    this.loading          = true;
    this.mobileView       = 'chat';

    this.socket.emit('join_session', { sessionId: session.id });

    this.sessionService.getTimeline(session.id, null, 50).subscribe({
      next: (resp) => {
        this.timeline         = resp.items ?? [];
        this.nextBefore       = resp.nextBefore ?? null;
        this.hasMoreHistorial = !!resp.hasMore;
        this.loading  = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  cargarAnteriores(): void {
    if (!this.activeSession || !this.hasMoreHistorial || this.loadingMore || !this.nextBefore) return;
    this.loadingMore = true;
    this.cdr.detectChanges();

    const container = this.messagesContainer?.nativeElement as HTMLElement | undefined;
    const prevHeight = container?.scrollHeight ?? 0;

    this.sessionService
      .getTimeline(this.activeSession.id, this.nextBefore, 50)
      .subscribe({
        next: (resp) => {
          const viejos = resp.items ?? [];
          this.timeline = [...viejos, ...this.timeline];
          this.nextBefore = resp.nextBefore ?? null;
          this.hasMoreHistorial = !!resp.hasMore;
          this.loadingMore = false;
          this.cdr.detectChanges();
          if (container) {
            container.scrollTop = container.scrollHeight - prevHeight;
          }
        },
        error: () => { this.loadingMore = false; this.cdr.detectChanges(); },
      });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      waiting: 'Esperando', active: 'Activo', closed: 'Cerrado', ai: 'IA',
    };
    return map[status] ?? status;
  }

  private restoreActiveSession(): void {
    const savedId = sessionStorage.getItem(this.STORAGE_KEY);
    if (!savedId || this.activeSession) return;
    const session = this.sessions.find(s => s.id === savedId);
    if (session) {
      this.selectSession(session);
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        scrollToBottom(this.messagesContainer.nativeElement);
      }
    }, 50);
  }

  openImagePreview(src: string, name: string): void {
    this.imagePreview = { src, name };
  }

  closeImagePreview(): void {
    this.imagePreview = null;
  }
}
