import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';
import { filter, Subject, Subscription, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { InternalChatService } from '../../../core/services/internal-chat.service';
import { WhatsappChatService } from '../../../core/services/whatsapp-chat.service';
import { SoundService } from '../../../core/services/sound.service';
import { AdvisorNotificationService } from '../../../core/services/advisor-notification.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LayoutService } from '../../../core/services/layout.service';
import { NotificationBellComponent } from '../../../shared/components/notification-bell.component';
import { User } from '../../../core/models/user.model';
import { trackByIndex, trackById } from '../../../shared/utils/track-by';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastContainerComponent, NotificationBellComponent],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  currentAdmin: User | null = null;
  menuOpen = false;
  sidebarOpen = false;
  appearanceOpen = false;
  internalUnread = 0;


  private routerSub?: Subscription;
  private layoutSub?: Subscription;
  private internalUnreadSub?: Subscription;
  private destroy$ = new Subject<void>();
  private recentEventIds = new Map<string, number>();

  constructor(
    private auth: AuthService,
    private socket: SocketService,
    private internalChat: InternalChatService,
    private whatsapp: WhatsappChatService,
    private sound: SoundService,
    private advisorNotif: AdvisorNotificationService,
    private notifications: NotificationService,
    protected themeService: ThemeService,
    private router: Router,
    private layoutService: LayoutService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auth.user$.subscribe({
      next: (user) => {
        this.currentAdmin = user;
        if (user?.id) {
          this.whatsapp.joinAsAdvisor(user.id);
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.socket.connect(this.auth.getToken() ?? undefined);
    this.internalChat.connect();
    this.sound.init();
    this.internalUnreadSub = this.internalChat.getUnreadTotalStream().subscribe({
      next: total => {
        this.internalUnread = total;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.registerGlobalNotificationListeners();
    this.syncSidebarMode();
    this.routerSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe({
        next: () => this.syncSidebarMode(),
        error: (err) => console.error('HTTP Error:', err),
      });
    this.layoutSub = this.layoutService.sidebarForcedVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.collapseSidebar(),
        error: (err) => console.error('HTTP Error:', err),
      });
    this.layoutService.sidebarForcedCollapsed$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.collapseSidebar(),
        error: (err) => console.error('HTTP Error:', err),
      });
    this.layoutService.toggleSidebarRequested$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.toggleSidebar(),
        error: (err) => console.error('HTTP Error:', err),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.routerSub?.unsubscribe();
    this.layoutSub?.unsubscribe();
    this.internalUnreadSub?.unsubscribe();
    this.whatsapp.disconnect();
    this.internalChat.disconnect();
  }

  private registerGlobalNotificationListeners(): void {
    this.socket.on<{ sessionId: string; clientName: string }>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.advisorNotif.onSessionAssigned(data);
      });

    this.socket.on<{ id?: string; senderType?: string; senderName?: string; content?: string; sessionId?: string; advisorId?: string }>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.senderType !== 'client') return;
        if (!this.isRecentEvent(message.id ?? `msg-${message.sessionId}`)) return;
        this.sound.playCriticalMessage();
        this.sound.notify(
          'CHAT EN LINEA',
          `${message.senderName || 'Cliente'}\n${message.content || 'Nuevo mensaje del cliente'}`,
          `oc-message-${message.sessionId}`,
        );
      });

    this.whatsapp.onNewMessage()
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.fromMe) return;
        this.sound.playWhatsappAssignedMessage();
        const chat = this.whatsapp.getChatsSnapshot().find(item => item.id === message.chatId);
        this.sound.notify(
          'WHATSAPP',
          `${chat?.name || 'WhatsApp'}\n${message.body || 'Nuevo mensaje de WhatsApp'}`,
          `wa-message-${message.chatId}`,
        );
      });

    this.internalChat.onNewMessage()
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.senderId === this.currentAdmin?.id) return;
        if (message.type === 'system') return;
        if (this.isInternalConversationMuted(message.conversationId)) return;
        this.sound.playWhatsappAssignedMessage();
        this.sound.notify(
          'CHAT INTERNO',
          `${message.senderName}\n${message.body || 'Nuevo mensaje interno'}`,
          `internal-message-${message.conversationId}`,
        );
      });

    this.socket.on<any>('ticket:created')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET CREADO',
          data?.titulo || 'Se creo un nuevo ticket',
          `ticket-created-${data?.id}`,
        );
      });

    this.socket.on<any>('ticket:updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET ACTUALIZADO',
          data?.titulo || 'Un ticket fue actualizado',
          `ticket-updated-${data?.id}`,
        );
      });

    this.socket.on<any>('ticket:deleted')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET ELIMINADO',
          data?.titulo || 'Un ticket fue eliminado',
          `ticket-deleted-${data?.id}`,
        );
      });

    this.sound.notificationFallback$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ev => {
        const key = `fb-${ev.tag}`;
        const last = this.recentEventIds.get(key) ?? 0;
        if (Date.now() - last < 4000) return;
        this.recentEventIds.set(key, Date.now());
        this.notifications.info(ev.title, ev.body.replace(/\n/g, ' · '), ev.icon);
      });
  }

  /** Evita duplicar notificaciones cuando el admin está dentro de la sala de
   *  una sesión y además recibe la emisión global a la sala 'admins'. */
  private isRecentEvent(key: string): boolean {
    const now = Date.now();
    const last = this.recentEventIds.get(key) ?? 0;
    if (now - last < 2000) return false;
    this.recentEventIds.set(key, now);
    return true;
  }

  get roleLabel(): string {
    return 'Administrador';
  }

  openSidebar(): void {
    this.sidebarOpen = true;
    this.cdr.markForCheck();
  }

  collapseSidebar(): void {
    this.sidebarOpen = false;
    this.cdr.markForCheck();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.cdr.markForCheck();
  }

  closeSidebarOnMobile(): void {
    this.sidebarOpen = false;
    this.cdr.markForCheck();
  }

  logout(): void {
    this.socket.disconnect();
    this.internalChat.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private syncSidebarMode(): void {
    if (this.sidebarOpen) this.sidebarOpen = false;
    this.cdr.markForCheck();
  }

  private isInternalConversationMuted(conversationId: string): boolean {
    try {
      const raw = localStorage.getItem('ic_muted_conversations');
      if (!raw) return false;
      const arr = JSON.parse(raw) as string[];
      return arr.includes(conversationId);
    } catch { return false; }
  }
}
