import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { SoundService } from '../../../core/services/sound.service';
import { WhatsappChatService } from '../../../core/services/whatsapp-chat.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { User } from '../../../core/models/user.model';
import { Session } from '../../../core/models/session.model';
import { Message } from '../../../core/models/message.model';
import { AwNewMessage, WaChat } from '../../../core/models/whatsapp.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentAdvisor: User | null = null;
  advisorStatus: 'online' | 'busy' | 'offline' = 'offline';
  profileOpen = false;
  sidebarOpen = false;
  appearanceOpen = false;
  compactShellMode = false;
  activeChatsCount = 0;
  chatUnreadCount = 0;
  whatsappUnreadCount = 0;
  totalUnreadCount = 0;

  enAlmuerzo = false;
  almuerzoRestante = '';
  almuerzoFinHora = '';
  almuerzoMensaje = '';

  private lunchInterval: ReturnType<typeof setInterval> | null = null;
  private destroy$ = new Subject<void>();
  private readonly STATUS_KEY = 'advisor_status';

  constructor(
    private socket: SocketService,
    private auth: AuthService,
    private sessionService: SessionService,
    private sound: SoundService,
    private whatsapp: WhatsappChatService,
    private chatState: ChatStateService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentAdvisor = this.auth.getUser();
    this.sound.init();
    this.socket.connect(this.auth.getToken() ?? undefined);
    if (this.currentAdvisor?.id) {
      this.whatsapp.joinAsAdvisor(this.currentAdvisor.id);
    }

    const saved = localStorage.getItem(this.STATUS_KEY) as 'online' | 'busy' | 'offline';
    this.advisorStatus = saved ?? 'online';
    this.applyStatus(this.advisorStatus);
    this.socket.emit('advisor_ready');
    this.loadActiveCount();
    this.registerSocketListeners();
    this.registerGlobalNotificationListeners();
    this.syncUnreadIndicators();
    this.syncShellMode(this.router.url);
  }

  private registerSocketListeners(): void {
    this.socket.on<{ advisorId: string; status: string }>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.advisorId === this.currentAdvisor?.id) {
          this.advisorStatus = data.status as 'online' | 'busy' | 'offline';
        }
        this.cdr.detectChanges();
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

    this.socket.on<{ fin: string; restante: string }>('lunch_started')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.enAlmuerzo = true;
        this.almuerzoFinHora = data.fin;
        this.almuerzoRestante = data.restante;
        this.advisorStatus = 'busy';
        this.startLunchCountdown();
        this.cdr.detectChanges();
      });

    this.socket.on<void>('lunch_ended')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.enAlmuerzo = false;
        this.almuerzoRestante = '';
        this.almuerzoFinHora = '';
        this.almuerzoMensaje = '';
        this.advisorStatus = 'online';
        this.stopLunchCountdown();
        this.cdr.detectChanges();
      });

    this.socket.on<{ mensaje: string; chats: number }>('lunch_pending')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.almuerzoMensaje = data.mensaje;
        this.advisorStatus = 'busy';
        this.cdr.detectChanges();
      });

    this.socket.on<void>('lunch_pending_cancelled')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.almuerzoMensaje = '';
        this.cdr.detectChanges();
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

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(event => {
        this.syncShellMode(event.urlAfterRedirects);
        if (!event.urlAfterRedirects.includes('/dashboard/chats')) {
          this.chatState.setActiveSession(null);
        }
      });
  }

  private syncUnreadIndicators(): void {
    this.chatState.unreadTotal$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.chatUnreadCount = count;
        this.refreshGlobalBadge();
      });

    this.whatsapp.getChatsStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(chats => {
        this.whatsappUnreadCount = this.countWhatsappUnread(chats);
        this.refreshGlobalBadge();
      });

    this.whatsapp.loadChats().subscribe();
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
    this.sound.playCriticalMessage();
    const chat = this.whatsapp.getChatsSnapshot().find(item => item.id === message.chatId);
    this.sound.notify(
      'WHATSAPP',
      `${this.whatsappConversationName(chat, message)}\n${message.body || this.whatsappMediaLabel(message.type)}`,
      `wa-message-${message.chatId}`,
    );
  }

  private refreshGlobalBadge(): void {
    this.totalUnreadCount = this.chatUnreadCount + this.whatsappUnreadCount;
    this.sound.setUnreadBadge(this.totalUnreadCount);
    if (document.hidden && this.totalUnreadCount > 0) {
      this.sound.startTitleBlink(this.totalUnreadCount);
    }
    this.cdr.detectChanges();
  }

  private startLunchCountdown(): void {
    this.stopLunchCountdown();
    this.lunchInterval = setInterval(() => {
      if (!this.almuerzoFinHora) return;

      const now = new Date();
      const [fh, fm] = this.almuerzoFinHora.split(':').map(Number);
      const finMs = new Date(now).setHours(fh, fm, 0, 0);
      const diff = Math.max(0, finMs - now.getTime());
      const mins = Math.floor(diff / 60000);
      const segs = Math.floor((diff % 60000) / 1000);
      this.almuerzoRestante = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
      this.cdr.detectChanges();

      if (diff === 0) this.stopLunchCountdown();
    }, 1000);
  }

  private stopLunchCountdown(): void {
    if (!this.lunchInterval) return;
    clearInterval(this.lunchInterval);
    this.lunchInterval = null;
  }

  loadActiveCount(): void {
    this.sessionService.findAll().subscribe(sessions => {
      this.chatState.reconcileSessions(sessions);
      this.chatState.sessions$.next(sessions);
      this.activeChatsCount = sessions.filter(
        s => s.status === 'waiting' || s.status === 'active',
      ).length;
      this.cdr.detectChanges();
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
      url.includes('/dashboard/chats') ||
      url.includes('/dashboard/configuracion');
    this.compactShellMode = shouldUseCompactShell;
    if (shouldUseCompactShell) {
      this.sidebarOpen = false;
      this.profileOpen = false;
      this.appearanceOpen = false;
    }
    this.cdr.detectChanges();
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
      next: () => console.log(`[Status] -> ${status}`),
      error: e => console.error('[Status] Error:', e),
    });
    this.socket.emit('set_advisor_status', status);
  }

  logout(): void {
    this.applyStatus('offline');
    localStorage.removeItem(this.STATUS_KEY);
    this.almuerzoMensaje = '';
    this.stopLunchCountdown();
    setTimeout(() => {
      this.socket.disconnect();
      this.whatsapp.disconnect();
      this.auth.logout();
      this.router.navigate(['/login']);
    }, 300);
  }

  private countWhatsappUnread(chats: WaChat[]): number {
    return chats.reduce((total, chat) => total + Math.max(0, chat.unread ?? 0), 0);
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

  private whatsappConversationName(chat: WaChat | undefined, message: AwNewMessage): string {
    if (chat?.isGroup) return chat.name || 'Grupo';
    return chat?.name || message.senderName || 'Cliente WhatsApp';
  }

  private handleVisibilityChange = (): void => {
    if (!document.hidden) {
      this.sound.stopTitleBlink();
      this.sound.setUnreadBadge(this.totalUnreadCount);
    }
  };

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopLunchCountdown();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
