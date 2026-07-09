import {
  Component, OnInit, OnDestroy, ViewChild,
  ElementRef, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ChatStateService } from '../../../../core/services/chat-state.service';
import { TicketService } from '../../../../core/services/ticket.service';
import { SoundService } from '../../../../core/services/sound.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Message } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { User } from '../../../../core/models/user.model';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService } from '../../../../core/services/ai.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { priorityLabel } from '../../../../shared/utils/ticket-categories';
import { Ticket } from '../../../../core/models/ticket.model';

// ── Payload exacto que emite el backend ──────────────────────────────────────
export interface TimerUpdatePayload {
  sessionId : string;
  tipo      : 'advisor_waiting' | 'client_waiting' | 'closing';
  total     : number;
  elapsed   : number;
  mensaje   : string;
  iteracion : number;
  maxIter   : number;
}

// ── Estado calculado para el template ────────────────────────────────────────
export interface TimerPanelState {
  tipo      : 'advisor_waiting' | 'client_waiting' | 'closing';
  restante  : number;
  total     : number;
  pct       : number;
  estado    : 'ok' | 'alerta' | 'enviado' | 'cierre';
  mensaje   : string;
  iteracion : number;
  maxIter   : number;
}

// Colores de avatar por índice (cíclico)
const AVATAR_COLORS = ['ava-blue', 'ava-green', 'ava-amber', 'ava-purple'];

@Component({
  selector   : 'app-chat-advisor',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './chat-advisor.html',
  styleUrl   : './chat-advisor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatAdvisorComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // ── Estado UI ─────────────────────────────────────────────────────────────
  searchQuery      = '';
  currentAdvisor   : User | null    = null;
  advisors         : User[]         = [];
  sessions         : Session[]      = [];
  activeSession    : Session | null = null;
  showTransfer     = false;
  showCloseConfirm = false;
  showInfoPanel    = false;
  newMessage       = '';
  typingMap        = new Map<string, string>();

  remitLoading  = false;
  remitFeedback : { type: 'ok' | 'error'; text: string } | null = null;
  aiModeActive  = false;

  showAiInsightModal = false;
  isAiInsightLoading = false;
  aiInsightText = 'Analisis pendiente.';

  // Ticket modal
  showTicketModal = false;
  ticketDto = { titulo: '', descripcion: '', priority: 'medium' as const, category: '' };
  ticketCategories: string[] = [];
  creatingTicket = false;
  ticketFeedback: { type: 'ok' | 'error'; text: string } | null = null;

  // ★ Timer persistente por sessionId
  private timerMap = new Map<string, TimerPanelState>();
  private clientPresenceMap = new Map<string, { online: boolean; active: boolean; lastSeen?: string }>();

  // Índice de color por sessionId (para avatares consistentes)
  private colorIndex = new Map<string, number>();
  private colorCounter = 0;

  private typingTimeouts = new Map<string, any>();
  private isTyping       = false;
  private destroy$       = new Subject<void>();

  constructor(
    private socket      : SocketService,
    private sessionService: SessionService,
    private auth        : AuthService,
    private state       : ChatStateService,
    private ticketService: TicketService,
    private sanitizer   : DomSanitizer,
    private sound       : SoundService,
    private notification: NotificationService,
    private aiService   : AiService,
    private route       : ActivatedRoute,
    private router      : Router,
    private cdr         : ChangeDetectorRef,
  ) {}

  // ── Getters ───────────────────────────────────────────────────────────────

  get messages(): Message[] {
    if (!this.activeSession) return [];
    return this.state.getMessages(this.activeSession.id);
  }

  get activeSessions(): Session[] {
    const active = this.sessions.filter(s => s.status === 'waiting' || s.status === 'active');
    if (!this.searchQuery.trim()) return active;
    const q = this.searchQuery.toLowerCase();
    return active.filter(s =>
      s.clientName?.toLowerCase().includes(q) ||
      s.apellido?.toLowerCase().includes(q)
    );
  }

  get waitingCount(): number {
    return this.sessions.filter(s => s.status === 'waiting').length;
  }

  get assignedCount(): number {
    return this.sessions.filter(s => s.status === 'active').length;
  }

  get activeAdvisorName(): string {
    return this.activeSession?.advisor?.name || 'Sin asesor';
  }

  get timerState(): TimerPanelState | null {
    if (!this.activeSession) return null;
    return this.timerMap.get(this.activeSession.id) ?? null;
  }

  get isTypingActive(): boolean {
    if (!this.activeSession) return false;
    return this.typingMap.has(this.activeSession.id);
  }

  get typingNameActive(): string {
    if (!this.activeSession) return '';
    return this.typingMap.get(this.activeSession.id) ?? '';
  }

  get isCollaborator(): boolean {
    if (!this.activeSession || !this.currentAdvisor) return false;
    return this.activeSession.advisor?.id !== this.currentAdvisor.id;
  }

  get canSendMessage(): boolean {
    return !!this.activeSession && this.activeSession.status !== 'closed';
  }

  unreadCount(sessionId: string): number {
    return this.state.getUnread(sessionId);
  }

  /** Devuelve una clase CSS de color de avatar consistente por sesión */
  avatarColor(sessionId: string): string {
    if (!this.colorIndex.has(sessionId)) {
      this.colorIndex.set(sessionId, this.colorCounter % AVATAR_COLORS.length);
      this.colorCounter++;
    }
    return AVATAR_COLORS[this.colorIndex.get(sessionId)!];
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.currentAdvisor = this.auth.getUser();
    this.loadSessions();
    this.loadAdvisors();

    const savedStatus = localStorage.getItem('advisor_status') ?? 'online';
    this.socket.emit('set_advisor_status', savedStatus);
    this.socket.emit('advisor_ready');

    this.registerSocketEvents();
    


    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
    const sessionId = params['openSession'];
    if (!sessionId) return;

  // Esperar un tick para que loadSessions() del ngOnInit termine
  setTimeout(() => {
    const target = this.sessions.find(s => s.id === sessionId);
    if (target) {
      this.joinSession(target);
    } else {
      // Si aún no está en la lista, recargar explícitamente
      this.sessionService.findAll().subscribe({
        next: (sessions) => {
          this.sessions = sessions;
          sessions.filter(s => s.status === 'active' || s.status === 'waiting')
                  .forEach(s => this.joinRoom(s.id));
          const joined = sessions.find(s => s.id === sessionId);
          if (joined) this.joinSession(joined);
          this.cdr.detectChanges();
        }
      });
    }
  }, 300);
});
    
  }

  private registerSocketEvents(): void {

    // ★ Cuando este asesor se une a un chat desde el historial (join_active_chat),
    //   el backend confirma con joined_chat_ok. Recargamos sesiones para que
    //   el chat aparezca inmediatamente en la lista y lo abrimos automáticamente.
    this.socket.on<{ sessionId: string; clientName: string }>('joined_chat_ok')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        // Recargar lista para incluir el nuevo chat
        this.sessionService.findAll().subscribe({
          next: (sessions) => {
            this.sessions = sessions;
            sessions
              .filter(s => s.status === 'active' || s.status === 'waiting')
              .forEach(s => this.joinRoom(s.id));

            // Abrir automáticamente el chat al que se unió
            const joined = sessions.find(s => s.id === data.sessionId);
            if (joined) {
              this.joinSession(joined);
            }

            this.cdr.detectChanges();
          },
        });
      });

    this.socket.on<{ advisorId: string; name: string; status: string; activeChats?: number }>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const idx = this.advisors.findIndex(a => a.id === data.advisorId);
        if (idx !== -1) {
          this.advisors[idx] = {
            ...this.advisors[idx],
            status: data.status,
            activeChats: data.activeChats ?? this.advisors[idx].activeChats,
          };
          this.advisors = [...this.advisors];
        } else {
          this.loadAdvisors();
        }
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; clientName: string }>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.loadSessions(data.sessionId);
        this.joinRoom(data.sessionId);
        this.showRemitFeedback('ok', `Nuevo chat asignado: ${data.clientName}`);
        this.cdr.detectChanges();
      });


      

    this.socket.on<{ sessionId: string; advisorName: string }>('advisor_joined_collab')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.detectChanges());

    this.socket.on<{ sessionId: string; advisorName: string }>('advisor_left_collab')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.detectChanges());

    this.socket.on<{ reason: string }>('leave_chat_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.showRemitFeedback('error', data.reason);
        this.cdr.detectChanges();
      });

    this.socket.on<Message[]>('message_history')
      .pipe(takeUntil(this.destroy$))
      .subscribe((msgs) => {
        if (!this.activeSession) return;
        this.state.setMessages(this.activeSession.id, msgs);
        this.socket.emit('set_active', { sessionId: this.activeSession.id, active: true });
        this.cdr.detectChanges();
        this.scrollToBottom();
      });

      

    this.socket.on<any>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        const sessionId = msg.session?.id ?? msg.sessionId;
        if (!sessionId) return;

        const added = this.state.addMessage(sessionId, msg);

        if (msg.senderType === 'client') {
          if (this.activeSession?.id === sessionId) {
            this.state.setUnread(sessionId, 0);
            this.socket.emit('set_active', { sessionId, active: true });
          } else if (added && this.state.getActiveSessionId() !== sessionId) {
            this.state.incrementUnread(sessionId);
          }
        }

        this.cdr.detectChanges();
        if (this.activeSession?.id === sessionId) this.scrollToBottom();
      });

    this.socket.on<any>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<any>('messages_read')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!data?.sessionId) return;
        this.state.markRead(data.sessionId, 'advisor');
        this.cdr.detectChanges();
      });

    this.socket.on<any>('session_closed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const sessionId = data?.sessionId;
        if (!sessionId) return;
        this.clearSession(sessionId);
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<{ name: string; role: string; sessionId: string }>('typing_start')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.role === 'client') {
          this.typingMap.set(data.sessionId, data.name);
          this.cdr.detectChanges();
        }
      });

    this.socket.on<{ sessionId: string }>('typing_stop')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.typingMap.delete(data.sessionId);
        this.cdr.detectChanges();
      });

    this.socket.on<{ role: string }>('user_disconnected')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.detectChanges());

    this.socket.on<{ sessionId: string; online: boolean; active: boolean; lastSeen?: string }>('client_presence')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!data?.sessionId) return;
        this.clientPresenceMap.set(data.sessionId, {
          online: data.online,
          active: data.active,
          lastSeen: data.lastSeen,
        });
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string }>('remit_ai_ok')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.remitLoading = false;
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; takenBy: string }>('session_taken')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (this.activeSession?.id === data.sessionId) this.activeSession = null;
        this.sessions = this.sessions.filter(s => s.id !== data.sessionId);
        this.clearSession(data.sessionId);
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<{ reason: string }>('takeover_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.showRemitFeedback('error', data.reason);
        this.cdr.detectChanges();
      });

    this.socket.on<{ reason: string }>('remit_ai_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.remitLoading = false;
        this.aiModeActive = false;
        this.showRemitFeedback('error', data.reason ?? 'No se pudo remitir a la IA');
        this.cdr.detectChanges();
      });

    this.socket.on<{ active: boolean }>('ai_mode_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.aiModeActive = data.active;
        if (data.active) this.showRemitFeedback('ok', 'IA activa — respondiendo automáticamente');
        this.cdr.detectChanges();
      });

    // ★ Timer: siempre persiste en timerMap
    this.socket.on<TimerUpdatePayload>('timer_update')
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        if (!payload?.sessionId) return;
        const state = this.calcularTimerState(payload);
        this.timerMap.set(payload.sessionId, state);
        this.cdr.detectChanges();
      });
  }

  // ── Calcular estado del timer ─────────────────────────────────────────────
  private calcularTimerState(p: TimerUpdatePayload): TimerPanelState {
    const total   = (typeof p.total   === 'number' && p.total   > 0) ? p.total   : 0;
    const elapsed = (typeof p.elapsed === 'number' && !isNaN(p.elapsed)) ? p.elapsed : 0;

    const restante = total > 0 ? Math.max(0, total - elapsed) : 0;
    const pct      = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
    const esAlerta = total > 0 && pct >= 65;

    let estado: TimerPanelState['estado'];

    switch (p.tipo) {
      case 'closing':
        estado = 'cierre';
        break;
      case 'advisor_waiting':
        estado = (total > 0 && elapsed >= total) ? 'enviado' : (esAlerta ? 'alerta' : 'ok');
        break;
      default:
        estado = esAlerta ? 'alerta' : 'ok';
    }

    return {
      tipo     : p.tipo,
      restante,
      total,
      pct,
      estado,
      mensaje  : p.mensaje   ?? '',
      iteracion: p.iteracion ?? 0,
      maxIter  : p.maxIter   ?? 0,
    };
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  /** Limpia todo el estado local de una sesión */
  private clearSession(sessionId: string): void {
    this.state.clearSession(sessionId);
    this.timerMap.delete(sessionId);
    this.colorIndex.delete(sessionId);
    if (this.activeSession?.id === sessionId) {
      this.activeSession    = null;
      this.showCloseConfirm = false;
      this.showTransfer     = false;
    }
  }

  private showRemitFeedback(type: 'ok' | 'error', text: string): void {
    this.remitFeedback = { type, text };
    setTimeout(() => { this.remitFeedback = null; this.cdr.detectChanges(); }, 3000);
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────
  private joinRoom(sessionId: string): void {
    if (this.state.isJoined(sessionId)) return;
    this.state.markJoined(sessionId);
    this.state.setMessages(sessionId, []);
    this.socket.emit('join_session', { sessionId });
  }

  // ── IA ────────────────────────────────────────────────────────────────────
  remitToAi(): void {
    if (!this.activeSession || this.remitLoading) return;
    this.remitLoading  = true;
    this.remitFeedback = null;
    this.cdr.detectChanges();
    this.socket.emit('remit_to_ai', this.activeSession.id);
  }

  retakeControl(): void {
    if (!this.activeSession) return;
    this.aiModeActive  = false;
    this.remitFeedback = null;
    this.socket.emit('deactivate_ai_mode', this.activeSession.id);
    this.cdr.detectChanges();
  }

  // ── Colaborador ───────────────────────────────────────────────────────────
  leaveCollabChat(): void {
    if (!this.activeSession) return;
    const sessionId = this.activeSession.id;
    this.socket.emit('leave_active_chat', sessionId);
    this.clearSession(sessionId);
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    this.cdr.detectChanges();
  }

  // ── Supervisor: tomar chat de otro asesor ─────────────────────────────────
  // ── Carga de datos ────────────────────────────────────────────────────────
  loadSessions(openSessionId = ''): void {
    this.sessionService.findAll().subscribe({
      next: (sessions) => {
        this.state.reconcileSessions(sessions);
        this.sessions = sessions;
        if (this.activeSession) {
          const updated = sessions.find(s => s.id === this.activeSession?.id);
          if (updated) this.activeSession = updated;
        }
        sessions
          .filter(s => s.status === 'active' || s.status === 'waiting')
          .forEach(s => this.joinRoom(s.id));
        if (openSessionId) {
          const target = sessions.find(s => s.id === openSessionId);
          if (target) this.joinSession(target);
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando sesiones:', err),
    });
  }

  loadAdvisors(): void {
    this.sessionService.findAdvisors().subscribe(a => {
      this.advisors = a.filter(x => x.id !== this.currentAdvisor?.id);
      this.cdr.detectChanges();
    });
  }

  // ── Seleccionar sesión ────────────────────────────────────────────────────
  joinSession(session: Session): void {
    if (this.activeSession && this.activeSession.id !== session.id) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }

    this.activeSession    = session;
    this.showTransfer     = false;
    this.showCloseConfirm = false;
    this.showInfoPanel    = false;
    this.remitFeedback    = null;
    this.aiModeActive     = false;
    this.state.setActiveSession(session.id);
    this.state.setUnread(session.id, 0);

    this.joinRoom(session.id);

    const cached = this.state.getMessages(session.id);
    if (cached.length === 0) {
      this.socket.emit('join_session', { sessionId: session.id });
    }

    this.socket.emit('set_active', { sessionId: session.id, active: true });
    this.socket.emit('mark_read', session.id);
    this.cdr.detectChanges();
    this.scrollToBottom();
  }

  closeActiveSessionView(): void {
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.activeSession = null;
    this.showInfoPanel = false;
    this.state.setActiveSession(null);
    this.cdr.detectChanges();
  }

  // ── Cerrar sesión ─────────────────────────────────────────────────────────
  closeSession(): void {
    if (!this.activeSession) return;
    const sessionId = this.activeSession.id;
    this.socket.emit('close_session', sessionId);
    this.clearSession(sessionId);
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    this.showCloseConfirm = false;
    this.showTransfer     = false;
    this.remitFeedback    = null;
    this.cdr.detectChanges();
  }

  // ── Transferir ────────────────────────────────────────────────────────────
  transferTo(advisorId: string): void {
    if (!this.activeSession) return;
    const advisor = this.advisors.find(a => a.id === advisorId);
    if (!advisor || advisor.status === 'offline') return;
    const sessionId = this.activeSession.id;
    this.socket.emit('transfer_session', { sessionId, newAdvisorId: advisorId });
    this.clearSession(sessionId);
    this.sessions      = this.sessions.filter(s => s.id !== sessionId);
    this.showTransfer  = false;
    this.cdr.detectChanges();
  }

  // ── Typing ────────────────────────────────────────────────────────────────
  onTyping(): void {
    if (!this.activeSession) return;
    const sessionId = this.activeSession.id;
    if (!this.isTyping) {
      this.isTyping = true;
      this.socket.emit('typing_start', sessionId);
    }
    if (this.typingTimeouts.has(sessionId)) clearTimeout(this.typingTimeouts.get(sessionId));
    this.typingTimeouts.set(sessionId, setTimeout(() => {
      this.isTyping = false;
      this.typingTimeouts.delete(sessionId);
      this.socket.emit('typing_stop', sessionId);
    }, 1500));
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  send(): void {
    if (!this.newMessage.trim() || !this.activeSession || !this.canSendMessage) return;
    const sessionId = this.activeSession.id;
    if (this.typingTimeouts.has(sessionId)) {
      clearTimeout(this.typingTimeouts.get(sessionId));
      this.typingTimeouts.delete(sessionId);
    }
    if (this.isTyping) {
      this.isTyping = false;
      this.socket.emit('typing_stop', sessionId);
    }
    this.socket.emit('send_message', { sessionId, content: this.newMessage.trim() });
    this.newMessage = '';
  }

  async aiInsight(): Promise<void> {
    if (this.isAiInsightLoading || !this.activeSession) return;
    const msgs = this.messages
      .filter(m => m.senderName !== 'Sistema')
      .slice(-20)
      .map(m => ({
        fromMe: m.senderType === 'advisor',
        body: m.content,
      }));
    if (!msgs.length) {
      this.aiInsightText = 'No hay mensajes para analizar.';
      this.showAiInsightModal = true;
      return;
    }
    this.isAiInsightLoading = true;
    try {
      const res = await firstValueFrom(
        this.aiService.summarizeWhatsappConversation({
          clientName: this.activeSession.clientName,
          institution: this.activeSession.colegio,
          role: this.activeSession.rol,
          messages: msgs,
        }),
      );
      this.aiInsightText = res.summary || 'Sin analisis disponible.';
    } catch {
      this.aiInsightText = 'Error al conectar con la IA.';
    } finally {
      this.isAiInsightLoading = false;
      this.showAiInsightModal = true;
    }
  }

  closeAiInsightModal(): void {
    this.showAiInsightModal = false;
  }

  formatMessage(text: string): SafeHtml {
    if (!text) return '';
    const html = this.escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')
      .replace(
        /((https?:\/\/|www\.)[^\s<]+)/g,
        (match) => {
          const url = match.startsWith('www.') ? `https://${match}` : match;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        }
      )
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Ticket ────────────────────────────────────────────────────────────
  openTicketModal(): void {
    if (!this.activeSession) return;
    this.ticketDto = {
      titulo: `Ticket desde sesion ${this.activeSession.codigo || this.activeSession.id}`,
      descripcion: '',
      priority: 'medium',
      category: '',
    };
    this.loadTicketCategories();
    this.showTicketModal = true;
  }

  closeTicketModal(): void {
    this.showTicketModal = false;
  }

  loadTicketCategories(): void {
    this.ticketService.getCategories().subscribe(cats => {
      this.ticketCategories = cats;
      this.cdr.detectChanges();
    });
  }

  createTicket(): void {
    if (!this.activeSession || !this.ticketDto.titulo.trim() || this.creatingTicket) return;
    this.creatingTicket = true;
    this.ticketFeedback = null;
    const session = this.activeSession;
    const body = {
      titulo: this.ticketDto.titulo.trim(),
      descripcion: this.ticketDto.descripcion?.trim() || undefined,
      priority: this.ticketDto.priority,
      category: this.ticketDto.category || undefined,
    };
    this.ticketService.createFromSession(session.id, body).subscribe({
      next: (ticket: Ticket) => {
        this.showTicketModal = false;
        this.creatingTicket = false;
        this.sound.playTicketNotification();
        this.ticketFeedback = { type: 'ok', text: 'Ticket generado correctamente' };
        setTimeout(() => {
          this.ticketFeedback = null;
          this.cdr.detectChanges();
        }, 3000);
        // Auto-mensaje
        const label = priorityLabel(ticket.priority);
        const advisorName = this.currentAdvisor?.name || 'Asesor';
        this.socket.emit('send_message', {
          sessionId: session.id,
          content: `Se generó el ticket ${ticket.codigo} con prioridad ${label} y fue asignado a ${advisorName}.`,
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.creatingTicket = false;
        const msg = err?.error?.message || err?.message || '';
        const text = msg.includes('codigo') || msg.includes('duplicate')
          ? 'El codigo del ticket ya existe. Intenta de nuevo.'
          : 'Error al generar el ticket.';
        this.ticketFeedback = { type: 'error', text };
        this.notification.error('Error al crear ticket', text);
        setTimeout(() => {
          this.ticketFeedback = null;
          this.cdr.detectChanges();
        }, 4000);
        this.cdr.detectChanges();
      },
    });
  }

  safeInitial(value?: string | null): string {
    return (value || '?').trim().charAt(0).toUpperCase() || '?';
  }

  sessionFullName(session?: Session | null): string {
    if (!session) return '';
    return `${session.clientName || ''} ${session.apellido || ''}`.trim() || 'Cliente';
  }

  statusLabel(session?: Session | null): string {
    if (!session) return '';
    if (session.status === 'waiting') return 'En espera';
    if (session.status === 'active') return 'Activo';
    if (session.status === 'closed') return 'Cerrado';
    return session.status || 'Sin estado';
  }

  clientPresenceLabel(session?: Session | null): string {
    if (!session) return 'Sin actividad';
    const presence = this.clientPresenceMap.get(session.id);
    if (!presence?.online) return 'Cliente desconectado';
    if (presence.active) return 'Cliente activo en el chat';
    return 'Cliente con chat abierto';
  }

  clientPresenceClass(session?: Session | null): string {
    if (!session) return 'presence-offline';
    const presence = this.clientPresenceMap.get(session.id);
    if (!presence?.online) return 'presence-offline';
    return presence.active ? 'presence-active' : 'presence-open';
  }

  openClientLink(session?: Session | null): string {
    const value = session?.colegioLink?.trim();
    if (!value) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  // ── Scroll ────────────────────────────────────────────────────────────────
  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }

  // ── Destroy ───────────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    this.state.setActiveSession(null);
    this.destroy$.next();
    this.destroy$.complete();
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.typingTimeouts.forEach(t => clearTimeout(t));
    this.typingTimeouts.clear();
  }
}
