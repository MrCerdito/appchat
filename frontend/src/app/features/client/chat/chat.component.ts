import {
  Component, OnInit, OnDestroy, ViewChild,
  ElementRef, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../core/services/socket.service';
import { SessionService, Colegio } from '../../../core/services/session.service';
import { SoundService } from '../../../core/services/sound.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ChatMediaService } from '../../../core/services/chat-media.service';
import { Message, Attachment } from '../../../core/models/message.model';
import { Session } from '../../../core/models/session.model';
import { AiService, AiMessage, AiResponse } from '../../../core/services/ai.service';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { trackByIndex, trackById } from '../../../shared/utils/track-by';
import { scrollToBottom } from '../../../shared/utils/scroll';
import { FaqComponent } from '../faq/faq.component';
import { PqrsComponent } from '../pqrs/pqrs.component';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';
import {
  VoiceRecorderComponent,
  VoiceRecordingResult,
} from '../../../shared/components/voice-recorder/voice-recorder.component';
import { VoicePlayerComponent } from '../../../shared/components/voice-player/voice-player.component';


// ─────────────────────────────────────────────────────────────────────────────
// Claves de localStorage — persisten la sesión entre recargas de página.
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_KEY     = 'chat_session';
const CLIENT_NAME_KEY = 'chat_client_name';
const AI_HISTORY_KEY  = 'chat_ai_history';
const AI_MESSAGES_KEY = 'chat_ai_messages';

interface TimerUpdatePayload {
  sessionId : string;
  tipo      : 'advisor_waiting' | 'client_waiting' | 'closing';
  total     : number;
  elapsed   : number;
  mensaje   : string;
  iteracion : number;
  maxIter   : number;
}

@Component({
  selector   : 'app-chat',
  standalone : true,
  imports    : [
    CommonModule, FormsModule, FaqComponent, PqrsComponent, ToastContainerComponent,
    VoiceRecorderComponent, VoicePlayerComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl   : './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO GENERAL
  // ══════════════════════════════════════════════════════════════════════════

  step: 'faq' | 'name' | 'pqrs' | 'waiting' | 'chat' | 'rating' | 'blocked' = 'faq';
  aiMode    = true;
  aiHistory : AiMessage[] = [];
  private bienvenidaIa = '';
  aiTyping  = false;
  ofertasAsesorPendientes  = new Set<number>();
  ofertasAsesorRespondidas = new Map<number, boolean>();
  mostrarConfirmCierre    = false;
  mostrarAsesoresOcupados = false;
  reconexionActiva = false;
  reconexionMensaje = '';
  reconexionSegundos = 0;
  private reconexionInterval: any = null;
  Math = Math;
  
  marcaChat = 'Soporte en línea';

  pqrsCodigo = '';
  showPqrsSuccess = false;


  // ── SSE Streaming ──────────────────────────────────────────────────────────
streamingText    = '';
isStreaming      = false;
streamDocumentos : any[] = [];
private streamSub: any;



  // ══════════════════════════════════════════════════════════════════════════
  // FORMULARIO
  // ══════════════════════════════════════════════════════════════════════════

  clientName     = '';
  identificacion = '';
  apellido       = '';
  rol            = '';
  colegio        = '';
  colegioLink    = '';
  tipoSolicitud  = '';
  submitted      = false;

  // ══════════════════════════════════════════════════════════════════════════
  // JORNADA LABORAL
  // ══════════════════════════════════════════════════════════════════════════

  fueraDeHorario      = false;
  horarioHoySlots     : { dia: number; inicio: string; fin: string }[] = [];
  diaHoy              = 0;
  mensajeFueraHorario = '';
  proximaApertura     = '';
  horaApertura        = '';
  proximaTipo         : 'hoy' | 'manana' | 'fecha' | '' = '';
  proximaDia          = -1;
  proximaInicio       = '';
  private horarioPollInterval: any = null;
  readonly nombresDias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  readonly rolesLabels: Record<string, string> = {
  estudiante: 'Estudiante',
  docente    : 'Docente',
  padre      : 'Padre / Madre',
  admin      : 'Administrativo',
};

get rolLabel(): string {
  return this.rolesLabels[this.rol] ?? this.rol;
}

  // ══════════════════════════════════════════════════════════════════════════
  // COLEGIOS
  // ══════════════════════════════════════════════════════════════════════════

  colegios            : Colegio[] = [];
  colegiosFiltrados   : Colegio[] = [];
  colegioQuery        = '';
  colegioSeleccionado : Colegio | null = null;
  showDropdown        = false;

  // ══════════════════════════════════════════════════════════════════════════
  // MENSAJES Y SESIÓN
  // ══════════════════════════════════════════════════════════════════════════

  newMessage  = '';
  messages    : Message[] = [];
  session     : Session | null = null;
  codigoSesion = '';
  codigoCopiado = false;
  advisorName = '';
  advisorPhotoUrl = '';
  otherTyping = false;
  typingName  = '';
  private typingTimer : any;
  private isTyping    = false;

  // ══════════════════════════════════════════════════════════════════════════
  // ARCHIVOS ADJUNTOS
  // ══════════════════════════════════════════════════════════════════════════

  previewFiles: { file: File; preview: string | null; uploading: boolean; error: string | null }[] = [];
  pendingAttachments: Attachment[] = [];
  pendingTransferText = '';
  isRecordingAudio = false;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Image lightbox
  imagePreview: { src: string; name: string } | null = null;

  // ══════════════════════════════════════════════════════════════════════════
  // RATING
  // ══════════════════════════════════════════════════════════════════════════

  ratingEstrellas  = 0;
  ratingHover      = 0;
  ratingComentario = '';
  ratingEtiquetas  : string[] = [];
  ratingEnviado    = false;
  private sessionIdParaRating : string | null = null;

  readonly etiquetasDisponibles = [
    'Rápido', 'Amable', 'Claro', 'Muy útil', 'Profesional', 'Paciente',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // COLA DE ESPERA
  // ══════════════════════════════════════════════════════════════════════════

  queuePosition : number       = -1;
  queueTotal    : number | null = null;
  waitingElapsed = 0;
  estimatedWaitSecs = 0;
  private waitingTimer : any;
  private waitingTickTimer : any;
  clientTimer: {
    tipo: TimerUpdatePayload['tipo'];
    restante: number;
    total: number;
    pct: number;
    mensaje: string;
    iteracion: number;
    maxIter: number;
  } | null = null;

  // ══════════════════════════════════════════════════════════════════════════
  // ENCUESTA INTERMEDIA
  // ══════════════════════════════════════════════════════════════════════════

  encuestasRespondidas : Map<number, boolean> = new Map();
  encuestasPendientes  : Set<number>          = new Set();
  private aiMsgCount   = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // TIMER DE INACTIVIDAD (modo IA)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Flujo:
  //   Minuto 0  → cliente abre chat, timer arranca.
  //   Escribe   → timer se reinicia completamente desde cero.
  //   Minuto 2  → aparece overlay con barra regresiva de 60s.
  //   Escribe   → overlay desaparece, timer reinicia.
  //   Minuto 3  → cierre automático de la sesión.
  //
  // Tres timers separados para poder cancelarlos individualmente:
  //   inactividadIaAviso$ → setTimeout para mostrar el overlay (min 2)
  //   inactividadIaTick   → setInterval que decrementa el contador visual
  //   inactividadIaTimer  → setTimeout para cerrar la sesión (min 3)

  private inactividadIaTimer  : any = null;
  private inactividadIaAviso$ : any = null;
  private inactividadIaTick   : any = null;
  inactividadIaAviso   = false; // visibilidad del overlay
  inactividadIaSegRest = 30;    // segundos restantes para la barra

  // ══════════════════════════════════════════════════════════════════════════
  // CONEXIÓN
  // ══════════════════════════════════════════════════════════════════════════

  isOnline = true;
  private onlineHandler  = () => this.handleOnline();
  private offlineHandler = () => this.handleOffline();
  private visibilityHandler = () => this.handleVisibilityChange();

  /**
   * Kill switch para todos los listeners de Socket.IO.
   * Al emitir .next(), todos los takeUntil(socketDestroy$) se cancelan
   * simultáneamente, evitando listeners duplicados y memory leaks.
   */
  private socketDestroy$ = new Subject<void>();

  constructor(
    private socket        : SocketService,
    private sessionService: SessionService,
    private cdr           : ChangeDetectorRef,
    private sound         : SoundService,
    private aiService     : AiService,
    private http          : HttpClient,
    private notification  : NotificationService,
    private chatMedia     : ChatMediaService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.aplicarTemaWidget();
    this.escucharPostMessage();
    this.solicitarPermisoNotificacion();
    this.isOnline = navigator.onLine;
    window.addEventListener('online',  this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.verificarJornada();

    // Re-chequea el horario periódicamente para que el widget se
    // actualice solo cuando el admin guarda cambios o inicia la jornada.
    this.horarioPollInterval = setInterval(() => this.verificarJornada(), 30_000);

    this.sessionService.getColegios().subscribe({
      next: (c) => {
        this.colegios = c.map(co => ({ ...co, nombre: this.sanitizeText(co.nombre), link: this.sanitizeText(co.link) }));
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    const savedSession = localStorage.getItem(SESSION_KEY);
    const savedName    = localStorage.getItem(CLIENT_NAME_KEY);

    if (savedSession && savedName) {
      const savedData = JSON.parse(savedSession) as Session & { aiMode?: boolean };
      this.clientName = savedName;

      this.sessionService.findPublic(savedData.id).subscribe({
        next: (s) => {
          if (s.status === 'closed') { this.clearSession(); return; }

          const advisor = s.advisor ?? savedData.advisor;
          this.session  = { ...savedData, ...s, advisor };

          if (savedData.aiMode === true) {
            this.aiMode = true;
            this.fueraDeHorario = false;
            const savedHistory  = localStorage.getItem(AI_HISTORY_KEY);
            const savedMessages = localStorage.getItem(AI_MESSAGES_KEY);
            this.aiHistory  = savedHistory  ? JSON.parse(savedHistory)  : [];
            this.messages   = savedMessages ? JSON.parse(savedMessages) : [];
            this.aiMsgCount = this.messages.filter(m => m.senderType === 'advisor').length;
            this.colegio       = (s as any).colegio       ?? '';
            this.tipoSolicitud = (s as any).tipoSolicitud ?? '';
            localStorage.setItem(SESSION_KEY, JSON.stringify({ ...this.session, aiMode: true }));
            this.step = 'chat';
            this.iniciarTimerInactividadIa();
            this.cdr.detectChanges();
            this.scrollToBottom();
            return;
          }

          this.aiMode = false;
          localStorage.setItem(SESSION_KEY, JSON.stringify({ ...this.session, aiMode: false }));

          if (s.status === 'active' && advisor) {
            this.advisorName = (advisor as any).name;
            this.fueraDeHorario = false;
            this.step = 'chat';
          } else {
            this.step = 'waiting';
            this.startWaitingTimer();
          }

          this.connectSocket();
          this.cdr.detectChanges();
        },
        error: () => {
          this.notification.error('Error', 'No se pudo recuperar tu sesión anterior');
          this.clearSession();
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // JORNADA LABORAL
  // ══════════════════════════════════════════════════════════════════════════

  private verificarJornada(): void {
    this.sessionService.getHorarioHoy().subscribe({
      next: (res) => {
        this.diaHoy              = res.diaHoy;
        this.horarioHoySlots     = res.horarios ?? [];
        this.mensajeFueraHorario = res.mensaje ?? '';
        this.proximaApertura     = res.proximaApertura ?? '';
        this.horaApertura        = res.horaApertura ?? '';
        this.proximaTipo         = res.proximaTipo ?? '';
        this.proximaDia          = res.proximaDia ?? -1;
        this.proximaInicio       = res.proximaInicio ?? '';
        // No interrumpir una conversación activa: el overlay solo aplica si no hay sesión.
        if (!this.session) {
          this.fueraDeHorario = !res.enJornada;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.notification.error('Error', 'No se pudo verificar el horario de atención');
      },
    });
  }

  get textoProximaApertura(): string {
    if (this.proximaTipo === 'hoy') {
      return `hoy a las ${this.formatoHora12(this.proximaInicio)}`;
    }
    if (this.proximaTipo === 'manana') {
      return `mañana a las ${this.formatoHora12(this.proximaInicio)}`;
    }
    if (this.proximaTipo === 'fecha' && this.proximaDia >= 0) {
      return `el ${this.nombresDias[this.proximaDia]} a las ${this.formatoHora12(this.proximaInicio)}`;
    }
    return '';
  }

  formatoHora12(hora: string): string {
    if (!hora) return '';
    const [h, m] = hora.split(':').map(Number);
    if (Number.isNaN(h)) return hora;
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'a. m.' : 'p. m.';
    return `${h12}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
  }

  get mensajeFueraHorarioParts(): { intro: string; items: string[] } {
    const msg    = this.mensajeFueraHorario ?? '';
    const sepIdx = msg.indexOf('es:');
    if (sepIdx === -1) return { intro: msg, items: [] };
    const intro = msg.slice(0, sepIdx + 3).trim();
    const resto = msg.slice(sepIdx + 3).trim();
    const items = resto
      .split(/\.\s+(?=[A-ZÁÉÍÓÚ])|\.\s*$/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return { intro, items };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMER DE INACTIVIDAD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Arranca el timer de inactividad de 3 minutos desde cero.
   * Cancela cualquier timer previo antes de crear uno nuevo.
   */
  private iniciarTimerInactividadIa(): void {
    this._limpiarTimersInactividad();

    const AVISO_MS   = 150 * 1000;
    const AVISO_SEGS = 30;
    const TOTAL_MS   = 180 * 1000;
  

    // Paso 1: mostrar overlay con barra regresiva.
    this.inactividadIaAviso$ = setTimeout(() => {
      if (!this.aiMode || this.step !== 'chat') {
        return;
      }
      this.inactividadIaAviso   = true;
      this.inactividadIaSegRest = AVISO_SEGS;
      this.cdr.detectChanges();

      // Decrementar 1 segundo cada tick.
      this.inactividadIaTick = setInterval(() => {
        if (this.inactividadIaSegRest > 0) {
          this.inactividadIaSegRest--;
          this.cdr.detectChanges();
        }
      }, 1000);

    }, AVISO_MS);

    // Paso 2: cerrar sesión definitivamente.
    this.inactividadIaTimer = setTimeout(() => {
      if (!this.aiMode || this.step !== 'chat') {
        return;
      }

      this._limpiarTimersInactividad();
      this.inactividadIaAviso = false;

      // Cerrar en backend (sin bloquear la redirección).
      if (this.session?.id) {
        this.sessionService.closeAnonymous(this.session.id).subscribe({
          next : () => undefined,
          error: () => undefined,
        });
      }

      // Mostrar mensaje de despedida.
      this.addAiMessage('model', 'La sesión se cerró automáticamente por inactividad. ¡Hasta pronto!');
      this.cdr.detectChanges();

      // Volver al formulario después de 2s.
      setTimeout(() => {
        this.clearSession();
      }, 2000);

    }, TOTAL_MS);
  }
  /** Solo limpia los timers sin tocar el estado visual. */
  private _limpiarTimersInactividad(): void {
    if (this.inactividadIaTimer)  { clearTimeout(this.inactividadIaTimer);  this.inactividadIaTimer  = null; }
    if (this.inactividadIaAviso$) { clearTimeout(this.inactividadIaAviso$); this.inactividadIaAviso$ = null; }
    if (this.inactividadIaTick)   { clearInterval(this.inactividadIaTick);  this.inactividadIaTick   = null; }
  }

  /** Cancela timers Y oculta el overlay. Usar siempre que el cliente muestre actividad. */
  private cancelarTimerInactividadIa(): void {
    this._limpiarTimersInactividad();
    this.inactividadIaAviso   = false;
    this.inactividadIaSegRest = 30;
  }

  /** Desde el botón "Seguir chateando" del overlay. */
  continuarChatIa(): void {
    this.cancelarTimerInactividadIa();
    this.iniciarTimerInactividadIa();
    this.cdr.detectChanges();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ONLINE / OFFLINE
  // ══════════════════════════════════════════════════════════════════════════

  private handleOffline(): void {
    this.isOnline = false;
    this.cdr.detectChanges();
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.cdr.detectChanges();
    if (this.session && !this.aiMode && (this.step === 'chat' || this.step === 'waiting')) {
      this.socket.connect();
      this.socket.emit('join_session', { sessionId: this.session.id, clientName: this.clientName });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLEGIOS
  // ══════════════════════════════════════════════════════════════════════════

  onColegioInput(): void {
    const q = this.colegioQuery.trim().toLowerCase();
    if (!q) { this.colegiosFiltrados = []; this.showDropdown = false; this.colegioSeleccionado = null; return; }
    this.colegiosFiltrados = this.colegios.filter(c => c.nombre.toLowerCase().includes(q)).slice(0, 8);
    this.showDropdown = true;
    const exactMatch = this.colegios.some(c => c.nombre.toLowerCase() === q);
    if (exactMatch) {
      const match = this.colegios.find(c => c.nombre.toLowerCase() === q)!;
      this.colegioSeleccionado = match;
      this.colegio = match.nombre;
      this.colegioLink = match.link;
    } else {
      this.colegioSeleccionado = null;
      this.colegio = this.colegioQuery.trim();
      this.colegioLink = '';
    }
  }

  onColegioBlur(): void {
    this.showDropdown = false;
    const q = this.colegioQuery.trim();
    if (q && !this.colegioSeleccionado) {
      this.colegio = q;
      this.colegioLink = '';
    }
  }

  selectColegio(c: Colegio): void {
    this.colegioSeleccionado = c;
    this.colegioQuery = c.nombre;
    this.colegio      = c.nombre;
    this.colegioLink  = c.link;
    this.showDropdown = false;
    this.cdr.detectChanges();
  }

  selectCustomColegio(): void {
    this.colegioSeleccionado = null;
    this.colegio = this.colegioQuery.trim();
    this.colegioLink = '';
    this.showDropdown = false;
    this.cdr.detectChanges();
  }

  clearColegio(): void {
    this.colegioSeleccionado = null;
    this.colegioQuery = '';
    this.colegio      = '';
    this.colegioLink  = '';
    this.showDropdown = false;
  }

  sanitizeText(str: string): string {
    if (!str) return '';
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.textContent || '';
  }

  onIdentificacionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/[^0-9]/g, '');
    if (input.value !== cleaned) {
      input.value = cleaned;
      this.identificacion = cleaned;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INICIO DEL CHAT
  // ══════════════════════════════════════════════════════════════════════════

  irAFormulario(): void {
    this.step = 'name';
  }

  irAFaq(): void {
    this.step = 'faq';
  }

  irAPqrs(): void {
    this.step = 'pqrs';
  }

  onPqrsEnviado(codigo: string): void {
    this.step = 'faq';
    this.pqrsCodigo = codigo;
    this.showPqrsSuccess = true;
    setTimeout(() => { this.showPqrsSuccess = false; this.cdr.detectChanges(); }, 5000);
    this.cdr.detectChanges();
  }

  startChat(): void {
    this.submitted = true;
    const valid = this.identificacion.trim() && this.clientName.trim() &&
      this.apellido.trim() && this.rol && this.colegio.trim() && this.tipoSolicitud;
    if (!valid) return;

    this.sessionService.create({
      clientName    : this.clientName.trim(),
      identificacion: this.identificacion.trim(),
      apellido      : this.apellido.trim(),
      rol           : this.rol,
      colegio       : this.colegio.trim(),
      colegioLink   : this.colegioLink || null,
      tipoSolicitud : this.tipoSolicitud,
    }).subscribe({
      next: (session) => {
  this.session = session;
  this.aiMode  = true;
  this.fueraDeHorario = false;
  this.step    = 'chat';

  this.sessionService.getCodigo(session.id).subscribe({
    next: (res) => {
      this.codigoSesion = res.codigo;
      this.cdr.detectChanges();
    },
    error: (err) => console.error('HTTP Error:', err),
  });

  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, aiMode: true }));
  localStorage.setItem(CLIENT_NAME_KEY, this.clientName);
  localStorage.removeItem(AI_HISTORY_KEY);
  localStorage.removeItem(AI_MESSAGES_KEY);

  // ★ Contexto inicial del usuario para que la IA siempre lo recuerde
  this.aiHistory = [{
    role: 'user',
    text: `[CONTEXTO] Mi nombre es ${this.clientName}, soy ${this.rolLabel} del colegio "${this.colegio}". Mi consulta es sobre: ${this.tipoSolicitud}.`
  }, {
    role: 'model',
    text: `Entendido. Hola ${this.clientName}, como ${this.rolLabel} del colegio "${this.colegio}", estoy aquí para ayudarte.`
  }];

  const bienvenida = `Hola ${this.clientName}, soy el asistente virtual. Estoy aquí para ayudarte con tu consulta sobre "${this.tipoSolicitud}". ¿En qué puedo ayudarte?`;
  this.bienvenidaIa = bienvenida;
  this.addAiMessage('model', bienvenida);
  this.iniciarTimerInactividadIa();
  this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CÓDIGO DE CASO
  // ══════════════════════════════════════════════════════════════════════════

  copiarCodigo(): void {
    if (!this.codigoSesion) return;
    navigator.clipboard.writeText(this.codigoSesion).then(() => {
      this.codigoCopiado = true;
      setTimeout(() => this.codigoCopiado = false, 2000);
    });
  }

  enviarCodigoWhatsApp(): void {
    const msg = encodeURIComponent(`Hola, mi código de caso es: ${this.codigoSesion}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICACIONES
  // ══════════════════════════════════════════════════════════════════════════

  private notificarMensaje(texto: string): void {
    const conteo = this.messages.filter(m => m.senderType === 'advisor' && !m.readAt).length;

    try {
      window.parent.postMessage({ type: 'unread_count', count: conteo }, '*');
    } catch (_) {}

    if (document.hidden || !document.hasFocus()) {
      document.title = `(${conteo}) Nuevo mensaje - ${this.marcaChat}`;
      setTimeout(() => document.title = this.marcaChat, 5000);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const preview = texto.length > 80 ? texto.slice(0, 80) + '…' : texto;
      new Notification('\u{1F4AC} Nuevo mensaje', {
        body: preview,
        icon: '/icon.jpg',
        tag: 'chat-message',
      });
    }
  }

  private solicitarPermisoNotificacion(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private escucharPostMessage(): void {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sian-theme') {
        const root = document.documentElement;
        const d = event.data;
        if (d.chatHeaderColor) { root.style.setProperty('--chat-header', d.chatHeaderColor); root.style.setProperty('--chat-header-text', getContrastColor(d.chatHeaderColor)); }
        if (d.chatBgColor) { root.style.setProperty('--chat-bg', d.chatBgColor); root.style.setProperty('--chat-bg-text', getContrastColor(d.chatBgColor)); }
        if (d.chatBubbleColor) { root.style.setProperty('--chat-bubble', d.chatBubbleColor); root.style.setProperty('--chat-bubble-text', getContrastColor(d.chatBubbleColor)); }
        if (d.chatBubbleUserColor) { root.style.setProperty('--chat-bubble-user', d.chatBubbleUserColor); root.style.setProperty('--chat-bubble-user-text', getContrastColor(d.chatBubbleUserColor)); }
        if (d.chatMarca) this.marcaChat = d.chatMarca;
        this.cdr.detectChanges();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SOCKET
  // ══════════════════════════════════════════════════════════════════════════

  private connectSocket(): void {
    this.socketDestroy$.next();
    this.socket.connect();

    this.socket.on<string>('connect')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe(() => {
        this.socket.emit('join_session', { sessionId: this.session!.id, clientName: this.clientName });
        if (this.step === 'chat') {
          this.socket.emit('set_active', { sessionId: this.session!.id, active: true });
        }
      });

    this.registerSocketListeners();
  }

  private registerSocketListeners(): void {
    this.socket.on<Message[]>('message_history')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((msgs) => {
        this.messages = msgs;
        if (this.step === 'chat') {
          this.socket.emit('set_active', { sessionId: this.session!.id, active: true });
        }
        this.cdr.detectChanges();
        this.scrollToBottom();
      });

    this.socket.on<Message & { showFeedback?: boolean }>('new_message')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((msg) => {
        const msgIndex = this.messages.length;
        this.messages.push(msg);
        if (msg.senderType === 'advisor') {
          this.sound.playAdvisorMessage();
          if (this.step === 'chat') {
            this.socket.emit('set_active', { sessionId: this.session!.id, active: true });
          }
          if ((msg as any).showFeedback === true) {
            this.encuestasPendientes.add(msgIndex);
            localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(this.messages));
          }
          this.notificarMensaje(msg.content);
        }
        this.cdr.detectChanges();
        this.scrollToBottom();
      });

    this.socket.on<{ position: number; total: number }>('queue_position')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        this.queuePosition = data.position;
        this.queueTotal    = data.total;
        this.cdr.detectChanges();
      });

    this.socket.on<{ name: string; profilePhotoUrl?: string }>('advisor_joined')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        this.advisorName = data.name;
        this.advisorPhotoUrl = data.profilePhotoUrl ?? '';
        this.sound.playNotification();
        this.clearWaitingTimer();
        this.mostrarAsesoresOcupados = false;
        this.queuePosition = -1;
        this.queueTotal    = null;
        this.fueraDeHorario = false;
        this.step = 'chat';
        this.socket.emit('set_active', { sessionId: this.session!.id, active: true });

        if (this.pendingAttachments.length > 0) {
          const attachments = [...this.pendingAttachments];
          const content = this.pendingTransferText ||
            (attachments.length === 1 ? 'Adjunté un archivo' : `Adjunté ${attachments.length} archivos`);
          this.pendingAttachments = [];
          this.pendingTransferText = '';
          setTimeout(() => {
            this.socket.emit('send_message', {
              sessionId: this.session!.id,
              content,
              senderName: this.clientName,
              attachments,
            });
          }, 300);
        }

        if (this.session) {
          const updated = { ...this.session, status: 'active', advisor: { name: data.name }, aiMode: false };
          localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
          this.session = updated as Session;
        }
        this.cdr.detectChanges();
      });

    this.socket.on<any>('session_closed')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe(() => {
        this.socketDestroy$.next();
        this.socket.disconnect();
        if (this.aiMode) {
          this.clearSession();
        } else {
          this.sessionIdParaRating = this.session?.id ?? null;
          this.step = 'rating';
          this.cdr.detectChanges();
        }
      });

    this.socket.on<{ name: string; role: string }>('typing_start')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => { this.typingName = data.name; this.otherTyping = true; this.cdr.detectChanges(); });

    this.socket.on<void>('typing_stop')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe(() => { this.otherTyping = false; this.cdr.detectChanges(); });

    this.socket.on<any>('messages_read')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe(() => {
        this.messages = this.messages.map(m =>
          m.senderType === 'client' ? { ...m, readAt: new Date().toISOString() } : m
        );
        this.cdr.detectChanges();
      });

    this.socket.on<TimerUpdatePayload>('timer_update')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((payload) => {
        if (!payload?.sessionId || payload.sessionId !== this.session?.id) return;
        this.clientTimer = this.buildClientTimer(payload);
        this.cdr.detectChanges();
      });

    this.socket.on<{ reason: string }>('join_error')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        this.notification.error('Error', data?.reason ?? 'No se pudo unir a la sesión');
        this.clearSession();
      });

    this.socket.on<{ sessionId: string; tiempoLimiteSeg: number; mensaje: string }>('session_interrupted')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        if (data.sessionId !== this.session?.id) return;
        this.reconexionActiva = true;
        this.reconexionMensaje = data.mensaje || 'El asesor se desconectó. Esperando reconexión...';
        this.reconexionSegundos = data.tiempoLimiteSeg;
        clearInterval(this.reconexionInterval);
        this.reconexionInterval = setInterval(() => {
          this.reconexionSegundos = Math.max(0, this.reconexionSegundos - 1);
          this.cdr.detectChanges();
          if (this.reconexionSegundos <= 0) {
            clearInterval(this.reconexionInterval);
            this.reconexionInterval = null;
          }
        }, 1000);
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string }>('reconnection_ok')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        if (data.sessionId !== this.session?.id) return;
        this.reconexionActiva = false;
        this.reconexionSegundos = 0;
        clearInterval(this.reconexionInterval);
        this.reconexionInterval = null;
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; mensaje: string }>('redirect_to_new_chat')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe((data) => {
        if (data.sessionId !== this.session?.id) return;
        this.notification.info('Sesión cerrada', data.mensaje || 'Por favor inicia una nueva conversación.');
        this.clearSession();
      });
  }

  private handleVisibilityChange(): void {
    // Al volver a la pestaña, refresca el estado de jornada al instante.
    if (document.visibilityState === 'visible') {
      this.verificarJornada();
    }
    if (!this.session || this.aiMode || this.step !== 'chat') return;
    this.socket.emit('set_active', {
      sessionId: this.session.id,
      active: document.visibilityState === 'visible',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENVÍO DE MENSAJES
  // ══════════════════════════════════════════════════════════════════════════

  triggerFileInput(): void {
    this.fileInput?.nativeElement?.click();
  }

  autoResize(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    this.onTyping();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    for (const file of Array.from(input.files)) {
      const error = this.chatMedia.validate(file);
      if (error) {
        this.notification.error('Archivo no permitido', error);
        continue;
      }

      const entry: typeof this.previewFiles[0] = {
        file,
        preview: null,
        uploading: false,
        error: null,
      };

      if (this.chatMedia.isImage(file.type)) {
        const reader = new FileReader();
        reader.onload = () => { entry.preview = reader.result as string; this.cdr.detectChanges(); };
        reader.readAsDataURL(file);
      }

      this.previewFiles.push(entry);
    }

    input.value = '';
    this.cdr.detectChanges();
  }

  removePreview(index: number): void {
    this.previewFiles.splice(index, 1);
    this.cdr.detectChanges();
  }

  onVoiceFileReady(result: VoiceRecordingResult): void {
    this.previewFiles.push({
      file: result.file,
      preview: null,
      uploading: false,
      error: null,
    });
    this.cdr.detectChanges();
  }

  onVoiceRecordingChange(recording: boolean): void {
    this.isRecordingAudio = recording;
    this.cdr.detectChanges();
  }

  onVoiceError(message: string): void {
    this.notification.error('Nota de voz', message);
  }

  openImagePreview(src: string, name: string): void {
    this.imagePreview = { src, name };
  }

  closeImagePreview(): void {
    this.imagePreview = null;
  }

  private async uploadPendingFiles(): Promise<Attachment[]> {
    if (this.previewFiles.length === 0) return [];

    const uploads = this.previewFiles.map(async (entry) => {
      entry.uploading = true;
      entry.error = null;
      this.cdr.detectChanges();

      try {
        const att = await new Promise<Attachment>((resolve, reject) => {
          this.chatMedia.upload(entry.file).subscribe({
            next: resolve,
            error: (err) => reject(err),
          });
        });
        return att;
      } catch (err: any) {
        entry.error = err?.error?.message || 'Error al subir archivo';
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

  /**
   * Al enviar en modo IA: cancela el timer actual y lo reinicia desde cero.
   * Esto garantiza que el timer de inactividad se resetea con cada mensaje.
   */
  async send(): Promise<void> {
    const hasText = this.newMessage.trim().length > 0;
    const hasFiles = this.previewFiles.length > 0;
    if (!hasText && !hasFiles) return;

    if (this.aiMode) {
      if (hasFiles) {
        const attachments = await this.uploadPendingFiles();
        if (attachments.length > 0) {
          this.pendingAttachments = attachments;
          this.pendingTransferText = this.newMessage.trim();
          this.transferToAdvisor();
        }
        return;
      }
      this.cancelarTimerInactividadIa();
      this.iniciarTimerInactividadIa();
      if (hasText) {
        this.sendToAi();
      }
      return;
    }

    if (!this.session) return;

    let attachments: Attachment[] = [];
    if (hasFiles) {
      attachments = await this.uploadPendingFiles();
    }

    this.socket.emit('send_message', {
      sessionId  : this.session.id,
      content    : this.newMessage.trim(),
      senderName : this.clientName,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    this.clientTimer = null;
    this.newMessage = '';
  }

  private buildClientTimer(payload: TimerUpdatePayload) {
    const total = payload.total > 0 ? payload.total : 0;
    const elapsed = Math.max(0, payload.elapsed || 0);
    const restante = total > 0 ? Math.max(0, total - elapsed) : 0;
    const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

    return {
      tipo: payload.tipo,
      restante,
      total,
      pct,
      mensaje: payload.mensaje ?? '',
      iteracion: payload.iteracion ?? 0,
      maxIter: payload.maxIter ?? 0,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODO IA
  // ══════════════════════════════════════════════════════════════════════════

  addAiMessage(
    role      : 'user' | 'model',
    text      : string,
    showSurvey = false,
    options   : { documentos?: any[] } = {},
  ): void {
    const newIndex = this.messages.length;
    this.messages.push({
      id        : Date.now().toString(),
      content   : text,
      senderType: role === 'user' ? 'client' : 'advisor',
      createdAt : new Date().toISOString(),
      readAt    : null,
      documentos: (options?.documentos ?? []),
    } as any);

    this.cdr.detectChanges();

    if (role === 'model' && showSurvey) {
      this.encuestasPendientes.add(newIndex);
    }

    this.aiHistory.push({ role, text });
    localStorage.setItem(AI_HISTORY_KEY,  JSON.stringify(this.aiHistory));
    localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(this.messages));
    this.scrollToBottom();
  }

  mostrarEncuestaEn(index: number): boolean {
    return this.encuestasPendientes.has(index) && !this.encuestasRespondidas.has(index);
  }

  mostrarOfertaAsesorEn(index: number): boolean {
    return this.ofertasAsesorPendientes.has(index) && !this.ofertasAsesorRespondidas.has(index);
  }

  responderEncuesta(index: number, util: boolean): void {
    this.encuestasPendientes.delete(index);
    this.encuestasRespondidas.set(index, util);

    if (!util) {
      // Si respondió NO a la encuesta de utilidad -> ofrecer la transferencia al asesor
      this.ofertasAsesorPendientes.add(index);
    }

    if (this.session?.id) {
      const preguntaIdx = this.aiHistory.findIndex((h, i) => h.role === 'user' && i === index * 2 - 1);
      const pregunta    = preguntaIdx >= 0 ? this.aiHistory[preguntaIdx].text : '';
      this.http.post(`${environment.apiUrl}/ai/feedback`, {
        sessionId: this.session.id,
        pregunta,
        util,
      }).subscribe({
        error: (err) => console.error('HTTP Error:', err),
      });
    }

    this.cdr.detectChanges();
  }

  responderOfertaAsesor(index: number, quiereAsesor: boolean): void {
    this.ofertasAsesorPendientes.delete(index);
    this.ofertasAsesorRespondidas.set(index, quiereAsesor);

    if (quiereAsesor) {
      this.transferToAdvisor();
    }
    this.cdr.detectChanges();
  }

  sendToAi(): void {
  if (!this.newMessage.trim()) return;
  const userMsg = this.newMessage.trim();
  this.newMessage = '';

  const transferKeywords = ['asesor', 'humano', 'persona', 'agente', 'ayuda humana', 'hablar con alguien'];
  const wantsTransfer    = transferKeywords.some(k => userMsg.toLowerCase().includes(k));
  const historySnapshot  = [...this.aiHistory];

  this.addAiMessage('user', userMsg);

  if (wantsTransfer) {
    setTimeout(() => this.transferToAdvisor(), 1000);
    return;
  }

  // Crear burbuja vacía del bot que se irá llenando en tiempo real
  const botMsgIndex = this.messages.length;
  this.messages.push({
    id        : Date.now().toString(),
    content   : '',
    senderType: 'advisor',
    createdAt : new Date().toISOString(),
    readAt    : null,
    documentos: [],
  } as any);

  this.streamingText    = '';
  this.streamDocumentos = [];
  this.isStreaming      = true;
  this.aiTyping         = false;
  let streamSugerirAsesor = false;
  this.cdr.detectChanges();

  this.streamSub = this.aiService
    .chatStream(userMsg, historySnapshot, this.clientName, this.colegio, this.tipoSolicitud, this.rol, this.session?.id, this.bienvenidaIa)
    .subscribe({
      next: ({ event, data }) => {

        if (event === 'metadata') {
          if (data.documentos) this.streamDocumentos = data.documentos;
          if (data.sugerirAsesor) streamSugerirAsesor = true;
        }

        if (event === 'chunk' && data.text) {
          // Detectar cierre por groserías dentro del stream
          if (data.text.includes('SESSION_TERMINATED')) {
            this.isStreaming = false;
            this.step = 'blocked';
            if (this.session?.id) {
              this.sessionService.closeAnonymous(this.session.id).subscribe();
            }
            this.cdr.detectChanges();
            return;
          }
          // Detectar transfer dentro del stream
          if (data.text.includes('TRANSFER_TO_ADVISOR')) {
            this.isStreaming = false;
            this.messages.splice(botMsgIndex, 1);
            setTimeout(() => this.transferToAdvisor(), 1000);
            return;
          }
          this.streamingText += data.text;
          (this.messages[botMsgIndex] as any).content = this.streamingText;
          this.scrollToBottom();
          this.cdr.detectChanges();
        }

        if (event === 'end') {
        this.isStreaming = false;
        if (this.step === 'blocked') return;

        // Limpiar la etiqueta de feedback y marcadores del texto visible
        const textoLimpio = this.streamingText
          .replace(/SESSION_TERMINATED/g, '')
          .replace(/\[FEEDBACK:(YES|NO)\]\s*$/, '')
          .trim();

        const mostrarEncuesta = this.streamingText.includes('[FEEDBACK:YES]');

        (this.messages[botMsgIndex] as any).content   = textoLimpio;
        (this.messages[botMsgIndex] as any).documentos = this.streamDocumentos;

        // Guardar texto limpio en historial
        this.aiHistory.push({ role: 'model', text: textoLimpio });

        if (mostrarEncuesta) {
          this.encuestasPendientes.add(botMsgIndex);
        } else if (streamSugerirAsesor) {
          this.ofertasAsesorPendientes.add(botMsgIndex);
        }

        localStorage.setItem(AI_HISTORY_KEY,  JSON.stringify(this.aiHistory));
        localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(this.messages));
        this.sound.playMessage();
        this.cdr.detectChanges();
      }

        if (event === 'error') {
          this.isStreaming = false;
          (this.messages[botMsgIndex] as any).content =
            'Lo siento, tuve un problema. Intenta de nuevo o escribe "asesor".';
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.isStreaming = false;
        (this.messages[botMsgIndex] as any).content =
          'Lo siento, tuve un problema. Intenta de nuevo o escribe "asesor".';
        this.cdr.detectChanges();
      },
    });
}

// Botón "Detener respuesta"
detenerStream(): void {
  this.streamSub?.unsubscribe();
  this.isStreaming = false;
  if (this.streamingText) {
    this.aiHistory.push({ role: 'model', text: this.streamingText });
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(this.aiHistory));
    localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(this.messages));
  }
  this.cdr.detectChanges();
}
  formatMessage(text: string): string {
  if (!text) return '';
  return this.escapeHtml(text)
    // Negrita: **texto** → <strong>texto</strong>
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Listas numeradas: "1. texto" al inicio de línea
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Wrappear listas consecutivas en <ol>
    .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')
    // Markdown links: [texto](url) → <a href="url">texto</a>
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Links con prefijo: link:https://... → <a>https://...</a>
    .replace(
      /link:((https?:\/\/|www\.)[^\s<]+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Hipervínculos: convertir URLs en enlaces clickables
    .replace(
      /(?<!href="|src=")((https?:\/\/|www\.)[^\s<]+)/g,
      (match) => {
        const url = match.startsWith('www.') ? `https://${match}` : match;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
      }
    )
    // Saltos de línea
    .replace(/\n/g, '<br>');
}

private escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

  transferToAdvisor(): void {
    this.cancelarTimerInactividadIa();
    this.aiMode = false;
    this.encuestasRespondidas.clear();
    this.encuestasPendientes.clear();
    this.aiMsgCount = 0;
    localStorage.removeItem(AI_HISTORY_KEY);
    localStorage.removeItem(AI_MESSAGES_KEY);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...this.session, aiMode: false }));
    this.messages = [];
    this.step = 'waiting';
    this.startWaitingTimer();
    this.cdr.detectChanges();

    this.connectSocket();
    this.socket.on<string>('connect')
      .pipe(takeUntil(this.socketDestroy$))
      .subscribe(() => { this.socket.emit('request_advisor', this.session!.id); });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLA
  // ══════════════════════════════════════════════════════════════════════════

  private startWaitingTimer(): void {
    this.clearWaitingTimer();
    this.waitingElapsed = 0;
    this.estimatedWaitSecs = 0;

    this.waitingTickTimer = setInterval(() => {
      this.waitingElapsed++;
      this.estimatedWaitSecs = Math.max(0, (this.queuePosition * 120) - this.waitingElapsed);
      this.cdr.detectChanges();
    }, 1000);

    this.waitingTimer = setTimeout(() => {
      if (this.step === 'waiting') { this.mostrarAsesoresOcupados = true; this.cdr.detectChanges(); }
    }, 60_000);
  }

  private clearWaitingTimer(): void {
    if (this.waitingTimer) { clearTimeout(this.waitingTimer); this.waitingTimer = null; }
    if (this.waitingTickTimer) { clearInterval(this.waitingTickTimer); this.waitingTickTimer = null; }
    this.waitingElapsed = 0;
    this.estimatedWaitSecs = 0;
  }

  exitWaiting(): void {
    this.clearWaitingTimer();
    this.mostrarAsesoresOcupados = false;
    if (this.session) this.socket.emit('client_close_session', this.session.id);
    this.socketDestroy$.next();
    this.socket.disconnect();
    this.clearSession();
  }

  formatTiempo(seg: number): string {
    if (seg < 60) return `${seg}s`;
    const min = Math.floor(seg / 60);
    const s = seg % 60;
    return `${min}m ${s}s`;
  }

  formatTiempoRelativo(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const b = new Date(d.getTime() - 5 * 3600000);
    const n = new Date(new Date().getTime() - 5 * 3600000);
    const diff = n.getTime() - b.getTime();
    const seg = Math.floor(diff / 1000);
    if (seg < 60) return 'ahora';
    const min = Math.floor(seg / 60);
    if (min < 60) return `hace ${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `hace ${horas}h`;
    const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    return `${b.getUTCDate()} ${months[b.getUTCMonth()]}, ${b.getUTCHours()}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
  }

  formatMessageTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const h = bogota.getUTCHours();
    const m = bogota.getUTCMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'a. m.' : 'p. m.';
    return `${h12}:${pad(m)} ${ampm}`;
  }

  copiarTexto(texto: string): void {
    navigator.clipboard.writeText(texto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════════════════════════

  onTyping(): void {
    if (!this.session || this.aiMode) return;
    if (!this.isTyping) { this.isTyping = true; this.socket.emit('typing_start', this.session.id); }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.isTyping = false;
      this.socket.emit('typing_stop', this.session!.id);
    }, 1500);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CIERRE
  // ══════════════════════════════════════════════════════════════════════════

 closeChat(): void {
  if (!this.session) return;

  if (this.aiMode) {
    if (this.session?.id) {
      this.sessionService.closeAnonymous(this.session.id).subscribe({
        error: () => this.notification.error('Error', 'No se pudo cerrar la sesión'),
      });
    }
    this.clearSession();
  } else {
    this.sessionIdParaRating = this.session.id;
    this.socket.emit('client_close_session', this.session.id);
    this.socketDestroy$.next();
    this.socket.disconnect();
    this.step = 'rating';
    this.cdr.detectChanges();
  }

  try { window.parent.postMessage({ type: 'sian-close-panel' }, '*'); } catch (_) {}
}

  // ══════════════════════════════════════════════════════════════════════════
  // RATING
  // ══════════════════════════════════════════════════════════════════════════

  toggleEtiqueta(e: string): void {
    const idx = this.ratingEtiquetas.indexOf(e);
    if (idx === -1) this.ratingEtiquetas.push(e);
    else this.ratingEtiquetas.splice(idx, 1);
  }

  enviarRating(): void {
    if (!this.ratingEstrellas || !this.sessionIdParaRating) return;
    this.sessionService.saveRating(this.sessionIdParaRating, this.ratingEstrellas, this.ratingComentario.trim() || null, this.ratingEtiquetas)
      .subscribe({
        next: () => {
          this.ratingEnviado = true;
          this.cdr.detectChanges();
          setTimeout(() => this.clearSession(), 2000);
        },
        error: (err) => console.error('HTTP Error:', err),
      });
  }

  omitirRating(): void { this.clearSession(); }

  // ══════════════════════════════════════════════════════════════════════════
  // LIMPIEZA
  // ══════════════════════════════════════════════════════════════════════════

  clearSession(): void {
    clearInterval(this.reconexionInterval);
    this.reconexionInterval = null;
    this.reconexionActiva = false;
    this.clearWaitingTimer();
    this.cancelarTimerInactividadIa();
    this.socketDestroy$.next();
    this.fueraDeHorario = false;

    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CLIENT_NAME_KEY);
    localStorage.removeItem(AI_HISTORY_KEY);
    localStorage.removeItem(AI_MESSAGES_KEY);

    this.session = null; this.messages = []; this.aiHistory = []; this.advisorName = ''; this.codigoSesion = ''; this.codigoCopiado = false;
    this.step = 'faq'; this.clientName = ''; this.submitted = false;
    this.identificacion = ''; this.apellido = ''; this.rol = '';
    this.colegio = ''; this.colegioLink = ''; this.colegioQuery = '';
    this.colegioSeleccionado = null; this.tipoSolicitud = '';
    this.ratingEstrellas = 0; this.ratingHover = 0; this.ratingComentario = '';
    this.ratingEtiquetas = []; this.ratingEnviado = false; this.sessionIdParaRating = null;
    this.mostrarAsesoresOcupados = false; this.queuePosition = -1; this.queueTotal = null; this.clientTimer = null;
    this.encuestasRespondidas.clear(); this.encuestasPendientes.clear(); this.aiMsgCount = 0;

    this.socket.disconnect();
    this.cdr.detectChanges();
  }


  // ══════════════════════════════════════════════════════════════════════════
  // APLICAR DISEÑO DESDE BACKEND
  // ══════════════════════════════════════════════════════════════════════════

  private aplicarTemaWidget(): void {
    this.http.get<Record<string, string>>(`${environment.apiUrl}/widget-config`).subscribe({
    next: (cfg) => {
      const root = document.documentElement;

      if (cfg['chatHeaderColor']) {
        root.style.setProperty('--chat-header', cfg['chatHeaderColor']);
        root.style.setProperty('--chat-header-text', getContrastColor(cfg['chatHeaderColor']));
      }
      if (cfg['chatBgColor']) {
        root.style.setProperty('--chat-bg', cfg['chatBgColor']);
        root.style.setProperty('--chat-bg-text', getContrastColor(cfg['chatBgColor']));
      }
      if (cfg['chatBubbleColor']) {
        root.style.setProperty('--chat-bubble', cfg['chatBubbleColor']);
        root.style.setProperty('--chat-bubble-text', getContrastColor(cfg['chatBubbleColor']));
      }
      if (cfg['chatBubbleUserColor']) {
        root.style.setProperty('--chat-bubble-user', cfg['chatBubbleUserColor']);
        root.style.setProperty('--chat-bubble-user-text', getContrastColor(cfg['chatBubbleUserColor']));
      }
      if (cfg['chatMarca']) this.marcaChat = cfg['chatMarca'];
      this.cdr.detectChanges();
    },
    error: () => {},
  });
  }



  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        scrollToBottom(this.messagesContainer.nativeElement);
      }
    }, 50);
  }

  
  

  ngOnDestroy(): void {
    clearInterval(this.horarioPollInterval);
    this.horarioPollInterval = null;
    clearInterval(this.reconexionInterval);
    this.reconexionInterval = null;
    window.removeEventListener('online',  this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.cancelarTimerInactividadIa();
    if (this.session && this.step === 'chat') {
      this.socket.emit('set_active', { sessionId: this.session.id, active: false });
    }
    this.clearWaitingTimer();
    this.socketDestroy$.next();
    this.socketDestroy$.complete();
  }
  


}

function getContrastColor(hex: string): string {
  let r = 0, g = 0, b = 0;
  const clean = hex.trim();

  if (clean.startsWith('#')) {
    const full = clean.length === 4
      ? `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`
      : clean;
    r = parseInt(full.slice(1, 3), 16);
    g = parseInt(full.slice(3, 5), 16);
    b = parseInt(full.slice(5, 7), 16);
  } else if (clean.startsWith('rgb')) {
    [r, g, b] = clean.match(/\d+/g)!.map(Number);
  }

  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#1a1a1a';
}
