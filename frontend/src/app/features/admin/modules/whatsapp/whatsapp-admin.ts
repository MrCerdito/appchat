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
  WaMessage,
  WaOperationalStatus,
} from '../../../../core/models/whatsapp.models';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

type AdminWaTab = 'overview' | 'chats' | 'advisors' | 'fixed' | 'alerts';

interface MessageReactionView {
  emoji: string;
  by: string;
  removed: boolean;
  fromMe: boolean;
}

interface ToastMessage {
  id: number;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
}

@Component({
  selector: 'app-whatsapp-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  };
  selectedChat?: WaChat;
  activeTab: AdminWaTab = 'overview';
  query = '';
  statusFilter: WaOperationalStatus | 'all' = 'all';
  selectedAdvisorId = '';
  selectedMessages: WaMessage[] = [];
  replyText = '';
  selectedFile?: File;
  sendingReply = false;
  loading = true;
  loadingMessages = false;
  actionMessage = '';
  actionToasts: ToastMessage[] = [];
  profilePhotoPreview?: { src: string; name: string };
  mediaPreview?: { src: string; name: string };
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
  private readonly TOAST_DURATION = 4_000;
  private toastIdCounter = 0;

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
      this.pushToast('info', 'WhatsApp asignado', `${data.chat.name} -> ${data.advisorName}`);
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
        const chat = this.allChats.find(item => item.id === message.chatId);
        this.pushToast('info', 'Nuevo mensaje WhatsApp', `${chat?.name || message.senderName || 'Cliente'}: ${this.messagePreview(message)}`);
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
        this.loading = false;
        if (this.selectedChat) {
          this.selectedChat = dashboard.chats.find(chat => chat.id === this.selectedChat?.id);
        }
        this.computeSummary(dashboard.summary.slaBreached, dashboard.summary.frozenChats);
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
  }

  closeMediaPreview(): void {
    this.mediaPreview = undefined;
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
      return matchesQuery && matchesStatus;
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

  private computeSummary(slaBreached = this.summary.slaBreached, frozenChats = this.summary.frozenChats): void {
    this.summary = {
      totalChats: this.allChats.length,
      activeChats: this.allChats.filter(c => c.assignmentStatus === 'active' && !c.isGroup).length,
      queuedChats: this.allChats.filter(c => c.assignmentStatus === 'waiting' && c.operationalStatus !== 'waiting_customer').length,
      waitingCustomerChats: this.allChats.filter(c => c.operationalStatus === 'waiting_customer').length,
      waitingTechnicalChats: this.allChats.filter(c => c.operationalStatus === 'waiting_technical').length,
      closedChats: this.allChats.filter(c => c.assignmentStatus === 'closed').length,
      fixedClients: this.allChats.filter(c => !!c.fixedAdvisorId).length,
      manualChats: this.allChats.filter(c => c.assignmentMode === 'manual' || c.assignmentMode === 'admin').length,
      slaBreached,
      frozenChats,
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

  private notifyNewAlerts(alerts: WaAdminAlert[]): void {
    const now = Date.now();
    for (const alert of alerts) {
      if (alert.severity !== 'critical' && alert.severity !== 'warning') continue;
      const key = `${alert.type}:${alert.chatId || ''}:${alert.advisorId || ''}`;
      const last = this.alertThrottle.get(key);
      if (last && now - last < this.ALERT_COOLDOWN) continue;
      this.alertThrottle.set(key, now);
      this.pushToast(alert.severity, alert.title, alert.detail);
    }
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

  private showMessage(message: string, severity: 'info' | 'warning' | 'critical' = 'info'): void {
    this.pushToast(severity, message, '');
  }

  private pushToast(severity: 'info' | 'warning' | 'critical', title: string, body: string): void {
    const id = ++this.toastIdCounter;
    this.actionToasts = [...this.actionToasts, { id, title, body, severity }];
    this.cdr.detectChanges();
    setTimeout(() => this.removeToast(id), this.TOAST_DURATION);
  }

  private removeToast(id: number): void {
    this.actionToasts = this.actionToasts.filter(t => t.id !== id);
    this.cdr.detectChanges();
  }
}
