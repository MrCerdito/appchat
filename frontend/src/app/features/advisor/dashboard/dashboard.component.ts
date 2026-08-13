import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { SoundService } from '../../../core/services/sound.service';
import { TicketService } from '../../../core/services/ticket.service';
import { AdminService } from '../../../core/services/admin.service';
import { WhatsappChatService } from '../../../core/services/whatsapp-chat.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { InternalChatService } from '../../../core/services/internal-chat.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NotificationService } from '../../../core/services/notification.service';
import { User } from '../../../core/models/user.model';
import { Session } from '../../../core/models/session.model';
import { Message } from '../../../core/models/message.model';
import { AwNewMessage, WaChat } from '../../../core/models/whatsapp.models';
import { InternalMessage } from '../../../core/models/internal-chat.models';
import { trackByIndex, trackById } from '../../../shared/utils/track-by';

interface ConnectedAdvisor {
  advisorId: string;
  name: string;
  status: string;
  profilePhotoUrl: string | null;
  enAlmuerzo?: boolean;
  lunchFin?: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ToastContainerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  currentAdvisor: User | null = null;
  advisorStatus: 'online' | 'busy' | 'offline' = 'offline';
  profileOpen = false;
  sidebarOpen = false;
  appearanceOpen = false;
  compactShellMode = false;
  misChatsNoLeidos = 0;
  whatsappUnreadCount = 0;
  internalUnreadCount = 0;
  totalUnreadCount = 0;
  topbarTitle = 'CHAT EN LINEA';

  teamsPanelOpen = false;
  isTeamsConnected = false;
  isLoadingTeams = false;
  teamsAccountName = '';
  teamsMessage = '';

  allAdvisors: ConnectedAdvisor[] = [];
  teamPanelOpen = false;
  compactTeamView = window.matchMedia('(max-width: 900px)').matches;
  smallScreen = window.matchMedia('(max-width: 1268px)').matches;

  get maxVisibleCapsules(): number {
    return this.compactTeamView ? 2 : this.allAdvisors.length;
  }

  get hiddenAdvisorNames(): string {
    return this.allAdvisors.slice(2).map(a => a.name).join(', ');
  }

  get otherAdvisors(): ConnectedAdvisor[] {
    return this.allAdvisors.filter(a => a.advisorId !== this.currentAdvisor?.id);
  }

  get roleLabel(): string {
    return this.currentAdvisor?.role === 'admin' ? 'Administrador' : 'Agente';
  }

  private isSelfAdvisor(adv: ConnectedAdvisor): boolean {
    return adv.advisorId === this.currentAdvisor?.id;
  }

  advisorRingClass(adv: ConnectedAdvisor): string {
    if (this.isSelfAdvisor(adv)) return this.enAlmuerzo ? 'lunch' : this.advisorStatus;
    return adv.enAlmuerzo ? 'lunch' : (adv.status as 'online' | 'busy' | 'offline');
  }

  advisorStatusValue(adv: ConnectedAdvisor): 'online' | 'busy' | 'offline' {
    if (this.isSelfAdvisor(adv)) return this.advisorStatus;
    return (adv.status as 'online' | 'busy' | 'offline') ?? 'offline';
  }

  advisorStatusText(adv: ConnectedAdvisor): string {
    const onLunch = this.isSelfAdvisor(adv) ? this.enAlmuerzo : adv.enAlmuerzo;
    if (onLunch) return 'En almuerzo';
    const status = this.advisorStatusValue(adv);
    return status === 'online' ? 'Disponible' : status === 'busy' ? 'Ocupado' : 'Inactivo';
  }

  enAlmuerzo = false;
  almuerzoPendiente = false;
  notificationPermission: 'granted' | 'denied' | 'default' | 'unsupported' = 'default';

  get notificationPermissionTitle(): string {
    switch (this.notificationPermission) {
      case 'granted':
        return 'Notificaciones de Windows activadas';
      case 'denied':
        return 'Notificaciones bloqueadas por el navegador. Haz clic para ver cómo activarlas.';
      case 'unsupported':
        return 'Este navegador no soporta notificaciones de escritorio';
      default:
        return 'Activar notificaciones de Windows';
    }
  }
  almuerzoModalVisible = true;
  almuerzoRestante = '';
  almuerzoFinHora = '';
  almuerzoMensaje = '';
  almuerzoInicio = '';
  almuerzoFinOriginal = '';
  almuerzoInicioReal = '';
  almuerzoDuracionMs = 0;
  almuerzoFinEpochMs = 0;
  almuerzoChatsPendientes = 0;
  almuerzoChatsWeb = 0;
  almuerzoChatsWhatsapp = 0;
  almuerzoProgreso = 0;
  almuerzoProximoMensaje = '';
  almuerzoError = '';
  terminarAlmuerzoLoading = false;
  confirmarFinAlmuerzo = false;

  private lunchInterval: ReturnType<typeof setInterval> | null = null;
  private destroy$ = new Subject<void>();
  private readonly STATUS_KEY = 'advisor_status';
  private readonly LUNCH_STATE_KEY = 'advisor_lunch_state';
  private fixedAdvisorCache = new Map<string, string | null | undefined>();
  private fallbackToastAt = new Map<string, number>();
  private readonly teamBreakpoint = window.matchMedia('(max-width: 900px)');
  private readonly smallScreenBreakpoint = window.matchMedia('(max-width: 1268px)');

  private onTeamBreakpoint = (e: MediaQueryListEvent): void => {
    this.compactTeamView = e.matches;
    this.cdr.detectChanges();
  };

  private onSmallScreenBreakpoint = (e: MediaQueryListEvent): void => {
    this.smallScreen = e.matches;
    this.cdr.detectChanges();
  };

  constructor(
    private socket: SocketService,
    private auth: AuthService,
    private sessionService: SessionService,
    private sound: SoundService,
    private ticketService: TicketService,
    private whatsapp: WhatsappChatService,
    private internalChat: InternalChatService,
    private chatState: ChatStateService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    protected themeService: ThemeService,
    private admin: AdminService,
    private elementRef: ElementRef,
    private notification: NotificationService,
  ) {}

  whatsappMode: 'clients' | 'advisors' | null = null;

  ngOnInit(): void {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      this.currentAdvisor = user;
      if (user?.id) {
        const idx = this.allAdvisors.findIndex(a => a.advisorId === user.id);
        if (idx >= 0 && this.allAdvisors[idx].profilePhotoUrl !== (user.profilePhotoUrl ?? null)) {
          this.allAdvisors[idx] = { ...this.allAdvisors[idx], profilePhotoUrl: user.profilePhotoUrl ?? null };
        }
      }
      this.cdr.detectChanges();
    });
    this.sound.init();
    this.sound.ping();
    this.sound.notificationPermission$
      .pipe(takeUntil(this.destroy$))
      .subscribe(p => {
        this.notificationPermission = p;
        this.cdr.detectChanges();
      });
    this.socket.connect(this.auth.getToken() ?? undefined);
    if (this.currentAdvisor?.id) {
      this.whatsapp.joinAsAdvisor(this.currentAdvisor.id);
    }
    this.internalChat.connect();

    const saved = localStorage.getItem(this.STATUS_KEY) as 'online' | 'busy' | 'offline';
    this.advisorStatus = saved ?? 'online';
    this.applyStatus(this.advisorStatus);
    this.socket.emit('advisor_ready');
    this.loadActiveCount();
    this.registerSocketListeners();
    this.registerGlobalNotificationListeners();
    this.restoreLunchFromStorage();
    this.socket.emit('get_lunch_state');
    this.syncUnreadIndicators();
    this.teamBreakpoint.addEventListener('change', this.onTeamBreakpoint);
    this.smallScreenBreakpoint.addEventListener('change', this.onSmallScreenBreakpoint);
    this.sessionService.findAdvisors().subscribe({
      next: (users) => {
        this.allAdvisors = users.map(u => ({
          advisorId: u.id,
          name: u.name,
          status: (u.status || 'offline') as 'online' | 'busy' | 'offline',
          profilePhotoUrl: u.profilePhotoUrl ?? null,
        }));
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.syncShellMode(this.router.url);
    this.syncWhatsappMode(this.router.url);
    this.topbarTitle = this.router.url.includes('/dashboard/whatsapp')
      ? 'CHAT WHATSAPP'
      : 'CHAT EN LINEA';
    window.addEventListener('message', this.handleTeamsAuthMessage);
    this.loadTeamsStatus();
  }

  private registerSocketListeners(): void {
    this.socket.on<ConnectedAdvisor>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.advisorId === this.currentAdvisor?.id) {
          this.advisorStatus = data.status as 'online' | 'busy' | 'offline';
          this.cdr.detectChanges();
        }
        const idx = this.allAdvisors.findIndex(a => a.advisorId === data.advisorId);
        if (idx >= 0) {
          this.allAdvisors[idx] = { ...this.allAdvisors[idx], status: data.status, profilePhotoUrl: data.profilePhotoUrl ?? this.allAdvisors[idx].profilePhotoUrl };
          this.cdr.detectChanges();
        }
      });

    this.socket.on<ConnectedAdvisor[]>('all_advisors_list')
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        this.allAdvisors = list;
        this.cdr.detectChanges();
      });

    this.socket.on<{ userId: string; profilePhotoUrl: string | null }>('profile_photo_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const idx = this.allAdvisors.findIndex(a => a.advisorId === data.userId);
        if (idx >= 0) {
          this.allAdvisors[idx] = { ...this.allAdvisors[idx], profilePhotoUrl: data.profilePhotoUrl };
          this.cdr.detectChanges();
        }
      });

    this.socket.on<any>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadActiveCount();
        this.cdr.detectChanges();
      });

    this.socket.on<any>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadActiveCount();
        this.cdr.detectChanges();
      });

    this.socket.on<{ fin: string; restante: string; inicio: string; finOriginal: string; inicioReal?: string; duracionMs?: number; finEpochMs?: number }>('lunch_started')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.enAlmuerzo = true;
        this.almuerzoPendiente = false;
        this.almuerzoModalVisible = true;
        this.almuerzoFinHora = data.fin;
        this.almuerzoRestante = data.restante;
        this.almuerzoInicio = data.inicio;
        this.almuerzoFinOriginal = data.finOriginal;
        this.almuerzoInicioReal = data.inicioReal ?? '';
        this.almuerzoDuracionMs = data.duracionMs ?? 0;
        this.almuerzoFinEpochMs = this.computeLunchFinEpoch(data);
        this.almuerzoMensaje = '';
        this.almuerzoProximoMensaje = '';
        this.almuerzoError = '';
        this.advisorStatus = 'busy';
        this.persistLunchState();
        this.startLunchCountdown();
        this.cdr.detectChanges();
      });

    this.socket.on<{ enAlmuerzo: boolean }>('lunch_state')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.enAlmuerzo) return;
        this.resetAlmuerzo(false, 'sync');
      });

    this.socket.on<{ advisorId: string; enAlmuerzo: boolean; fin: string | null }>('lunch_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const idx = this.allAdvisors.findIndex(a => a.advisorId === data.advisorId);
        if (idx >= 0) {
          this.allAdvisors[idx] = {
            ...this.allAdvisors[idx],
            enAlmuerzo: data.enAlmuerzo,
            lunchFin: data.fin,
          };
        }
        this.cdr.detectChanges();
      });

    this.socket.on<{ reason: string }>('lunch_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.almuerzoError = data.reason || '';
        this.cdr.detectChanges();
      });

    this.socket.on<void>('lunch_ended')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.resetAlmuerzo(true, 'sync');
      });

    this.socket.on<{ mensaje: string; chats: number; chatsWeb: number; chatsWhatsapp: number; inicio: string; finOriginal: string }>('lunch_pending')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.almuerzoMensaje = data.mensaje;
        this.almuerzoPendiente = true;
        this.almuerzoModalVisible = true;
        this.almuerzoChatsPendientes = data.chats;
        this.almuerzoChatsWeb = data.chatsWeb;
        this.almuerzoChatsWhatsapp = data.chatsWhatsapp;
        this.almuerzoInicio = data.inicio;
        this.almuerzoFinOriginal = data.finOriginal;
        this.almuerzoProximoMensaje = '';
        this.almuerzoError = '';
        this.advisorStatus = 'busy';
        this.cdr.detectChanges();
      });

    this.socket.on<void>('lunch_pending_cancelled')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.almuerzoMensaje = '';
        this.almuerzoPendiente = false;
        this.almuerzoModalVisible = true;
        this.almuerzoInicio = '';
        this.almuerzoFinOriginal = '';
        this.almuerzoChatsPendientes = 0;
        this.almuerzoChatsWeb = 0;
        this.almuerzoChatsWhatsapp = 0;
        this.almuerzoProgreso = 0;
        this.almuerzoProximoMensaje = '';
        this.almuerzoError = '';
        this.advisorStatus = 'online';
        this.cdr.detectChanges();
      });

    this.socket.on<{ mensaje: string; minutos: number; inicio: string }>('lunch_approaching')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.almuerzoProximoMensaje = data.mensaje;
        this.cdr.detectChanges();
      });
  }

  requestNotifications(): void {
    this.sound.requestNotifications().then(permission => {
      this.notificationPermission = permission;
      if (permission === 'granted') {
        this.notification.success(
          'Notificaciones activadas',
          'Recibirás avisos de mensajes y asignaciones.',
        );
      } else if (permission === 'denied') {
        this.notification.warning(
          'Notificaciones bloqueadas',
          'Habilita el permiso de notificaciones para este sitio en la configuración del navegador.',
        );
      } else if (permission === 'unsupported') {
        this.notification.info(
          'Notificaciones no disponibles',
          'Este navegador no soporta notificaciones de escritorio.',
        );
      }
    });
  }

  private registerGlobalNotificationListeners(): void {
    this.socket.on<{ sessionId: string; clientName: string }>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playWhatsappAssignment();
        this.sound.notify(
          'CHAT EN LINEA',
          `${data.clientName || 'Cliente'}\nNuevo chat asignado`,
          `assigned-${data.sessionId}`,
        );
      });

    this.socket.on<Message & { session?: Session; sessionId?: string }>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => this.handleGlobalChatMessage(message));

    this.whatsapp.onNewMessage()
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => this.handleGlobalWhatsappMessage(message));

    this.internalChat.onNewMessage()
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => this.handleGlobalInternalMessage(message));

    this.sound.notificationFallback$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ev => {
        const key = `fb-${ev.tag}`;
        const last = this.fallbackToastAt.get(key) ?? 0;
        if (Date.now() - last < 4000) return;
        this.fallbackToastAt.set(key, Date.now());
        this.notification.info(ev.title, ev.body.replace(/\n/g, ' · '), ev.icon);
      });

    this.whatsapp.onChatAssigned()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.advisorId !== this.currentAdvisor?.id) return;
        this.sound.playWhatsappAssignment();
        this.sound.notify(
          'WHATSAPP',
          `${event.chat.name}\nChat asignado`,
          `wa-assigned-${event.chat.id}`,
        );
      });

    this.whatsapp.onQueueUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.chat?.assignedTo) return;
        this.sound.playWhatsappQueue();
        this.sound.notify(
          'WHATSAPP',
          `${event.chat?.name || 'Nuevo contacto'}\nEspera atencion en cola`,
          `wa-queue-${event.chat?.id || Date.now()}`,
        );
      });

    this.whatsapp.onChatUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(chat => {
        if (chat.fixedAdvisorId === undefined) return;
        const prev = this.fixedAdvisorCache.get(chat.id);
        if (prev === chat.fixedAdvisorId) return;
        this.fixedAdvisorCache.set(chat.id, chat.fixedAdvisorId);
        if (chat.fixedAdvisorId === this.currentAdvisor?.id) {
          this.sound.playWhatsappAssignment();
          this.sound.notify(
            'WHATSAPP',
            `${chat.name}\nTe han fijado como agente`,
            `wa-fixed-${chat.id}`,
          );
        } else if (prev === this.currentAdvisor?.id && !chat.fixedAdvisorId) {
          this.sound.notify(
            'WHATSAPP',
            `${chat.name}\nSe quito la fijacion de agente`,
            `wa-unfixed-${chat.id}`,
          );
        }
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(event => {
        const url = event.urlAfterRedirects;
        if (url.includes('/dashboard/chats')) {
          this.topbarTitle = 'CHAT EN LINEA';
          this.loadActiveCount();
        } else if (url.includes('/dashboard/whatsapp')) {
          this.topbarTitle = 'CHAT WHATSAPP';
          this.chatState.setActiveSession(null);
        } else {
          this.topbarTitle = 'CHAT EN LINEA';
          this.chatState.setActiveSession(null);
        }
        this.syncShellMode(url);
        this.syncWhatsappMode(url);
        this.cdr.detectChanges();
      });
  }

  private syncUnreadIndicators(): void {
    this.chatState.unreadTotal$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const sessions = this.chatState.sessions$.getValue();
        const myId = this.currentAdvisor?.id;
        const mySessions = myId
          ? sessions.filter(s => s.advisor?.id === myId && (s.status === 'waiting' || s.status === 'active'))
          : sessions.filter(s => s.status === 'waiting' || s.status === 'active');
        this.misChatsNoLeidos = mySessions.reduce(
          (sum, s) => sum + this.chatState.getUnread(s.id), 0,
        );
        this.refreshGlobalBadge();
        this.cdr.detectChanges();
      });

    this.whatsapp.getUnreadTotalStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(total => {
        this.whatsappUnreadCount = total;
        this.refreshGlobalBadge();
      });

    this.internalChat.getUnreadTotalStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(total => {
        this.internalUnreadCount = total;
        this.refreshGlobalBadge();
      });

    this.whatsapp.loadChats().subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
    interval(30_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.router.url.includes('/dashboard/whatsapp')) return;
        this.whatsapp.refreshUnreadTotal().subscribe();
        this.whatsapp.loadChats(1).subscribe();
      });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleGlobalChatMessage(message: Message & { session?: Session; sessionId?: string }): void {
    const sessionId = message.session?.id ?? message.sessionId;
    if (!sessionId || message.senderType !== 'client') return;

    const added = this.chatState.addMessage(sessionId, message);
    if (!added) return;

    const isOpenHere = this.router.url.includes('/dashboard/chats') &&
      this.chatState.getActiveSessionId() === sessionId;
    if (isOpenHere) {
      this.socket.emit('set_active', { sessionId, active: true });
    } else {
      this.chatState.incrementUnread(sessionId);
    }

    this.sound.playCriticalMessage();
    const session = message.session ?? this.chatState.sessions$.getValue().find(s => s.id === sessionId);
    this.sound.notify(
      'CHAT EN LINEA',
      `${this.sessionFullName(session)}\n${message.content || 'Nuevo mensaje del cliente'}`,
      `chat-message-${sessionId}`,
    );
    this.loadActiveCount();
    this.cdr.detectChanges();
  }

  private handleGlobalWhatsappMessage(message: AwNewMessage): void {
    if (message.fromMe) return;
    if (message.chatId === this.whatsapp.getActiveChatId()) return;
    this.sound.playWhatsappAssignedMessage();
    const chat = this.whatsapp.getChatsSnapshot().find(item => item.id === message.chatId);
    this.sound.notify(
      'WHATSAPP',
      `${this.whatsappConversationName(chat, message)}\n${message.body || this.whatsappMediaLabel(message.type)}`,
      `wa-message-${message.chatId}`,
    );
  }

  private handleGlobalInternalMessage(message: InternalMessage): void {
    if (message.senderId === this.currentAdvisor?.id) return;
    if (message.type === 'system') return;
    this.sound.playWhatsappAssignedMessage();
    this.sound.notify(
      'CHAT INTERNO',
      `${message.senderName}\n${message.body || this.internalMediaLabel(message)}`,
      `internal-message-${message.conversationId}`,
    );
  }

  get whatsappTotalUnread(): number {
    return this.whatsappUnreadCount + this.internalUnreadCount;
  }

  get showTopbarTitle(): boolean {
    const url = this.router.url;
    return url.includes('/dashboard/chats') || url.includes('/dashboard/whatsapp');
  }

  get showHamburger(): boolean {
    return this.showTopbarTitle || this.smallScreen;
  }

  get whatsappUnreadTitle(): string {
    return `Mensajes sin leer de WhatsApp — Clientes: ${this.whatsappUnreadCount} · Internos: ${this.internalUnreadCount}`;
  }

  private refreshGlobalBadge(): void {
    this.totalUnreadCount = this.misChatsNoLeidos + this.whatsappUnreadCount;
    this.sound.setUnreadBadge(this.totalUnreadCount);
    if (document.hidden && this.totalUnreadCount > 0) {
      this.sound.startTitleBlink(this.totalUnreadCount);
    }
    this.cdr.detectChanges();
  }

  private startLunchCountdown(): void {
    this.stopLunchCountdown();

    const duracionTotalMs =
      this.almuerzoDuracionMs > 0
        ? this.almuerzoDuracionMs
        : (() => {
            const [ih, im] = (this.almuerzoInicio || '12:00').split(':').map(Number);
            const [fh, fm] = (this.almuerzoFinOriginal || this.almuerzoFinHora).split(':').map(Number);
            return Math.max(1, ((fh * 60 + fm) - (ih * 60 + im)) * 60000);
          })();
    const inicioRealMs = this.almuerzoInicioReal
      ? new Date(this.almuerzoInicioReal).getTime()
      : Date.now();

    this.lunchInterval = setInterval(() => {
      if (this.almuerzoFinEpochMs <= 0 && !this.almuerzoFinHora) return;

      const now = Date.now();
      const finMs =
        this.almuerzoFinEpochMs > 0
          ? this.almuerzoFinEpochMs
          : (() => {
              const [fh2, fm2] = this.almuerzoFinHora.split(':').map(Number);
              return new Date().setHours(fh2, fm2, 0, 0);
            })();
      const diff = Math.max(0, finMs - now);
      const mins = Math.floor(diff / 60000);
      const segs = Math.floor((diff % 60000) / 1000);
      this.almuerzoRestante = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;

      const elapsed = Math.min(duracionTotalMs, Math.max(0, now - inicioRealMs));
      this.almuerzoProgreso = Math.min(100, Math.max(0, (elapsed / duracionTotalMs) * 100));
      this.cdr.detectChanges();

      if (diff === 0) {
        this.socket.emit('lunch_action', { action: 'end' });
        this.resetAlmuerzo(true, 'auto');
      }
    }, 1000);
  }

  private stopLunchCountdown(): void {
    if (!this.lunchInterval) return;
    clearInterval(this.lunchInterval);
    this.lunchInterval = null;
  }

  private computeLunchFinEpoch(data: {
    fin?: string;
    inicioReal?: string;
    duracionMs?: number;
    finEpochMs?: number;
  }): number {
    if (data.finEpochMs && data.finEpochMs > 0) return data.finEpochMs;
    if (data.inicioReal && (data.duracionMs ?? 0) > 0) {
      return new Date(data.inicioReal).getTime() + (data.duracionMs ?? 0);
    }
    const [fh, fm] = (data.fin || '00:00').split(':').map(Number);
    return new Date().setHours(fh, fm, 0, 0);
  }

  private persistLunchState(): void {
    try {
      localStorage.setItem(
        this.LUNCH_STATE_KEY,
        JSON.stringify({
          enAlmuerzo: true,
          fin: this.almuerzoFinHora,
          inicio: this.almuerzoInicio,
          finOriginal: this.almuerzoFinOriginal,
          inicioReal: this.almuerzoInicioReal,
          duracionMs: this.almuerzoDuracionMs,
          finEpochMs: this.almuerzoFinEpochMs,
        }),
      );
    } catch {}
  }

  private restoreLunchFromStorage(): void {
    let saved: {
      enAlmuerzo: boolean;
      fin: string;
      inicio: string;
      finOriginal: string;
      inicioReal: string;
      duracionMs: number;
      finEpochMs: number;
    } | null = null;
    try {
      const raw = localStorage.getItem(this.LUNCH_STATE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(this.LUNCH_STATE_KEY);
      return;
    }
    if (!saved?.enAlmuerzo) return;

    this.enAlmuerzo = true;
    this.almuerzoPendiente = false;
    this.almuerzoModalVisible = true;
    this.almuerzoFinHora = saved.fin ?? '';
    this.almuerzoInicio = saved.inicio ?? '';
    this.almuerzoFinOriginal = saved.finOriginal ?? '';
    this.almuerzoInicioReal = saved.inicioReal ?? '';
    this.almuerzoDuracionMs = saved.duracionMs ?? 0;
    this.almuerzoFinEpochMs = saved.finEpochMs ?? 0;
    this.almuerzoMensaje = '';
    this.almuerzoProximoMensaje = '';
    this.almuerzoError = '';
    this.advisorStatus = 'busy';
    this.startLunchCountdown();
  }

  private resetAlmuerzo(restoreOnline: boolean, causa: 'manual' | 'auto' | 'sync' = 'manual'): void {
    const estabaEnAlmuerzo = this.enAlmuerzo;
    this.enAlmuerzo = false;
    this.almuerzoPendiente = false;
    this.almuerzoModalVisible = true;
    this.almuerzoRestante = '';
    this.almuerzoFinHora = '';
    this.almuerzoFinEpochMs = 0;
    this.almuerzoMensaje = '';
    this.almuerzoInicio = '';
    this.almuerzoFinOriginal = '';
    this.almuerzoInicioReal = '';
    this.almuerzoDuracionMs = 0;
    this.almuerzoChatsPendientes = 0;
    this.almuerzoChatsWeb = 0;
    this.almuerzoChatsWhatsapp = 0;
    this.almuerzoProgreso = 0;
    this.almuerzoProximoMensaje = '';
    this.almuerzoError = '';
    this.confirmarFinAlmuerzo = false;
    this.terminarAlmuerzoLoading = false;
    if (restoreOnline) this.advisorStatus = 'online';
    this.stopLunchCountdown();
    localStorage.removeItem(this.LUNCH_STATE_KEY);
    this.cdr.detectChanges();

    if (estabaEnAlmuerzo) {
      if (causa === 'auto') {
        this.notification.success('Tu horario de almuerzo finalizó', 'Ya puedes recibir chats de nuevo.');
      } else if (causa === 'sync') {
        this.notification.success('Almuerzo finalizado', 'Ya estás disponible para recibir chats.');
      } else {
        this.notification.success('Almuerzo terminado', 'Volviste a estar disponible. Puedes recibir chats de nuevo.');
      }
      this.sound.playSuccessSound();
    }
  }

  loadActiveCount(): void {
    this.sessionService.findAll().subscribe({
      next: (sessions) => {
        this.chatState.reconcileSessions(sessions);
        // Sembrar el conteo desde el servidor (readAt) para que al refrescar
        // la página el contador de "chat en línea" sea consistente.
        sessions.forEach(s => {
          if (typeof s.unreadCount === 'number') {
            this.chatState.setUnread(s.id, s.unreadCount);
          }
        });
        this.chatState.sessions$.next(sessions);
        const myId = this.currentAdvisor?.id;
        const mySessions = myId
          ? sessions.filter(s => s.advisor?.id === myId && (s.status === 'waiting' || s.status === 'active'))
          : sessions.filter(s => s.status === 'waiting' || s.status === 'active');
        this.misChatsNoLeidos = mySessions.reduce(
          (sum, s) => sum + this.chatState.getUnread(s.id), 0,
        );
        this.refreshGlobalBadge();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  closeSidebarOnMobile(): void {
    if (window.innerWidth <= 768 || this.compactShellMode) {
      this.sidebarOpen = false;
    }
  }

  private syncShellMode(url: string): void {
    const shouldUseCompactShell =
      url.includes('/dashboard/whatsapp') ||
      url.includes('/dashboard/chats');
    this.compactShellMode = shouldUseCompactShell;
    if (shouldUseCompactShell) {
      this.sidebarOpen = false;
      this.profileOpen = false;
      this.appearanceOpen = false;
    }
    this.cdr.detectChanges();
  }

  private syncWhatsappMode(url: string): void {
    this.whatsappMode = url.includes('/dashboard/whatsapp')
      ? (url.includes('modo=advisors') ? 'advisors' : 'clients')
      : null;
  }

  setStatus(status: 'online' | 'busy' | 'offline'): void {
    if (status === 'online' && this.enAlmuerzo) return;
    this.advisorStatus = status;
    localStorage.setItem(this.STATUS_KEY, status);
    this.applyStatus(status);
    this.profileOpen = false;
    this.cdr.detectChanges();
  }

  private applyStatus(status: string): void {
    this.sessionService.setAdvisorStatus(status).subscribe({
      next: () => undefined,
      error: e => console.error('[Status] Error:', e),
    });
    this.socket.emit('set_advisor_status', status);
  }

  solicitarFinAlmuerzo(): void {
    this.almuerzoError = '';
    this.confirmarFinAlmuerzo = true;
    this.almuerzoModalVisible = true;
  }

  cancelarFinAlmuerzo(): void {
    this.confirmarFinAlmuerzo = false;
  }

  terminarAlmuerzo(): void {
    if (this.terminarAlmuerzoLoading || !this.enAlmuerzo) return;
    this.almuerzoError = '';
    this.terminarAlmuerzoLoading = true;
    this.socket.emit('lunch_action', { action: 'end' });
    this.resetAlmuerzo(true, 'manual');
  }

  iniciarAlmuerzoManual(): void {
    this.almuerzoError = '';
    this.almuerzoPendiente = false;
    this.socket.emit('lunch_action', { action: 'start' });
  }

  cerrarModalAlmuerzo(): void {
    this.almuerzoModalVisible = false;
    this.almuerzoError = '';
    this.confirmarFinAlmuerzo = false;
  }

  reabrirModalAlmuerzo(): void {
    this.almuerzoModalVisible = true;
    this.almuerzoError = '';
  }

  logout(): void {
    this.applyStatus('offline');
    localStorage.removeItem(this.STATUS_KEY);
    localStorage.removeItem(this.LUNCH_STATE_KEY);
    this.almuerzoMensaje = '';
    this.almuerzoInicio = '';
    this.almuerzoFinOriginal = '';
    this.almuerzoChatsPendientes = 0;
    this.almuerzoChatsWeb = 0;
    this.almuerzoChatsWhatsapp = 0;
    this.almuerzoProgreso = 0;
    this.almuerzoProximoMensaje = '';
    this.stopLunchCountdown();
    setTimeout(() => {
      this.socket.disconnect();
      this.whatsapp.disconnect();
      this.internalChat.disconnect();
      this.auth.logout();
      this.router.navigate(['/login']);
    }, 300);
  }

  private sessionFullName(session?: Session | null): string {
    if (!session) return 'Cliente';
    return `${session.clientName || ''} ${session.apellido || ''}`.trim() || 'Cliente';
  }

  private whatsappMediaLabel(type = 'text'): string {
    return {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    }[type] ?? 'Nuevo mensaje de WhatsApp';
  }

  private internalMediaLabel(message: InternalMessage): string {
    if (message.type === 'image') return 'Imagen';
    if (message.type === 'audio') return 'Audio';
    if (message.type === 'file') {
      return (message.mediaMimeType || '').startsWith('video/') ? 'Video' : (message.mediaName || 'Archivo');
    }
    return 'Mensaje';
  }

  private whatsappConversationName(chat: WaChat | undefined, message: AwNewMessage): string {
    if (chat?.isGroup) return chat.name || 'Grupo';
    return chat?.name || message.senderName || 'Cliente WhatsApp';
  }

  private handleVisibilityChange = (): void => {
    if (!document.hidden) {
      this.sound.stopTitleBlink();
      this.sound.setUnreadBadge(this.totalUnreadCount);
      this.whatsapp.refreshUnreadTotal().subscribe();
      if (!this.router.url.includes('/dashboard/whatsapp')) {
        this.whatsapp.loadChats(1).subscribe();
      }
    }
  };

  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.currentAdvisor) return;

    if (!file.type.startsWith('image/')) {
      this.almuerzoError = 'Solo se permiten imágenes';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.almuerzoError = 'La imagen no debe superar 5 MB';
      return;
    }

    this.admin.uploadPhoto(this.currentAdvisor.id, file).subscribe({
      next: res => {
        if (this.currentAdvisor) {
          this.currentAdvisor = { ...this.currentAdvisor, profilePhotoUrl: res.profilePhotoUrl };
          this.auth.updateUser(this.currentAdvisor);
        }
        input.value = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.almuerzoError = 'No se pudo subir la foto';
        input.value = '';
        this.cdr.detectChanges();
      },
    });
  }

  removeProfilePhoto(): void {
    if (!this.currentAdvisor) return;
    this.admin.deletePhoto(this.currentAdvisor.id).subscribe({
      next: () => {
        if (this.currentAdvisor) {
          this.currentAdvisor = { ...this.currentAdvisor, profilePhotoUrl: undefined };
          this.auth.updateUser(this.currentAdvisor);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.almuerzoError = 'No se pudo eliminar la foto';
        this.cdr.detectChanges();
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.teamPanelOpen) return;
    const clickedInside = this.elementRef.nativeElement.querySelector('.team-panel-wrap')?.contains(event.target as Node);
    if (!clickedInside) {
      this.teamPanelOpen = false;
      this.cdr.detectChanges();
    }
  }

  toggleTeamPanel(): void {
    this.teamPanelOpen = !this.teamPanelOpen;
  }

  toggleTeamsPanel(): void {
    this.teamsPanelOpen = !this.teamsPanelOpen;
    if (this.teamsPanelOpen) {
      this.teamsMessage = '';
      this.loadTeamsStatus();
    }
  }

  connectTeams(): void {
    if (this.isLoadingTeams) return;
    const popup = window.open('', 'innovaTeamsAuth', 'width=520,height=720');
    this.isLoadingTeams = true;
    this.teamsMessage = 'Abriendo inicio de sesion de Microsoft...';
    this.cdr.detectChanges();

    this.whatsapp.getTeamsAuthUrl().subscribe({
      next: res => {
        this.isLoadingTeams = false;
        if (popup) {
          popup.location.href = res.authUrl;
        } else {
          window.location.href = res.authUrl;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        popup?.close();
        this.isLoadingTeams = false;
        this.teamsMessage = 'No se pudo iniciar sesion en Teams.';
        this.cdr.detectChanges();
      },
    });
  }

  disconnectTeams(): void {
    if (this.isLoadingTeams) return;
    this.isLoadingTeams = true;
    this.teamsMessage = 'Desconectando Teams...';
    this.cdr.detectChanges();

    this.whatsapp.disconnectTeams().subscribe({
      next: () => {
        this.isLoadingTeams = false;
        this.isTeamsConnected = false;
        this.teamsAccountName = '';
        this.teamsMessage = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingTeams = false;
        this.teamsMessage = 'No se pudo desconectar Teams.';
        this.cdr.detectChanges();
      },
    });
  }

  private loadTeamsStatus(): void {
    this.isLoadingTeams = true;
    this.cdr.detectChanges();
    this.whatsapp.getTeamsStatus().subscribe({
      next: status => {
        this.isLoadingTeams = false;
        this.isTeamsConnected = status.connected;
        this.teamsAccountName = status.accountName || '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingTeams = false;
        this.isTeamsConnected = false;
        this.cdr.detectChanges();
      },
    });
  }

  private handleTeamsAuthMessage = (event: MessageEvent): void => {
    if (event.data?.type !== 'teams-auth') return;
    if (event.data.success) {
      this.teamsMessage = 'Teams conectado.';
      this.loadTeamsStatus();
    } else {
      this.isLoadingTeams = false;
      this.isTeamsConnected = false;
      this.teamsMessage = event.data.error || 'No se pudo conectar Teams.';
    }
    this.cdr.detectChanges();
  };

  openWhatsapp(mode: 'clients' | 'advisors' = 'clients', event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/dashboard/whatsapp'], {
      queryParams: { modo: mode },
      queryParamsHandling: 'merge',
    });
  }

  openWebChat(): void {
    this.sessionService.findAll().subscribe({
      next: (sessions) => {
        const first =
          sessions.find(s => s.status === 'waiting') ??
          sessions.find(s => this.chatState.getUnread(s.id) > 0);
        this.router.navigate(['/dashboard/chats'], {
          queryParams: first ? { openSession: first.id } : {},
          queryParamsHandling: 'merge',
        });
      },
      error: () => {
        this.router.navigate(['/dashboard/chats'], {
          queryParamsHandling: 'merge',
        });
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopLunchCountdown();
    this.teamBreakpoint.removeEventListener('change', this.onTeamBreakpoint);
    this.smallScreenBreakpoint.removeEventListener('change', this.onSmallScreenBreakpoint);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('message', this.handleTeamsAuthMessage);
    this.internalChat.disconnect();
  }
}
