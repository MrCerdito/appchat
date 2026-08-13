import {
  Component, OnInit, OnDestroy, ViewChild,
  ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, HostListener
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
import { ChatMediaService } from '../../../../core/services/chat-media.service';
import { Message, Attachment } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { User } from '../../../../core/models/user.model';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService } from '../../../../core/services/ai.service';
import { ConfiguracionFrontendService } from '../../../../core/services/configuracion.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { priorityLabel } from '../../../../shared/utils/ticket-categories';
import { scrollToBottom } from '../../../../shared/utils/scroll';
import { normalizeUploadFile } from '../../../../shared/utils/media';
import { relativeTime, fmtTime, fmtMedium, sameBogotaDay, isTodayBogota, isYesterdayBogota } from '../../../../shared/utils/date';
import { Ticket } from '../../../../core/models/ticket.model';
import {
  VoiceRecorderComponent,
  VoiceRecordingResult,
} from '../../../../shared/components/voice-recorder/voice-recorder.component';
import { VoicePlayerComponent } from '../../../../shared/components/voice-player/voice-player.component';

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
  imports    : [CommonModule, FormsModule, VoiceRecorderComponent, VoicePlayerComponent],
  templateUrl: './chat-advisor.html',
  styleUrl   : './chat-advisor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatAdvisorComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly fmtTime = fmtTime;
  protected readonly fmtMedium = fmtMedium;
  protected readonly sameBogotaDay = sameBogotaDay;
  protected readonly isTodayBogota = isTodayBogota;
  protected readonly isYesterdayBogota = isYesterdayBogota;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('msgInput') msgInput!: ElementRef<HTMLTextAreaElement>;

  // ── Estado UI ─────────────────────────────────────────────────────────────
  currentAdvisor   : User | null    = null;
  advisors         : User[]         = [];
  sessions         : Session[]      = [];
  activeSession    : Session | null = null;
  showTransfer     = false;
  showCloseConfirm = false;
  showInfoPanel    = false;
  newMessage       = '';
  typingMap        = new Map<string, string>();
  compactList      = false;
  showRecent       = false;

  remitLoading  = false;
  remitFeedback : { type: 'ok' | 'error'; text: string } | null = null;
  aiModeActive  = false;

  // ── Mejorar mensaje con IA ────────────────────────────────────────────────
  showImprovePanel = false;
  isImproving      = false;
  improveTone      = 'formal';
  improveStep: 'tones' | 'variants' = 'tones';
  improveVariants: string[] = [];
  improveVariantIndex = -1;
  readonly improveTones = [
    { id: 'formal',  label: 'Formal',  desc: 'Serio e institucional' },
    { id: 'educado', label: 'Educado', desc: 'Amable y respetuoso' },
    { id: 'directo', label: 'Directo', desc: 'Claro y sin rodeos' },
  ] as const;

  showAiInsightModal = false;
  isAiInsightLoading = false;
  aiInsightText = 'Analisis pendiente.';

  configQuickReplies: Array<{ name: string; content: string }> = [];
  showSlashMenu = false;
  slashQuery = '';
  slashHighlight = 0;
  ghostSuggestion = '';

  // ── File attachments ───────────────────────────────────────────────────────
  previewFiles: { file: File; preview: string | null; uploading: boolean; error: string | null }[] = [];
  pendingAttachments: Attachment[] = [];
  isRecordingAudio = false;
  @ViewChild('advisorFileInput') advisorFileInput!: ElementRef<HTMLInputElement>;

  // Ticket modal
  showTicketModal = false;
  ticketDto = { titulo: '', descripcion: '', priority: 'medium' as const, category: '' };
  ticketCategories: string[] = [];
  creatingTicket = false;
  ticketFeedback: { type: 'ok' | 'error'; text: string } | null = null;

  // Image lightbox
  imagePreview: { src: string; name: string } | null = null;
  mediaZoom = 1;
  mediaPanX = 0;
  mediaPanY = 0;
  isMediaDragging = false;
  @ViewChild('mediaImage') mediaImage?: ElementRef<HTMLImageElement>;
  private mediaDragStartX = 0;
  private mediaDragStartY = 0;
  private mediaDragPanX = 0;
  private mediaDragPanY = 0;
  private mediaPinchDist = 0;

  // ★ Timer persistente por sessionId
  private timerMap = new Map<string, TimerPanelState>();
  private clientPresenceMap = new Map<string, { online: boolean; active: boolean; lastSeen?: string }>();

  // Índice de color por sessionId (para avatares consistentes)
  private colorIndex = new Map<string, number>();
  private colorCounter = 0;

  private typingTimeouts = new Map<string, any>();
  private isTyping       = false;
  private destroy$       = new Subject<void>();
  private resizeObserver: ResizeObserver | null = null;

  // Sesiones a las que este asesor se unió como apoyo (join_active_chat).
  // Se usan para saber quién puede escribir en un chat activo de otro asesor.
  private collaboratorSessions = new Set<string>();

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
    private configService: ConfiguracionFrontendService,
    private route       : ActivatedRoute,
    private router      : Router,
    private cdr         : ChangeDetectorRef,
    private chatMedia   : ChatMediaService,
  ) {}

  // ── Getters ───────────────────────────────────────────────────────────────

  get messages(): Message[] {
    if (!this.activeSession) return [];
    return this.state.getMessages(this.activeSession.id);
  }

  /** ¿Esta sesión puede aparecer en la lista propia del asesor? */
  private isMineOrQueue(s: Session): boolean {
    if (this.currentAdvisor?.role === 'admin') return true;
    if (s.status === 'waiting') return true;
    return s.advisor?.id === this.currentAdvisor?.id;
  }

  get activeSessions(): Session[] {
    return this.sessions.filter(
      s => this.isMineOrQueue(s) && (s.status === 'waiting' || s.status === 'active'),
    );
  }

  get waitingCount(): number {
    return this.sessions.filter(s => this.isMineOrQueue(s) && s.status === 'waiting').length;
  }

  get assignedCount(): number {
    return this.sessions.filter(s => this.isMineOrQueue(s) && s.status === 'active').length;
  }

  get recentSessions(): Session[] {
    const activeIds = new Set(this.activeSessions.map(s => s.id));
    return this.sessions
      .filter(s => this.isMineOrQueue(s) && !activeIds.has(s.id))
      .sort((a, b) => this.lastActivityMs(b) - this.lastActivityMs(a))
      .slice(0, 4);
  }

  /** Momento de la última actividad de la sesión (último mensaje o creación). */
  private lastActivityMs(session: Session): number {
    const t = session.lastMessage?.createdAt ?? session.createdAt;
    if (!t) return 0;
    const ts = new Date(t).getTime();
    return isNaN(ts) ? 0 : ts;
  }

  /** Etiqueta del remitente del último mensaje para el preview de Recientes. */
  previewSenderLabel(session: Session): string {
    const lm = session.lastMessage;
    if (!lm) return '';
    if (lm.senderType === 'client') return session.clientName || 'Cliente';
    if (lm.senderName === 'Asistente Virtual') return 'IA';
    return lm.senderName || 'Agente';
  }

  /** Texto del preview: adjunto o contenido del último mensaje. */
  previewText(session: Session): string {
    const lm = session.lastMessage;
    if (!lm) return 'Sin mensajes';
    if (lm.attachments && lm.attachments.length > 0) {
      return lm.attachments.length === 1
        ? '\uD83D\uDCCE Adjunto'
        : `\uD83D\uDCCE ${lm.attachments.length} adjuntos`;
    }
    return lm.content || '';
  }

  /** Hora relativa según el último mensaje (o creación si no hay mensajes). */
  recentTime(session: Session): string {
    const t = session.lastMessage?.createdAt ?? session.createdAt;
    return this.relativeTime(t);
  }

  get activeAdvisorName(): string {
    return this.activeSession?.advisor?.name || 'Sin agente';
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
    return (
      this.activeSession.advisor?.id !== this.currentAdvisor.id &&
      this.collaboratorSessions.has(this.activeSession.id)
    );
  }

  /** Chat activo de otro asesor visto en solo lectura (no soy dueño ni apoyo). */
  get isReadOnlyView(): boolean {
    if (!this.activeSession || !this.currentAdvisor) return false;
    const s = this.activeSession;
    if (s.status !== 'active') return false;
    if (this.currentAdvisor.role === 'admin') return false;
    if (s.advisor?.id === this.currentAdvisor.id) return false;
    return !this.collaboratorSessions.has(s.id);
  }

  get canSendMessage(): boolean {
    if (!this.activeSession) return false;
    const s = this.activeSession;
    if (s.status === 'closed') return false;
    if (this.currentAdvisor?.role === 'admin') return true;
    if (s.advisor?.id === this.currentAdvisor?.id) return true;
    if (s.status === 'ai' || s.status === 'waiting' || !s.advisor) return true;
    return this.collaboratorSessions.has(s.id);
  }

  get slashFiltered(): Array<{ name: string; content: string }> {
    const q = this.slashQuery.toLowerCase();
    return this.configQuickReplies.filter(r =>
      r.name.toLowerCase().includes(q)
    );
  }

  get visibleQuickReplies(): Array<{ name: string; content: string }> {
    return this.configQuickReplies.slice(0, 3);
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
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentAdvisor = u;
      this.cdr.detectChanges();
    });
    this.loadSessions();
    this.loadAdvisors();

    this.configService.getQuickRepliesConfig().subscribe({
      next: (replies) => {
        this.configQuickReplies = this.normalizeQuickReplies(replies);
        this.cdr.detectChanges();
      },
      error: () => {
        this.configQuickReplies = this.normalizeQuickReplies(undefined);
        this.cdr.detectChanges();
      }
    });

    const savedStatus = localStorage.getItem('advisor_status') ?? 'online';
    this.socket.emit('set_advisor_status', savedStatus);
    this.socket.emit('advisor_ready');

    this.registerSocketEvents();

    // ── Compact mode (barra de avatares) ───────────────────────────────────
    this.checkCompact();
    this.resizeObserver = new ResizeObserver(() => this.checkCompact());
    this.resizeObserver.observe(document.body);
    


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
      this.loadSessionsForRole().subscribe({
        next: (sessions) => {
          this.sessions = sessions;
          sessions.filter(s => s.status === 'active' || s.status === 'waiting')
                  .forEach(s => this.joinRoom(s.id));
          const joined = sessions.find(s => s.id === sessionId);
          if (joined) {
            this.joinSession(joined);
          } else {
            // Puede ser un chat de otro asesor al que entramos por apoyo.
            // Se abre sin contaminar la lista propia.
            this.sessionService.findOne(sessionId).subscribe({
              next: (s) => {
                if (this.isMineOrQueue(s)) this.mergeSession(s);
                this.collaboratorSessions.add(s.id);
                this.joinRoom(s.id);
                this.joinSession(s);
              },
              error: () => this.cdr.detectChanges(),
            });
          }
          this.cdr.detectChanges();
        },
        error: (err) => console.error('HTTP Error:', err),
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
        // Marcamos esta sesión como "apoyo" (puede escribir en chats de otros)
        this.collaboratorSessions.add(data.sessionId);
        // Recargar lista para incluir el nuevo chat
          this.loadSessions();
          this.sessionService.findOne(data.sessionId).subscribe({
            next: (joined) => {
              if (this.isMineOrQueue(joined)) this.mergeSession(joined);
              this.joinRoom(joined.id);
              this.joinSession(joined);
              this.cdr.detectChanges();
            },
            error: (err) => console.error('HTTP Error:', err),
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
        this.updateSessionPreview(sessionId, msg);

        if (msg.senderType === 'client') {
          if (this.activeSession?.id === sessionId) {
            this.state.setUnread(sessionId, 0);
            if (document.visibilityState === 'visible') {
              this.socket.emit('set_active', { sessionId, active: true });
            }
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

    this.socket.on<{ sessionId: string; readBy: string }>('messages_read')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!data?.sessionId || data.readBy !== 'client') return;
        this.state.markRead(data.sessionId, 'advisor');
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; senderType: string }>('message_delivered')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!data?.sessionId || data.senderType !== 'advisor') return;
        this.state.markDelivered(data.sessionId, 'advisor');
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
    this.collaboratorSessions.delete(sessionId);
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
    this.socket.emit('join_session', { sessionId });
    if (this.state.isJoined(sessionId)) return;
    this.state.markJoined(sessionId);
    this.state.setMessages(sessionId, []);
  }

  /** Actualiza el preview (último mensaje) de la sesión en la lista compartida. */
  private updateSessionPreview(sessionId: string, msg: any): void {
    const idx = this.sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;
    const updated = {
      ...this.sessions[idx],
      lastMessage: {
        id: msg.id,
        content: msg.content,
        senderType: msg.senderType,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        attachments: msg.attachments ?? undefined,
      },
    };
    this.sessions = [...this.sessions];
    this.sessions[idx] = updated;
    this.cdr.detectChanges();
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
    this.loadSessions();
    this.cdr.detectChanges();
  }

  // ── Supervisor: tomar chat de otro asesor ─────────────────────────────────
  // ── Carga de datos ────────────────────────────────────────────────────────
  private loadSessionsForRole(): Observable<Session[]> {
    return this.currentAdvisor?.role === 'admin'
      ? this.sessionService.findAllAdmin()
      : this.sessionService.findAllMine();
  }

  private mergeSession(session: Session): void {
    const idx = this.sessions.findIndex(s => s.id === session.id);
    this.sessions = idx === -1
      ? [session, ...this.sessions]
      : this.sessions.map((s, i) => (i === idx ? session : s));
  }

  loadSessions(openSessionId = ''): void {
    this.loadSessionsForRole().subscribe({
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
    this.sessionService.findAdvisors().subscribe({
      next: (a) => {
        this.advisors = a.filter(x => x.id !== this.currentAdvisor?.id);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
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
    this.imagePreview     = null;
    this.state.setActiveSession(session.id);
    this.state.setUnread(session.id, 0);

    this.joinRoom(session.id);

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
    this.imagePreview  = null;
    this.state.setActiveSession(null);
    this.cdr.detectChanges();
  }

  // ── Cerrar sesión ─────────────────────────────────────────────────────────
  closeSession(): void {
    if (!this.activeSession) return;
    const sessionId = this.activeSession.id;
    this.socket.emit('close_session', sessionId);
    this.clearSession(sessionId);
    const idx = this.sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) this.sessions[idx] = { ...this.sessions[idx], status: 'closed' };
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

  handleKey(event: KeyboardEvent): void {
    if (this.showSlashMenu) {
      if (event.key === 'Tab') {
        event.preventDefault();
        const match = this.slashFiltered[this.slashHighlight] ?? this.slashFiltered[0];
        if (match) this.selectSlashReply(match);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!this.slashFiltered.length) return;
        this.slashHighlight = (this.slashHighlight + 1) % this.slashFiltered.length;
        const item = this.slashFiltered[this.slashHighlight];
        this.ghostSuggestion = item ? item.content.slice(this.slashQuery.length) : '';
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!this.slashFiltered.length) return;
        this.slashHighlight =
          (this.slashHighlight - 1 + this.slashFiltered.length) % this.slashFiltered.length;
        const item = this.slashFiltered[this.slashHighlight];
        this.ghostSuggestion = item ? item.content.slice(this.slashQuery.length) : '';
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const selected = this.slashFiltered[this.slashHighlight];
        if (selected) this.selectSlashReply(selected);
        return;
      }
      if (event.key === 'Escape') {
        this.showSlashMenu = false;
        this.ghostSuggestion = '';
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private resizeInput(): void {
    const el = this.msgInput?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  onInputChange(): void {
    this.resizeInput();
    this.onTyping();
    const text = this.newMessage;
    const slashIdx = text.lastIndexOf('/');
    if (slashIdx === -1) {
      this.showSlashMenu = false;
      this.slashQuery = '';
      this.ghostSuggestion = '';
      return;
    }

    this.slashQuery = text.slice(slashIdx + 1).toLowerCase();
    this.showSlashMenu = true;
    this.slashHighlight = 0;
    const match = this.configQuickReplies.find(r =>
      r.name.toLowerCase().startsWith(this.slashQuery) && this.slashQuery.length > 0
    );
    this.ghostSuggestion = match ? match.name.slice(this.slashQuery.length) : '';
  }

  selectSlashReply(reply: { name: string; content: string }): void {
    const slashIdx = this.newMessage.lastIndexOf('/');
    this.newMessage = slashIdx >= 0
      ? this.newMessage.slice(0, slashIdx) + reply.content
      : reply.content;
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
  }

  useQuickReply(reply: { name: string; content: string }): void {
    this.newMessage = reply.content;
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
  }

  formatPreview(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
  }

  private normalizeQuickReplies(value?: any[]): Array<{ name: string; content: string }> {
    const fallback: Array<{ name: string; content: string }> = [
      { name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
      { name: 'Espera', content: 'Dame un momento mientras valido la informacion.' },
      { name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
    ];
    if (!Array.isArray(value) || !value.length) return fallback;

    if (typeof value[0] === 'string') {
      return value
        .map((text: string) => ({ name: text.trim().slice(0, 60), content: text.trim() }))
        .filter(r => r.content);
    }

    return value
      .filter((r: any) => r?.name && r?.content)
      .map((r: any) => ({ name: String(r.name).slice(0, 60), content: String(r.content).slice(0, 500) }));
  }

  // ── File handling ──────────────────────────────────────────────────────────
  triggerFileInput(): void {
    this.advisorFileInput?.nativeElement?.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    for (const file of Array.from(input.files)) {
      const error = this.chatMedia.validate(file);
      if (error) {
        this.notification.error('Archivo no permitido', error);
        continue;
      }

      const normalized = await normalizeUploadFile(file);
      const entry: typeof this.previewFiles[0] = { file: normalized, preview: null, uploading: false, error: null };

      if (this.chatMedia.isImage(normalized.type)) {
        const reader = new FileReader();
        reader.onload = () => { entry.preview = reader.result as string; this.cdr.detectChanges(); };
        reader.readAsDataURL(normalized);
      }

      this.previewFiles.push(entry);
    }

    input.value = '';
    this.cdr.detectChanges();
  }

  onChatPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;

    event.preventDefault();
    for (const file of files) {
      const error = this.chatMedia.validate(file);
      if (error) {
        this.notification.error('Archivo no permitido', error);
        continue;
      }
      void normalizeUploadFile(file).then((normalized) => {
        const entry: typeof this.previewFiles[0] = { file: normalized, preview: null, uploading: false, error: null };
        if (this.chatMedia.isImage(normalized.type)) {
          const reader = new FileReader();
          reader.onload = () => { entry.preview = reader.result as string; this.cdr.detectChanges(); };
          reader.readAsDataURL(normalized);
        }
        this.previewFiles.push(entry);
        this.cdr.detectChanges();
      });
    }
  }

  onVoiceFileReady(result: VoiceRecordingResult): void {
    this.previewFiles.push({ file: result.file, preview: null, uploading: false, error: null });
    this.cdr.detectChanges();
  }

  onVoiceRecordingChange(recording: boolean): void {
    this.isRecordingAudio = recording;
    this.cdr.detectChanges();
  }

  onVoiceError(message: string): void {
    this.notification.error('Nota de voz', message);
  }

  removePreview(index: number): void {
    this.previewFiles.splice(index, 1);
    this.cdr.detectChanges();
  }

  private async uploadPendingFiles(): Promise<Attachment[]> {
    if (this.previewFiles.length === 0) return [];

    const uploads = this.previewFiles.map(async (entry) => {
      entry.uploading = true;
      entry.error = null;
      this.cdr.detectChanges();

      try {
        return await new Promise<Attachment>((resolve, reject) => {
          this.chatMedia.upload(entry.file).subscribe({ next: resolve, error: reject });
        });
      } catch (err: any) {
        entry.error = err?.error?.message || 'Error al subir';
        entry.uploading = false;
        this.cdr.detectChanges();
        return null;
      }
    });

    const results = await Promise.all(uploads);
    this.previewFiles = this.previewFiles.filter(e => e.error);
    this.cdr.detectChanges();
    return results.filter((a): a is Attachment => a !== null);
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  async send(): Promise<void> {
    const hasText = this.newMessage.trim().length > 0;
    const hasFiles = this.previewFiles.length > 0;
    if ((!hasText && !hasFiles) || !this.activeSession || !this.canSendMessage) return;

    const sessionId = this.activeSession.id;
    if (this.typingTimeouts.has(sessionId)) {
      clearTimeout(this.typingTimeouts.get(sessionId));
      this.typingTimeouts.delete(sessionId);
    }
    if (this.isTyping) {
      this.isTyping = false;
      this.socket.emit('typing_stop', sessionId);
    }

    let attachments: Attachment[] = [];
    if (hasFiles) {
      attachments = await this.uploadPendingFiles();
    }

    const formatted = this.newMessage.trim()
      .replace(/\*\*(.+?)\*\*/g, '*$1*');

    this.socket.emit('send_message', {
      sessionId,
      content: formatted,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    this.newMessage = '';
    this.resizeInput();
    this.showSlashMenu = false;
    this.ghostSuggestion = '';
  }

  toggleImprovePanel(): void {
    if (!this.newMessage.trim()) return;
    this.showImprovePanel = !this.showImprovePanel;
    if (this.showImprovePanel) this.backToImproveTones();
  }

  selectImproveTone(tone: string): void {
    this.improveTone = tone;
    this.improveStep = 'tones';
    this.improveVariants = [];
    this.improveVariantIndex = -1;
  }

  get improveToneLabel(): string {
    return (
      this.improveTones.find(t => t.id === this.improveTone)?.label ??
      this.improveTone
    );
  }

  closeImprovePanel(): void {
    this.showImprovePanel = false;
    this.improveStep = 'tones';
  }

  backToImproveTones(): void {
    this.improveStep = 'tones';
    this.improveVariants = [];
    this.improveVariantIndex = -1;
  }

  async generateImprovedText(): Promise<void> {
    const draft = this.newMessage.trim();
    if (!draft || this.isImproving || !this.activeSession) return;

    this.isImproving = true;
    this.cdr.detectChanges();
    try {
      const res = await firstValueFrom(
        this.aiService.improveWhatsappDraft({
          draft,
          clientName: this.activeSession.clientName,
          institution: this.activeSession.colegio,
          role: this.activeSession.rol,
          tone: this.improveTone,
        }),
      );
      const variants = (res.replies ?? [])
        .map(v => (v ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      if (variants.length) {
        this.improveVariants = variants;
        this.improveVariantIndex = -1;
        this.improveStep = 'variants';
      } else {
        this.notification.error(
          'Error de IA',
          'No se pudo generar opciones, intenta de nuevo.',
        );
      }
    } catch {
      this.notification.error(
        'Error de IA',
        'No se pudo generar opciones, intenta de nuevo.',
      );
    } finally {
      this.isImproving = false;
      this.cdr.detectChanges();
    }
  }

  selectImproveVariant(index: number): void {
    const text = this.improveVariants[index];
    if (!text) return;
    this.improveVariantIndex = index;
    this.newMessage = text.slice(0, 1000);
    this.resizeInput();
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
    this.msgInput?.nativeElement.focus();
    this.notification.success(
      'Mensaje mejorado',
      'El texto se reemplazo por la opcion seleccionada.',
    );
    this.closeImprovePanel();
  }

  async aiInsight(): Promise<void> {
    if (this.isAiInsightLoading || !this.activeSession) return;
    this.isAiInsightLoading = true;
    try {
      let history: Message[] = [];
      try {
        history = await firstValueFrom(
          this.sessionService.getMessages(this.activeSession.id, 1000),
        );
      } catch {
        history = this.messages;
      }
      const msgs = history
        .filter(m => m.senderName !== 'Sistema')
        .map(m => ({
          fromMe: m.senderType === 'advisor',
          body: m.content,
          time: m.createdAt,
        }));
      if (!msgs.length) {
        this.aiInsightText = 'No hay mensajes para analizar.';
        return;
      }
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

  get parsedAiInsightSections(): { label: string; text: string }[] {
    const text = this.aiInsightText || '';
    const sections: { label: string; text: string }[] = [];
    let current: { label: string; text: string } | null = null;
    for (const line of text.split('\n')) {
      const m = line.match(/^\*\*(.+?)\*\*\s*:\s*(.*)$/);
      if (m) {
        current = { label: m[1].trim(), text: m[2] };
        sections.push(current);
      } else if (current && line.trim()) {
        current.text += (current.text ? '\n' : '') + line;
      }
    }
    return sections.length ? sections : [{ label: 'Analisis', text }];
  }

  get aiInsightPreview(): string {
    const sections = this.parsedAiInsightSections;
    const target =
      sections.find(s => /de que trata|situacion/i.test(s.label)) ??
      sections[0];
    const text = (target?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Analisis pendiente.';
    return text.length > 150 ? `${text.slice(0, 150).trim()}...` : text;
  }

  openImagePreview(src: string, name: string): void {
    this.imagePreview = { src, name };
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
    this.isMediaDragging = false;
  }

  closeImagePreview(): void {
    this.imagePreview = null;
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
    this.isMediaDragging = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showImprovePanel) { this.closeImprovePanel(); return; }
    if (this.imagePreview) this.closeImagePreview();
  }

  onMediaWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const ratioX = (mouseX - centerX) / centerX;
    const ratioY = (mouseY - centerY) / centerY;
    const newZoom = Math.max(0.25, Math.min(10, this.mediaZoom + delta));
    const scale = newZoom / this.mediaZoom;
    this.mediaPanX = ratioX * (centerX * (1 - scale)) + this.mediaPanX * scale;
    this.mediaPanY = ratioY * (centerY * (1 - scale)) + this.mediaPanY * scale;
    this.mediaZoom = newZoom;
    this.clampMediaPan();
  }

  onMediaMouseDown(event: MouseEvent): void {
    if (this.mediaZoom <= 1) return;
    this.isMediaDragging = true;
    this.mediaDragStartX = event.clientX;
    this.mediaDragStartY = event.clientY;
    this.mediaDragPanX = this.mediaPanX;
    this.mediaDragPanY = this.mediaPanY;
  }

  onMediaMouseMove(event: MouseEvent): void {
    if (!this.isMediaDragging) return;
    this.mediaPanX = this.mediaDragPanX + (event.clientX - this.mediaDragStartX);
    this.mediaPanY = this.mediaDragPanY + (event.clientY - this.mediaDragStartY);
    this.clampMediaPan();
  }

  onMediaMouseUp(): void {
    this.isMediaDragging = false;
  }

  onMediaDblClick(event: MouseEvent): void {
    event.preventDefault();
    if (this.mediaZoom > 1.5) {
      this.mediaZoom = 1;
      this.mediaPanX = 0;
      this.mediaPanY = 0;
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const newZoom = 3;
      const scale = newZoom / (this.mediaZoom || 1);
      this.mediaPanX = ((mouseX - centerX) / centerX) * (centerX * (1 - scale)) + this.mediaPanX * scale;
      this.mediaPanY = ((mouseY - centerY) / centerY) * (centerY * (1 - scale)) + this.mediaPanY * scale;
      this.mediaZoom = newZoom;
    }
    this.clampMediaPan();
  }

  onMediaTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isMediaDragging = true;
      this.mediaDragStartX = event.touches[0].clientX;
      this.mediaDragStartY = event.touches[0].clientY;
      this.mediaDragPanX = this.mediaPanX;
      this.mediaDragPanY = this.mediaPanY;
    } else if (event.touches.length === 2) {
      this.isMediaDragging = false;
      this.mediaPinchDist = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
    }
  }

  onMediaTouchMove(event: TouchEvent): void {
    event.preventDefault();
    if (event.touches.length === 1 && this.isMediaDragging) {
      this.mediaPanX = this.mediaDragPanX + (event.touches[0].clientX - this.mediaDragStartX);
      this.mediaPanY = this.mediaDragPanY + (event.touches[0].clientY - this.mediaDragStartY);
      this.clampMediaPan();
    } else if (event.touches.length === 2) {
      const dist = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      const delta = (dist - this.mediaPinchDist) * 0.01;
      this.mediaZoom = Math.max(0.25, Math.min(10, this.mediaZoom + delta));
      this.mediaPinchDist = dist;
      this.clampMediaPan();
    }
  }

  onMediaTouchEnd(): void {
    this.isMediaDragging = false;
  }

  private clampMediaPan(): void {
    const img = this.mediaImage?.nativeElement;
    const box = img?.parentElement;
    if (!img || !box) return;
    const zoom = this.mediaZoom;
    const maxX = img.offsetWidth * zoom > box.clientWidth
      ? (img.offsetWidth * zoom - box.clientWidth) / (2 * zoom)
      : 0;
    const maxY = img.offsetHeight * zoom > box.clientHeight
      ? (img.offsetHeight * zoom - box.clientHeight) / (2 * zoom)
      : 0;
    this.mediaPanX = Math.min(Math.max(this.mediaPanX, -maxX), maxX);
    this.mediaPanY = Math.min(Math.max(this.mediaPanY, -maxY), maxY);
  }

  formatMessage(text: string): SafeHtml {
    if (!text) return '';
    const html = this.escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(
        /link:((https?:\/\/|www\.)[^\s<]+)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(
        /(?<!href="|src=")((https?:\/\/|www\.)[^\s<]+)/g,
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
    this.ticketService.getCategories().subscribe({
      next: (cats) => {
        this.ticketCategories = cats;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
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
        const advisorName = this.currentAdvisor?.name || 'Agente';
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

  // ── Relative time (recent chats) ────────────────────────────────────────
  relativeTime(dateStr?: string | null): string {
    if (!dateStr) return '';
    return relativeTime(dateStr);
  }

  // ── Date separators ─────────────────────────────────────────────────────
  showDateSeparator(index: number): boolean {
    if (index === 0) return true;
    return !sameBogotaDay(
      this.messages[index].createdAt,
      this.messages[index - 1].createdAt,
    );
  }

  dateSeparatorLabel(dateStr: string): string {
    if (isTodayBogota(dateStr)) return 'Hoy';
    if (isYesterdayBogota(dateStr)) return 'Ayer';
    const d = new Date(dateStr);
    const b = d.getTime() - 5 * 3600000;
    const bogota = new Date(b);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    return `${days[bogota.getUTCDay()]} ${bogota.getUTCDate()} ${months[bogota.getUTCMonth()]}`;
  }

  // ── Navigate to history ─────────────────────────────────────────────────
  navigateToHistory(): void {
    this.router.navigate(['/dashboard/history']);
  }

  // ── Scroll ────────────────────────────────────────────────────────────────
  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        scrollToBottom(this.messagesContainer.nativeElement);
      }
    }, 50);
  }

  // ── Compact mode check ───────────────────────────────────────────────────
  private checkCompact(): void {
    const compact = window.innerWidth <= 900;
    if (compact !== this.compactList) {
      this.compactList = compact;
      this.cdr.detectChanges();
    }
  }

  // ── Destroy ───────────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    this.state.setActiveSession(null);
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.typingTimeouts.forEach(t => clearTimeout(t));
    this.typingTimeouts.clear();
  }
}
