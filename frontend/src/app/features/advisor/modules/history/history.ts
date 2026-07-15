import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Message } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryGlobalComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessions     : Session[] = [];
  activeSession: Session | null = null;
  messages     : Message[] = [];
  msgSearchQuery = '';
  filter       : 'all' | 'active' | 'closed' = 'all';
  search = '';
  loading = false;

  // ── Filtros avanzados ──
  filterColegio      = '';
  filterRol          = '';
  filterSolicitud    = '';
  filterIdentificacion = '';
  showAdvancedFilters  = false;

  // ── Dropdowns ──
  colegios   : string[] = [];
  roles      : string[] = [];
  solicitudes: string[] = [];

  // ── Mobile ──
  mobileView: 'list' | 'chat' = 'list';

  // ── Takeover ──
  takeoverLoading  = false;
  takeoverFeedback : { type: 'ok' | 'error'; text: string } | null = null;

  private currentUserId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private auth          : AuthService,
    private socket        : SocketService,
    private router        : Router,
    private cdr           : ChangeDetectorRef,
  ) {}

  // ── Filtro de sesiones ────────────────────────────────────────────────────
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

      return matchStatus && matchSearch && matchColegio && matchRol && matchSolicitud && matchId;
    });
  }

  get canTakeOver(): boolean {
    if (!this.activeSession) return false;
    const s = this.activeSession;
    if (s.status !== 'active' && s.status !== 'waiting') return false;
    return s.advisor?.id !== this.currentUserId;
  }

  get filteredMessages(): Message[] {
    if (!this.msgSearchQuery.trim()) return this.messages;
    const q = this.msgSearchQuery.toLowerCase();
    return this.messages.filter(m => m.content?.toLowerCase().includes(q));
  }

  /** Indica si el usuario actual ya es asesor/colaborador del chat activo */
  get alreadyInChat(): boolean {
    if (!this.activeSession) return false;
    const s = this.activeSession;
    if (s.advisor?.id === this.currentUserId) return true;
    const colabs: { id: string }[] = (s as any).collaborators ?? [];
    return colabs.some(c => c.id === this.currentUserId);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.currentUserId = this.auth.getUser()?.id ?? null;
    this.socket.connect(this.auth.getToken() ?? undefined);
    this.loadSessions();
    this.listenSocketEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Socket events ─────────────────────────────────────────────────────────
  private listenSocketEvents(): void {

    // ✅ Unión exitosa → el backend ya añadió al asesor como colaborador
    //    Actualizamos la sesión local y redirigimos al panel de chats
    this.socket.on<{ sessionId: string; clientName: string }>('joined_chat_ok')
    .pipe(takeUntil(this.destroy$))
    .subscribe((data) => {
        this.takeoverLoading = false;

        // Marcar la sesión en la lista local para reflejar que ya estoy dentro
        const idx = this.sessions.findIndex(s => s.id === data.sessionId);
        if (idx !== -1 && this.currentUserId) {
          const colabs: { id: string }[] = (this.sessions[idx] as any).collaborators ?? [];
          if (!colabs.some(c => c.id === this.currentUserId)) {
            (this.sessions[idx] as any).collaborators = [
              ...colabs,
              { id: this.currentUserId },
            ];
          }
          // Refrescar activeSession también
          if (this.activeSession?.id === data.sessionId) {
            this.activeSession = { ...this.sessions[idx] };
          }
        }

        this.showFeedback('ok', 'Chat tomado. Redirigiendo...');
        this.cdr.detectChanges();

        // Pequeño delay para que el asesor vea el feedback antes de navegar
        setTimeout(() => this.router.navigate(['/dashboard/chats'], {
        queryParams: { openSession: data.sessionId }
      }), 900);
      });

    // ❌ Error al unirse
    this.socket.on<{ reason: string }>('join_chat_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.takeoverLoading = false;
        this.showFeedback('error', data.reason ?? 'No se pudo tomar el chat');
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; clientName: string }>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!this.takeoverLoading) return;
        this.takeoverLoading = false;
        this.showFeedback('ok', 'Chat tomado. Redirigiendo...');
        this.loadSessions();
        setTimeout(() => this.router.navigate(['/dashboard/chats'], {
          queryParams: { openSession: data.sessionId },
        }), 700);
      });

    this.socket.on<{ reason: string }>('takeover_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.takeoverLoading = false;
        this.showFeedback('error', data.reason ?? 'No se pudo tomar el chat');
        this.cdr.detectChanges();
      });

    // Actualización en tiempo real si una sesión cambia de estado
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
        }
        this.cdr.detectChanges();
      });
  }

  // ── Takeover ──────────────────────────────────────────────────────────────
  takeOver(): void {
    if (!this.activeSession || this.takeoverLoading || !this.canTakeOver) return;
    this.takeoverLoading  = true;
    this.takeoverFeedback = null;
    this.cdr.detectChanges();
    this.socket.emit('takeover_session', this.activeSession.id);
  }

  // ── Sesiones ──────────────────────────────────────────────────────────────
  loadSessions(): void {
    this.sessionService.findAllAdmin().subscribe({
      next: (s) => {
        this.sessions = s;
        this.buildFilterOptions();
        this.cdr.detectChanges();
      },
    });
  }

  buildFilterOptions(): void {
    const unique = (arr: (string | undefined | null)[]) =>
      [...new Set(arr.filter((v): v is string => !!v))].sort();

    this.colegios   = unique(this.sessions.map(s => s.colegio));
    this.roles      = unique(this.sessions.map(s => s.rol));
    this.solicitudes = unique(this.sessions.map(s => s.tipoSolicitud));
  }

  clearFilters(): void {
    this.search = '';
    this.filter = 'all';
    this.filterColegio = '';
    this.filterRol = '';
    this.filterSolicitud = '';
    this.filterIdentificacion = '';
  }

  get hasActiveFilters(): boolean {
    return !!(this.search || this.filter !== 'all' || this.filterColegio ||
      this.filterRol || this.filterSolicitud || this.filterIdentificacion);
  }

  selectSession(session: Session): void {
    this.activeSession    = session;
    this.messages         = [];
    this.loading          = true;
    this.takeoverFeedback = null;
    this.mobileView       = 'chat';

    this.sessionService.getMessages(session.id).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.loading  = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      waiting: 'Esperando', active: 'Activo', closed: 'Cerrado', ai: 'IA',
    };
    return map[status] ?? status;
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }

  private showFeedback(type: 'ok' | 'error', text: string): void {
    this.takeoverFeedback = { type, text };
    setTimeout(() => {
      this.takeoverFeedback = null;
      this.cdr.detectChanges();
    }, 3500);
  }
}
