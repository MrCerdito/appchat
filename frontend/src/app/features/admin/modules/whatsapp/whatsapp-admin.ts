import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ThemeService } from '../../../../core/services/theme.service';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import {
  WaAdminAlert,
  WaAdminDashboard,
  WaAdvisorStats,
  WaChat,
  WaConnectionStatus,
  WaMessage,
  WaOperationalStatus,
} from '../../../../core/models/whatsapp.models';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { priorityLabel, priorityColor } from '../../../../shared/utils/ticket-categories';
import { LucideIconComponent } from '../../../../shared/components/lucide-icon/lucide-icon.component';

type AdminWaTab = 'overview' | 'chats' | 'advisors' | 'fixed' | 'alerts';

interface MessageReactionView {
  emoji: string;
  by: string;
  removed: boolean;
  fromMe: boolean;
}

interface TimelineEvent {
  id: string;
  type: 'message' | 'assignment' | 'status' | 'alert';
  text: string;
  time: Date;
  chatId?: string;
}

@Component({
  selector: 'app-whatsapp-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideIconComponent],
  templateUrl: './whatsapp-admin.html',
  styleUrl: './whatsapp-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappAdminComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @HostBinding('class.theme-light') get isLightTheme(): boolean {
    return this.theme === 'light';
  }

  @ViewChild('adminFileInput') adminFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('messageFeed', { static: false }) messageFeedEl?: ElementRef<HTMLElement>;

  allChats: WaChat[] = [];
  allAdvisors: WaAdvisorStats[] = [];
  allAlerts: WaAdminAlert[] = [];
  summary: WaAdminDashboard['summary'] = {
    totalChats: 0,
    activeChats: 0,
    queuedChats: 0,
    waitingCustomerChats: 0,
    waitingTechnicalChats: 0,
    closedChats: 0,
    fixedClients: 0,
    manualChats: 0,
    slaBreached: 0,
    frozenChats: 0,
    avgResponseMinutes: 0,
    slaCompliancePercent: 100,
    closedToday: 0,
    uniqueClientsToday: 0,
  };
  selectedChat?: WaChat;
  activeTab: AdminWaTab = 'overview';
  query = '';
  statusFilter: WaOperationalStatus | 'all' = 'all';
  selectedAdvisorId = '';
  selectedMessages: WaMessage[] = [];
  connectionStatus: WaConnectionStatus = { status: 'disconnected', updatedAt: new Date().toISOString() };
  timeline: TimelineEvent[] = [];
  filterDate: string = new Date().toISOString().slice(0, 10);
  severityFilter: 'all' | 'info' | 'warning' | 'critical' = 'all';
  chatsPage = 1;
  chatsPerPage = 10;
  readonly chatsPerPageOptions = [5, 10, 20, 50];
  readonly priorityOptions = ['low', 'normal', 'high', 'critical'] as const;
  canalFilter: 'all' | 'individual' | 'group' = 'all';
  slaFilter: 'all' | 'at_risk' | 'breached' | 'ok' = 'all';
  priorityFilter: 'all' | 'low' | 'normal' | 'high' | 'critical' = 'all';
  advisorFilter: string = '';

  readonly canalOptions: { id: string; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'individual', label: 'Individual' },
    { id: 'group', label: 'Grupo' },
  ];

  readonly slaFilterOptions: { id: string; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'at_risk', label: 'En riesgo' },
    { id: 'breached', label: 'Vencido' },
    { id: 'ok', label: 'OK' },
  ];

  readonly priorityFilterOptions: { id: string; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'low', label: priorityLabel('low') },
    { id: 'normal', label: priorityLabel('normal') },
    { id: 'high', label: priorityLabel('high') },
    { id: 'critical', label: priorityLabel('critical') },
  ];
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;
  private readonly maxTimeline = 30;
  replyText = '';
  selectedFile?: File;
  sendingReply = false;
  loading = true;
  loadingMessages = false;
  actionMessage = '';
  profilePhotoPreview?: { src: string; name: string };
  mediaPreview?: { src: string; name: string };
  mediaZoom = 1;
  mediaPanX = 0;
  mediaPanY = 0;
  protected isMediaDragging = false;
  private mediaDragStartX = 0;
  private mediaDragStartY = 0;
  private mediaDragPanX = 0;
  private mediaDragPanY = 0;
  private mediaPinchDist = 0;
  messageMenu?: { x: number; y: number; message: WaMessage };
  theme: 'dark' | 'light' = 'light';
  readonly reactionOptions = ['\u{1F44D}', '\u2705', '\u274C'];

  readonly tabs: { id: AdminWaTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Operacion', icon: 'ti-layout-dashboard' },
    { id: 'chats', label: 'Chats', icon: 'ti-message-circle' },
    { id: 'advisors', label: 'Asesores', icon: 'ti-users' },
    { id: 'fixed', label: 'Fijos', icon: 'ti-user-star' },
    { id: 'alerts', label: 'Alertas', icon: 'ti-alert-triangle' },
  ];

  readonly statusOptions: { id: WaOperationalStatus | 'all'; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'new', label: 'Nuevo' },
    { id: 'queued', label: 'En cola' },
    { id: 'assigned', label: 'Asignado' },
    { id: 'in_progress', label: 'En gestion' },
    { id: 'waiting_technical', label: 'Esperando soporte' },
    { id: 'resolved', label: 'Resuelto' },
    { id: 'closed', label: 'Cerrado' },
  ];

  private readonly subs = new Subscription();
  private readonly alertThrottle = new Map<string, number>();
  private readonly ALERT_COOLDOWN = 60_000;

  constructor(
    private readonly waService: WhatsappChatService,
    private readonly themeService: ThemeService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.theme = this.themeService.currentTheme;
    this.subs.add(
      this.themeService.currentTheme$.subscribe(t => {
        this.theme = t;
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.waService.getConnectionStream().subscribe(status => {
        this.connectionStatus = status;
        this.cdr.detectChanges();
      }),
    );

    this.loadDashboard();

    this.subs.add(
      this.waService.getChatsStream().subscribe(chats => {
        if (this.allChats === chats) return;
        this.allChats = chats;
        this.computeSummary();
        if (this.selectedChat) {
          const updated = chats.find(c => c.id === this.selectedChat!.id);
          if (updated) {
            this.selectedChat = updated;
            this.selectedAdvisorId = updated.assignedTo || updated.fixedAdvisorId || '';
            this.selectedMessages = updated.messages ?? this.selectedMessages;
          }
        }
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(this.waService.onChatAssigned().subscribe(data => {
      this.applyRealtimeChat(data.chat);
      this.pushTimeline('assignment', `${data.advisorName} asignado a ${data.chat.name}`, data.chat.id);
    }));

    this.subs.add(this.waService.onChatUpdated().subscribe(chat => {
      this.applyRealtimeChat(chat);
      if (chat.id === this.selectedChat?.id) {
        this.selectedMessages = chat.messages ?? this.selectedMessages;
        this.cdr.detectChanges();
      }
    }));

    this.subs.add(this.waService.onNewMessage().subscribe(message => {
      if (message.chatId === this.selectedChat?.id) {
        const nearBottom = this.isNearBottom;
        if (!this.selectedMessages.some(item => item.id === message.id)) {
          this.selectedMessages = [...this.selectedMessages, message];
        }
        this.cdr.detectChanges();
        if (nearBottom) this.scrollToBottom(true);
      }
      if (!message.fromMe && !this.isReactionMessage(message)) {
        this.pushTimeline('message', `Nuevo mensaje de cliente`, message.chatId);
      }
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  @HostListener('document:click')
  closeMessageMenu(): void {
    this.messageMenu = undefined;
  }

  loadDashboard(): void {
    this.loading = true;
    this.waService.loadAdminDashboard().subscribe({
      next: dashboard => {
        this.allChats = dashboard.chats;
        this.allAdvisors = dashboard.advisors;
        this.allAlerts = dashboard.alerts;
        this.notifyNewAlerts(dashboard.alerts);
        this.summary = dashboard.summary;
        this.loading = false;
        if (this.selectedChat) {
          this.selectedChat = dashboard.chats.find(chat => chat.id === this.selectedChat?.id);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.showMessage('No se pudo cargar la consola de WhatsApp.', 'critical');
        this.cdr.detectChanges();
      },
    });
  }

  refresh(showLoading = true): void {
    this.loadDashboard();
  }

  selectChat(chat: WaChat): void {
    this.selectedChat = chat;
    this.selectedAdvisorId = chat.assignedTo || chat.fixedAdvisorId || '';
    this.selectedMessages = chat.messages ?? [];
    if (chat.unread > 0) {
      this.waService.markRead(chat.id).subscribe(() => {
        this.applyRealtimeChat({ ...chat, unread: 0 });
      });
    }
    this.loadSelectedMessages(chat.id);
  }

  toggleTheme(): void {
    this.themeService.setMode(this.theme === 'dark' ? 'light' : 'dark');
  }

  private loadSelectedMessages(chatId: string, showLoading = true): void {
    if (showLoading) {
      this.loadingMessages = true;
      this.cdr.detectChanges();
    }
    this.loadingMessages = showLoading;
    this.waService.loadMessages(chatId).subscribe({
      next: messages => {
        if (this.selectedChat?.id === chatId) {
          this.selectedMessages = messages;
          this.loadingMessages = false;
          this.cdr.detectChanges();
          this.scrollToBottom(false);
        }
      },
      error: () => {
        this.loadingMessages = false;
        this.showMessage('No se pudo cargar la conversacion.');
      },
    });
  }

  pickFile(): void {
    this.adminFileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0];
    input.value = '';
  }

  clearSelectedFile(): void {
    this.selectedFile = undefined;
  }

  openProfilePhoto(chat: WaChat, event?: Event): void {
    event?.stopPropagation();
    this.profilePhotoPreview = {
      src: chat.avatar,
      name: chat.name || chat.phone || 'WhatsApp',
    };
  }

  closeProfilePhoto(): void {
    this.profilePhotoPreview = undefined;
  }

  openMediaPreview(message: WaMessage, event?: Event): void {
    event?.stopPropagation();
    const src = this.mediaUrlFor(message);
    if (!src) return;
    this.mediaPreview = {
      src,
      name: message.fileName || message.body || 'Imagen',
    };
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
  }

  closeMediaPreview(): void {
    this.mediaPreview = undefined;
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
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
    } else if (event.touches.length === 2) {
      const dist = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      const delta = (dist - this.mediaPinchDist) * 0.01;
      this.mediaZoom = Math.max(0.25, Math.min(10, this.mediaZoom + delta));
      this.mediaPinchDist = dist;
    }
  }

  onMediaTouchEnd(): void {
    this.isMediaDragging = false;
  }

  openMessageMenu(event: MouseEvent, message: WaMessage): void {
    if (!this.canReactToMessage(message)) return;
    event.preventDefault();
    event.stopPropagation();
    const width = 168;
    const height = 96;
    this.messageMenu = {
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      message,
    };
  }

  canReactToMessage(message?: WaMessage): boolean {
    return !!this.selectedChat && !!message && !this.isReactionMessage(message) && !!message.metaMessageId;
  }

  reactToMessage(message: WaMessage, emoji: string): void {
    if (!this.selectedChat || !this.canReactToMessage(message)) return;
    const chatId = this.selectedChat.id;
    this.closeMessageMenu();
    this.waService.reactToMessage(chatId, message.id, emoji).subscribe({
      next: chat => {
        this.selectedChat = chat;
        this.selectedMessages = chat.messages ?? this.selectedMessages;
        this.applyRealtimeChat(chat);
        this.showMessage(emoji ? 'Reaccion registrada.' : 'Reaccion retirada.');
      },
      error: () => this.showMessage('No se pudo registrar la reaccion.'),
    });
  }

  sendAdminReply(): void {
    if (!this.selectedChat || this.sendingReply) return;
    const address = this.selectedChat.jid || this.selectedChat.phone;
    const text = this.replyText.trim();
    if (!address || (!text && !this.selectedFile)) return;

    this.sendingReply = true;
    const request = this.selectedFile
      ? this.waService.sendMedia(address, this.selectedFile, text)
      : this.waService.sendMessage(address, text);

    request.subscribe({
      next: res => {
        this.sendingReply = false;
        this.replyText = '';
        this.selectedFile = undefined;
        if (res.chat) {
          this.selectedChat = res.chat;
          this.selectChat(res.chat);
        }
        this.showMessage('Mensaje enviado.');
      },
      error: () => {
        this.sendingReply = false;
        this.showMessage('No se pudo enviar el mensaje.');
        this.cdr.detectChanges();
      },
    });
  }

  assignSelected(): void {
    if (!this.selectedChat || !this.selectedAdvisorId) return;
    this.waService.adminAssignChat(this.selectedChat.id, this.selectedAdvisorId).subscribe({
      next: chat => {
        this.selectedChat = chat;
        this.showMessage('Chat asignado correctamente.');
      },
      error: () => this.showMessage('No se pudo asignar el chat.'),
    });
  }

  setFixedSelected(): void {
    if (!this.selectedChat || !this.selectedAdvisorId) return;
    const chatId = this.selectedChat.id;
    const advisorId = this.selectedAdvisorId;
    this.waService.setFixedAdvisor(this.selectedChat.id, this.selectedAdvisorId).subscribe({
      next: () => {
        this.waService.adminAssignChat(chatId, advisorId).subscribe({
          next: chat => {
            this.selectedChat = chat;
            this.showMessage('Asesor fijo asignado correctamente.');
          },
          error: () => {
            this.showMessage('El asesor quedo fijo, pero no se pudo asignar el chat.');
          },
        });
      },
      error: () => this.showMessage('No se pudo fijar el asesor.'),
    });
  }

  clearFixedSelected(chat = this.selectedChat): void {
    if (!chat) return;
    this.waService.clearFixedAdvisor(chat.id).subscribe({
      next: updated => {
        if (this.selectedChat?.id === updated.id) this.selectedChat = updated;
        this.showMessage('Asesor fijo retirado.');
      },
      error: () => this.showMessage('No se pudo retirar el asesor fijo.'),
    });
  }

  updateSelectedStatus(status: WaOperationalStatus): void {
    if (!this.selectedChat) return;
    this.waService.updateOperationalStatus(this.selectedChat.id, status).subscribe({
      next: chat => {
        this.selectedChat = chat;
        this.showMessage('Estado actualizado.');
      },
      error: () => this.showMessage('No se pudo actualizar el estado.'),
    });
  }

  get filteredChats(): WaChat[] {
    const q = this.query.trim().toLowerCase();
    return this.allChats.filter(chat => {
      const matchesQuery = !q || [
        chat.name,
        chat.phone,
        chat.institution,
        chat.assignedToName,
        chat.fixedAdvisorName,
      ].some(value => (value || '').toLowerCase().includes(q));
      const matchesStatus = this.statusFilter === 'all' || chat.operationalStatus === this.statusFilter;
      const matchesCanal = this.canalFilter === 'all'
        || (this.canalFilter === 'group' && chat.isGroup)
        || (this.canalFilter === 'individual' && !chat.isGroup);
      const matchesAdvisor = !this.advisorFilter || chat.assignedTo === this.advisorFilter || chat.fixedAdvisorId === this.advisorFilter;
      const matchesSla = this.slaFilter === 'all'
        || (this.slaFilter === 'breached' && this.allAlerts.some(a => a.type === 'sla_breached' && a.chatId === chat.id))
        || (this.slaFilter === 'at_risk' && this.slaPercentFor(chat) < 50 && this.slaPercentFor(chat) > 0)
        || (this.slaFilter === 'ok' && this.slaPercentFor(chat) >= 50);
      const matchesPriority = this.priorityFilter === 'all' || (chat.priority || 'normal') === this.priorityFilter;
      return matchesQuery && matchesStatus && matchesCanal && matchesAdvisor && matchesSla && matchesPriority;
    });
  }

  get fixedChats(): WaChat[] {
    return this.allChats.filter(chat => !!chat.fixedAdvisorId);
  }

  visibleConversationMessages(messages = this.selectedMessages): WaMessage[] {
    return messages.filter(message => !this.isReactionMessage(message));
  }

  messageReactions(message: WaMessage, messages: WaMessage[] = this.selectedMessages): MessageReactionView[] {
    return messages
      .filter(candidate => this.reactionBelongsToMessage(candidate, message, messages))
      .map(candidate => ({
        emoji: this.reactionText(candidate),
        by: candidate.reactionByName || candidate.senderName || 'Asesor',
        removed: !!candidate.reactionRemoved || !this.reactionText(candidate),
        fromMe: candidate.fromMe,
      }))
      .filter(reaction => reaction.emoji || reaction.removed);
  }

  trackChat(_: number, chat: WaChat): string {
    return chat.id;
  }

  advisorStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      online: 'Disponible',
      busy: 'En chat',
      offline: 'Offline',
      Disponible: 'Disponible',
      'En chat': 'En chat',
      Ausente: 'Ausente',
      Pausa: 'Pausa',
      Almuerzo: 'Almuerzo',
      Capacitacion: 'Capacitacion',
    };
    return labels[status] ?? status;
  }

  alertIcon(alert: WaAdminAlert): string {
    if (alert.severity === 'critical') return 'ti-alert-octagon';
    if (alert.severity === 'warning') return 'ti-alert-triangle';
    return 'ti-info-circle';
  }

  advisorById(id?: string): WaAdvisorStats | undefined {
    return this.allAdvisors.find(advisor => advisor.id === id);
  }

  assignmentLabel(chat: WaChat): string {
    if (!chat.assignedToName) return 'Sin asignar';
    const modes: Record<string, string> = {
      auto: 'Autoasignado',
      manual: 'Tomado por asesor',
      admin: 'Asignado a',
      temporary: 'Asignado temporal',
      fixed: 'Asignado fijo',
    };
    const mode = chat.assignmentMode ? modes[chat.assignmentMode] : 'Asignado';
    return `${mode}: ${chat.assignedToName}`;
  }

  assignmentClass(chat: WaChat): string {
    if (!chat.assignedToName) return 'unassigned';
    return chat.assignmentMode || 'assigned';
  }

  messageTime(message: WaMessage): string {
    return new Date(message.timestamp).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    });
  }

  messageAuthor(message: WaMessage): string {
    if (!message.fromMe) return message.senderName || this.selectedChat?.name || 'Cliente';
    return message.senderName || 'Asesor';
  }

  mediaUrlFor(message: WaMessage): string {
    return message.mediaUrl || '';
  }

  showMessageText(message: WaMessage): boolean {
    const body = (message.body || '').trim();
    if (!body || this.isEncryptedBlob(body)) return false;
    return !message.type || message.type === 'text';
  }

  mediaLabel(message: WaMessage): string {
    const labels: Record<string, string> = {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    };
    return message.fileName || labels[message.type] || 'Archivo';
  }

  messagePreview(message: WaMessage): string {
    if (this.isReactionMessage(message)) return this.reactionText(message) ? `Reaccion ${this.reactionText(message)}` : 'Reaccion';
    if (message.type && message.type !== 'text') return this.mediaLabel(message);
    if (this.isEncryptedBlob(message.body || '')) return this.mediaLabel(message);
    return (message.body || '').trim().slice(0, 90) || 'Mensaje';
  }

  private get isNearBottom(): boolean {
    const el = this.messageFeedEl?.nativeElement;
    if (!el) return true;
    const threshold = 120;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  private scrollToBottom(smooth = true): void {
    const el = this.messageFeedEl?.nativeElement;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  private computeSummary(): void {
    const activeChats = this.allChats.filter(c => c.assignmentStatus === 'active' && !c.isGroup).length;
    const slaBreached = this.allAlerts.filter(a => a.type === 'sla_breached').length;
    this.summary = {
      totalChats: this.allChats.length,
      activeChats,
      queuedChats: this.allChats.filter(c => c.assignmentStatus === 'waiting' && c.operationalStatus !== 'waiting_customer').length,
      waitingCustomerChats: this.allChats.filter(c => c.operationalStatus === 'waiting_customer').length,
      waitingTechnicalChats: this.allChats.filter(c => c.operationalStatus === 'waiting_technical').length,
      closedChats: this.allChats.filter(c => c.assignmentStatus === 'closed').length,
      fixedClients: this.allChats.filter(c => !!c.fixedAdvisorId).length,
      manualChats: this.allChats.filter(c => c.assignmentMode === 'manual' || c.assignmentMode === 'admin').length,
      slaBreached,
      frozenChats: this.allAlerts.filter(a => a.type === 'frozen_chat').length,
      avgResponseMinutes: this.allAdvisors.length
        ? Math.round(this.allAdvisors.reduce((s, a) => s + a.avgResponseMinutes, 0) / this.allAdvisors.length)
        : 0,
      slaCompliancePercent: activeChats
        ? Math.max(0, Math.round(((activeChats - slaBreached) / activeChats) * 100))
        : 100,
      closedToday: 0,
      uniqueClientsToday: 0,
    };
  }

  private applyRealtimeChat(chat: WaChat): void {
    const index = this.allChats.findIndex(item => item.id === chat.id);
    if (index >= 0) {
      const updated = [...this.allChats];
      updated[index] = { ...updated[index], ...chat };
      this.allChats = updated;
    } else {
      this.allChats = [chat, ...this.allChats];
    }
    this.computeSummary();
    if (this.selectedChat?.id === chat.id) {
      this.selectedChat = { ...this.selectedChat, ...chat };
      this.selectedAdvisorId = this.selectedChat.assignedTo || this.selectedChat.fixedAdvisorId || '';
    }
    this.cdr.detectChanges();
  }

  get pagedChats(): WaChat[] {
    const start = (this.chatsPage - 1) * this.chatsPerPage;
    return this.filteredChats.slice(start, start + this.chatsPerPage);
  }

  get totalChatPages(): number {
    return Math.max(1, Math.ceil(this.filteredChats.length / this.chatsPerPage));
  }

  get chatPageNumbers(): number[] {
    const total = this.totalChatPages;
    const current = this.chatsPage;
    const pages: number[] = [];
    const startPage = Math.max(1, current - 2);
    const endPage = Math.min(total, current + 2);
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  }

  prevPage(): void {
    if (this.chatsPage > 1) this.chatsPage--;
  }

  nextPage(): void {
    if (this.chatsPage < this.totalChatPages) this.chatsPage++;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalChatPages) this.chatsPage = page;
  }

  onChatsPerPageChange(): void {
    this.chatsPage = 1;
  }

  updatePriority(chat: WaChat, priority: string): void {
    this.waService.updateChatPriority(chat.id, priority).subscribe({
      next: () => {
        this.showMessage(`Prioridad actualizada a ${priorityLabel(priority)}`);
      },
      error: () => this.showMessage('No se pudo actualizar la prioridad.'),
    });
  }

  slaColor(chat: WaChat): string {
    if (chat.assignmentStatus !== 'active') return '#6b7280';
    const isBreached = this.allAlerts.some(a => a.type === 'sla_breached' && a.chatId === chat.id);
    if (isBreached) return '#dc2626';
    if (chat.operationalStatus === 'waiting_customer' || chat.operationalStatus === 'queued') return '#f59e0b';
    return '#10b981';
  }

  slaPercentFor(chat: WaChat): number {
    if (chat.assignmentStatus !== 'active' || !chat.lastClientMsg) return 100;
    const minutesSince = (Date.now() - new Date(chat.lastClientMsg).getTime()) / 60000;
    if (minutesSince >= 10) return 0;
    return Math.max(0, Math.round((1 - minutesSince / 10) * 100));
  }

  alertTypeIcon(alert: WaAdminAlert): string {
    const icons: Record<string, string> = {
      sla_breached: 'octagon-alert',
      frozen_chat: 'snowflake',
      advisor_idle: 'pause',
      long_queue: 'layers',
      too_many_open: 'messages-square',
    };
    return icons[alert.type] ?? (alert.severity === 'critical' ? 'octagon-alert' : alert.severity === 'warning' ? 'triangle-alert' : 'info');
  }

  generateReport(): void {
    const rows = this.filteredChats.map(chat => [
      chat.name,
      chat.phone,
      chat.operationalStatusLabel || chat.stage,
      chat.assignedToName || 'Sin asignar',
      chat.fixedAdvisorName || '-',
      chat.preview.slice(0, 60),
      `${this.slaPercentFor(chat)}%`,
      priorityLabel(chat.priority || 'normal'),
      chat.assignmentMode || 'auto',
      chat.time,
    ]);
    const header = ['Contacto', 'Telefono', 'Estado', 'Asignado', 'Fijo', 'Ultimo mensaje', 'SLA', 'Prioridad', 'Modo', 'Ultima actividad'];
    const csv = [header.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-whatsapp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  get filteredAlerts(): WaAdminAlert[] {
    if (this.severityFilter === 'all') return this.allAlerts;
    return this.allAlerts.filter(a => a.severity === this.severityFilter);
  }

  get riskLevel(): 'low' | 'medium' | 'high' {
    const criticalCount = this.allAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = this.allAlerts.filter(a => a.severity === 'warning').length;
    if (criticalCount >= 3) return 'high';
    if (criticalCount >= 1 || warningCount >= 3) return 'medium';
    return 'low';
  }

  get inactiveAdvisors(): number {
    return this.allAdvisors.filter(a => !a.active || a.status === 'offline').length;
  }

  get kpiList(): { icon: string; label: string; value: number | string; color: string; mini?: string }[] {
    return [
      { icon: 'message-circle', label: 'Activos', value: this.summary.activeChats, color: 'blue' },
      { icon: 'clock', label: 'En cola', value: this.summary.queuedChats, color: 'amber' },
      { icon: 'user-pause', label: 'Esperando cliente', value: this.summary.waitingCustomerChats, color: 'purple' },
      { icon: 'triangle-alert', label: 'SLA vencido', value: this.summary.slaBreached, color: 'red' },
      { icon: 'circle-check', label: 'Cerrados hoy', value: this.summary.closedToday, color: 'green' },
      { icon: 'users', label: 'Clientes unicos hoy', value: this.summary.uniqueClientsToday, color: 'teal' },
      { icon: 'timer', label: 'Respuesta prom.', value: `${this.summary.avgResponseMinutes}`, color: 'orange', mini: 'min' },
      { icon: 'shield-check', label: 'SLA cumplimiento', value: `${this.summary.slaCompliancePercent}`, color: 'primary', mini: '%' },
    ];
  }

  resetFilters(): void {
    this.query = '';
    this.statusFilter = 'all';
    this.canalFilter = 'all';
    this.slaFilter = 'all';
    this.priorityFilter = 'all';
    this.advisorFilter = '';
    this.selectedAdvisorId = '';
    this.filterDate = new Date().toISOString().slice(0, 10);
  }

  get dailySummary() {
    return {
      newMessages: this.allChats.reduce((s, c) => s + c.unread, 0),
      activeAdvisors: this.allAdvisors.filter(a => a.active && a.status !== 'offline').length,
      avgLoad: this.allAdvisors.length
        ? Math.round(this.allAdvisors.reduce((s, a) => s + a.activeChats, 0) / this.allAdvisors.length * 10) / 10
        : 0,
    };
  }

  private pushTimeline(type: TimelineEvent['type'], text: string, chatId?: string): void {
    const event: TimelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      text,
      time: new Date(),
      chatId,
    };
    this.timeline = [event, ...this.timeline].slice(0, this.maxTimeline);
  }

  private notifyNewAlerts(_alerts: WaAdminAlert[]): void {
  }

  private isEncryptedBlob(value: string): boolean {
    return /^enc:v\d+:/i.test(value) || /enc:v\d+:/i.test(value);
  }

  private isReactionMessage(message?: WaMessage): boolean {
    if (!message) return false;
    return message.type === 'reaction' || /^\[Reaccion(?::\s*.+)?\]$/i.test((message.body || '').trim());
  }

  private reactionText(message: WaMessage): string {
    const body = (message.body || '').trim();
    if (message.reactionRemoved || this.isEncryptedBlob(body) || body === '__reaction_removed__') return '';
    const raw = message.type === 'reaction'
      ? body
      : body.match(/^\[Reaccion(?::\s*(.+))?\]$/i)?.[1]?.trim() ?? '';
    return this.normalizeReactionEmoji(raw);
  }

  private reactionBelongsToMessage(reaction: WaMessage, message: WaMessage, messages: WaMessage[]): boolean {
    if (!this.isReactionMessage(reaction)) return false;
    const targetId = reaction.reactionToMessageId || reaction.mediaId;
    if (targetId) return targetId === message.metaMessageId || targetId === message.id;

    const reactionIndex = messages.findIndex(item => item.id === reaction.id);
    const messageIndex = messages.findIndex(item => item.id === message.id);
    if (reactionIndex <= messageIndex) return false;
    for (let i = reactionIndex - 1; i >= 0; i -= 1) {
      if (!this.isReactionMessage(messages[i])) return messages[i].id === message.id;
    }
    return false;
  }

  private normalizeReactionEmoji(value = ''): string {
    const clean = value.trim();
    const map: Record<string, string> = {
      '\u{1F44D}': '\u{1F44D}',
      '\u2705': '\u2705',
      '\u274C': '\u274C',
      '\u2611\uFE0F': '\u2705',
      '\u2714\uFE0F': '\u2705',
      '\u2713': '\u2705',
      x: '\u274C',
      X: '\u274C',
    };
    return map[clean] ?? '';
  }

  private showMessage(message: string, _severity?: string): void {
    this.actionMessage = message;
    this.cdr.detectChanges();
    setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 3000);
  }
}
