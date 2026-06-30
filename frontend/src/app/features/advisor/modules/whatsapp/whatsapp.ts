import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription, timeout } from 'rxjs';

import { AiService } from '../../../../core/services/ai.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfiguracionFrontendService } from '../../../../core/services/configuracion.service';
import { TicketService } from '../../../../core/services/ticket.service';
import { SoundService } from '../../../../core/services/sound.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import {
  AwChatAssigned,
  AwNewMessage,
  AwQueueUpdated,
  WaChat,
  WaConnectionStatus,
  WaContactUpdate,
  WaMessage,
} from '../../../../core/models/whatsapp.models';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { priorityLabel } from '../../../../shared/utils/ticket-categories';

export type { WaChat as Contact };

type WaFilter = 'all' | 'mine' | 'queue' | 'groups' | 'unread' | 'closed';
type WindowState = 'open' | 'warning' | 'closed';
type WaTheme = 'dark' | 'light';
type WaOperationalStatus =
  | 'new'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_technical'
  | 'resolved'
  | 'closed';

interface ContactDraft {
  name: string;
  role: string;
  institution: string;
  institutionUrl: string;
  city: string;
  phone: string;
  email: string;
  plan: string;
  modulesText: string;
}

interface WhatsappSettingsDraft {
  assignmentMsg: string;
  queueMsg: string;
  callUnavailableMsg: string;
  quickRepliesText: string;
}

interface TeamsMeetingDraft {
  subject: string;
  startDateTime: string;
  durationMinutes: number;
  calendarTarget: 'personal' | 'shared' | 'none';
}

interface MessageReactionView {
  id: string;
  emoji: string;
  by: string;
  removed: boolean;
  fromMe: boolean;
}

interface MessageReactionGroup {
  emoji: string;
  count: number;
}

@Component({
  selector: 'app-whatsapp-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @HostBinding('class.theme-light') get isLightTheme(): boolean {
    return this.theme === 'light';
  }

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  queueCopy = 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.';
  readonly defaultAssignmentMsg =
    'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.';
  readonly defaultCallUnavailableMsg =
    'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.';
  readonly defaultQuickReplies = [
    'Hola, con gusto reviso tu caso.',
    'Dame un momento mientras valido la informacion.',
    'Quedo atento si necesitas algo mas.',
  ];
  readonly filterOptions: { id: WaFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'mine', label: 'Mis chats' },
    { id: 'queue', label: 'En cola' },
  ];
  readonly moreFilterOptions: { id: WaFilter; label: string }[] = [
    { id: 'groups', label: 'Grupos' },
    { id: 'unread', label: 'Sin leer' },
    { id: 'closed', label: 'Cerradas' },
  ];
  readonly operationalStatusOptions: { id: WaOperationalStatus; label: string; hint: string }[] = [
    { id: 'in_progress', label: 'En gestion', hint: 'Atencion activa del caso.' },
    { id: 'waiting_technical', label: 'Esperando soporte', hint: 'Mantiene el asesor asignado y no dispara cierre.' },
    { id: 'resolved', label: 'Resuelto', hint: 'Solucionado; entra al tiempo de cierre automatico.' },
  ];
  readonly editWindowMs = 15 * 60_000;
  readonly deleteWindowMs = 60 * 60 * 60_000;

  contacts: WaChat[] = [];
  activeContact?: WaChat;
  contactDraft: ContactDraft = this.emptyDraft();
  settingsDraft: WhatsappSettingsDraft = this.defaultSettingsDraft();

  activeFilter: WaFilter = 'all';
  searchQuery = '';
  messageText = '';
  selectedFile?: File;
  openReactionPopoverId = '';
  selectedFilePreviewUrl = '';
  selectedFileKind: 'image' | 'video' | 'audio' | 'document' = 'document';
  selectedAudioDuration = 0;
  theme: WaTheme = 'dark';
  isRecordingAudio = false;
  recordingSeconds = 0;
  sendError = '';
  newNote = '';
  aiInsightText = 'Analisis pendiente.';
  aiSuggestion = '';
  showAiSuggestion = false;
  assignmentToast = '';

  ghostSuggestion = '';
  showSlashMenu = false;
  slashQuery = '';
  slashHighlight = 0;

  isTyping = false;
  isSending = false;
  isAiGenerating = false;
  hasImprovedOnce = false;
  isAiInsightLoading = false;
  isLoadingChats = true;
  isEditingContact = false;
  isSavingContact = false;
  isTakingChat = false;
  isClosingChat = false;
  isSavingWhatsappSettings = false;
  isUpdatingOperationalStatus = false;
  creatingTicket = false;
  ticketFeedback: { type: 'ok' | 'error'; text: string } | null = null;
  showTicketModal = false;
  ticketCategories: string[] = [];
  ticketDto = { titulo: '', priority: 'medium' as const, category: '' };
  showWhatsappSettings = false;
  showTeamsMeeting = false;
  showInfoPanel = false;
  showAiInsightModal = false;
  profilePhotoPreview?: { src: string; name: string };
  mediaPreview?: { src: string; name: string };
  messageMenu?: { x: number; y: number; message: WaMessage; side: 'left' | 'right' };
  editingMessageId = '';
  editingMessageText = '';
  isTeamsConnected = false;
  isLoadingTeams = false;
  isCreatingTeamsMeeting = false;
  teamsAccountName = '';
  teamsMeetingMessage = '';
  contactSaveMessage = '';
  whatsappSettingsMessage = '';
  teamsMeetingDraft: TeamsMeetingDraft = this.defaultTeamsMeetingDraft();
  connectionStatus: WaConnectionStatus = {
    status: 'connecting',
    updatedAt: new Date().toISOString(),
  };
  isRestartingConnection = false;
  floatingNotificationsEnabled =
    localStorage.getItem('waFloatingNotifications') !== 'false';
  readonly allowedUploadTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/3gpp',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/opus',
    'audio/amr',
    'audio/webm',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  readonly reactionOptions = ['\u{1F44D}', '\u2705', '\u274C'];

  currentUserId = '';
  currentUserName = '';
  currentUserRole = '';

  private shouldScroll = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private mediaRecorder?: MediaRecorder;
  private recordingChunks: Blob[] = [];
  private recordingTimer?: ReturnType<typeof setInterval>;
  private subs = new Subscription();

  constructor(
    private readonly waService: WhatsappChatService,
    private readonly authService: AuthService,
    private readonly configService: ConfiguracionFrontendService,
    private readonly ticketService: TicketService,
    private readonly sound: SoundService,
    private readonly aiService: AiService,
    private readonly themeService: ThemeService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.currentUserId = user?.id || '';
    this.currentUserName = user?.name || '';
    this.currentUserRole = user?.role || '';
    this.theme = this.themeService.currentTheme;

    this.subs.add(
      this.themeService.currentTheme$.subscribe(t => {
        this.theme = t;
        this.cdr.detectChanges();
      }),
    );

    if (this.currentUserId) {
      this.waService.joinAsAdvisor(this.currentUserId);
    }

    this.subs.add(
      this.waService.getConnectionStream().subscribe(status => {
        this.connectionStatus = status;
        this.isRestartingConnection = false;
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(this.waService.loadConnection().subscribe());

    this.subs.add(
      this.configService.getGlobal().subscribe(config => {
        this.queueCopy = config.whatsappQueueMsg || this.queueCopy;
        const replies = this.normalizeQuickReplies(config.whatsappQuickReplies);
        this.settingsDraft = {
          assignmentMsg: config.whatsappAssignmentMsg || this.defaultAssignmentMsg,
          queueMsg: config.whatsappQueueMsg || this.queueCopy,
          callUnavailableMsg: config.whatsappCallUnavailableMsg || this.defaultCallUnavailableMsg,
          quickRepliesText: replies.join('\n'),
        };
        this.applyQuickRepliesToContacts(replies);
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.waService.loadChats().subscribe(chats => {
        this.isLoadingChats = false;
        if (!this.activeContact && chats.length) this.selectContact(chats[0]);
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.waService.getChatsStream().subscribe(chats => {
        this.contacts = chats;
        this.syncActiveContact(chats);
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.waService.onNewMessage().subscribe(msg => this.handleIncomingMessage(msg)),
    );

    this.subs.add(
      this.waService.onChatAssigned().subscribe(event => this.handleAssignment(event)),
    );

    this.subs.add(
      this.waService.onQueueUpdated().subscribe(event => this.handleQueueUpdate(event)),
    );

    window.addEventListener('message', this.handleTeamsAuthMessage);
    window.addEventListener('click', this.closeMessageMenuOnWindowClick);
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScroll) return;
    this.scrollToBottom();
    this.shouldScroll = false;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    window.removeEventListener('message', this.handleTeamsAuthMessage);
    window.removeEventListener('click', this.closeMessageMenuOnWindowClick);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.stopRecordingTimer();
    this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
    this.clearSelectedFile();
  }

  get filteredContacts(): WaChat[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.contacts.filter(contact => {
      const haystack = [
        contact.name,
        contact.role,
        contact.institution,
        contact.city,
        contact.phone,
        contact.email,
        contact.preview,
        contact.assignedToName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesFilter = this.matchesFilter(contact);
      return matchesSearch && matchesFilter;
    });
  }

  get activeChats(): number {
    return this.contacts.filter(c => this.getAssignmentStatus(c) === 'active').length;
  }

  get pendingChats(): number {
    return this.contacts.filter(c => this.isChatWaiting(c)).length;
  }

  get groupChats(): number {
    return this.contacts.filter(c => c.isGroup).length;
  }

  get unreadChats(): number {
    return this.contacts.filter(c => c.unread > 0).length;
  }

  get myChatsCount(): number {
    return this.contacts.filter(c => c.assignedTo === this.currentUserId && !this.isChatClosed(c)).length;
  }

  getFilterCount(filter: WaFilter): number {
    switch (filter) {
      case 'mine':
        return this.myChatsCount;
      case 'queue':
        return this.pendingChats;
      case 'groups':
        return this.groupChats;
      case 'unread':
        return this.unreadChats;
      case 'closed':
        return this.contacts.filter(contact => this.isChatClosed(contact)).length;
      case 'all':
      default:
        return this.contacts.length;
    }
  }

  get isWindowClosed(): boolean {
    return this.activeContact ? this.getWindowStatus(this.activeContact) === 'closed' : false;
  }

  get isAttentionClosed(): boolean {
    return this.isChatClosed(this.activeContact);
  }

  get isWindowWarning(): boolean {
    return this.activeContact ? this.getWindowStatus(this.activeContact) === 'warning' : false;
  }

  get isInQueue(): boolean {
    return this.isChatWaiting(this.activeContact);
  }

  get canTakeQueuedChat(): boolean {
    return !!this.activeContact &&
      !this.activeContact.isGroup &&
      this.isChatWaiting(this.activeContact) &&
      !this.activeContact.assignedTo;
  }

  get isAssignedToSomeoneElse(): boolean {
    return !!this.activeContact?.assignedTo && this.activeContact.assignedTo !== this.currentUserId;
  }

  get canReply(): boolean {
    if (!this.activeContact || this.connectionStatus.status !== 'connected') return false;
    if (this.activeContact.isGroup) {
      return this.currentUserRole === 'advisor' || this.currentUserRole === 'admin';
    }
    if (this.isAttentionClosed) return false;
    if (this.currentUserRole === 'admin') return true;
    return this.activeContact.assignedTo === this.currentUserId;
  }

  get canImproveDraft(): boolean {
    return !!this.activeContact && !this.isAiGenerating && !!this.messageText.trim();
  }

  get hasComposerContent(): boolean {
    return !!this.messageText.trim() || !!this.selectedFile;
  }

  get slashFiltered(): string[] {
    const q = this.slashQuery.toLowerCase();
    return this.activeContact?.quickReplies?.filter(reply =>
      reply.toLowerCase().includes(q),
    ) ?? [];
  }

  get visibleQuickReplies(): string[] {
    return this.activeContact?.quickReplies?.slice(0, 3) ?? [];
  }

  get selectedMoreFilter(): WaFilter | '' {
    return this.moreFilterOptions.some(filter => filter.id === this.activeFilter)
      ? this.activeFilter
      : '';
  }

  get replyPlaceholder(): string {
    if (!this.activeContact) return 'Selecciona una conversacion';
    if (this.connectionStatus.status !== 'connected') return 'Conecta WhatsApp escaneando el QR';
    if (this.activeContact.isGroup) return 'Responder al grupo desde InnovaCloud';
    if (this.isAttentionClosed) return 'Atencion cerrada. El historial se conserva';
    if (this.isInQueue) return 'Conversacion en cola';
    if (this.isAssignedToSomeoneElse) return 'Asignado a otro asesor';
    if (this.isAiGenerating) return 'Mejorando texto...';
    return 'Escribe un mensaje o / para respuestas rapidas';
  }

  setFilter(filter: WaFilter): void {
    this.activeFilter = filter;
  }

  setMoreFilter(filter: WaFilter | ''): void {
    if (filter) this.setFilter(filter);
  }

  selectContact(contact: WaChat): void {
    this.activeContact = contact;
    this.showInfoPanel = false;
    this.isEditingContact = false;
    this.contactDraft = this.draftFromContact(contact);
    this.aiInsightText = 'Analisis pendiente.';
    this.contactSaveMessage = '';
    this.sendError = '';
    this.newNote = '';
    this.shouldScroll = true;

    if (contact.unread > 0) {
      contact.unread = 0;
      this.subs.add(this.waService.markRead(contact.id).subscribe());
    }

    this.subs.add(
      this.waService.loadMessages(contact.id).subscribe(messages => {
        if (!this.activeContact || this.activeContact.id !== contact.id) return;
        this.activeContact = { ...this.activeContact, messages };
        this.contactDraft = this.draftFromContact(this.activeContact);
        this.shouldScroll = true;
        this.cdr.detectChanges();
      }),
    );
  }

  closeActiveContactView(): void {
    this.activeContact = undefined;
    this.showInfoPanel = false;
    this.messageMenu = undefined;
    this.cancelEditMessage();
    this.cdr.detectChanges();
  }

  openProfilePhoto(contact: WaChat | undefined, event?: Event): void {
    event?.stopPropagation();
    if (!contact) return;
    this.profilePhotoPreview = {
      src: this.avatarSrc(contact),
      name: contact.name || contact.phone || 'WhatsApp',
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
    event.preventDefault();
    event.stopPropagation();
    if (!this.canManageMessage(message) && !this.canReactToMessage(message)) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 198;
    const menuHeight = 138;
    const preferredX = message.fromMe ? rect.left - menuWidth - 10 : rect.right + 10;
    const fallbackX = message.fromMe ? rect.right - menuWidth : rect.left;
    const rawX = preferredX < 8 || preferredX + menuWidth > window.innerWidth - 8 ? fallbackX : preferredX;
    const rawY = rect.top + (rect.height / 2) - 28;
    this.messageMenu = {
      x: Math.max(8, Math.min(rawX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(rawY, window.innerHeight - menuHeight - 8)),
      message,
      side: message.fromMe ? 'right' : 'left',
    };
    this.cdr.detectChanges();
  }

  reactToMessage(message: WaMessage, emoji: string): void {
    if (!this.activeContact || !this.canReactToMessage(message)) return;
    const currentEmoji = this.ownReactionEmoji(message, this.activeContact.messages ?? []);
    const nextEmoji = emoji && emoji === currentEmoji ? '' : emoji;
    this.messageMenu = undefined;
    this.subs.add(
      this.waService.reactToMessage(this.activeContact.id, message.id, nextEmoji).subscribe({
        next: chat => {
          this.activeContact = chat;
          this.cdr.detectChanges();
        },
        error: err => {
          this.sendError = this.errorText(err, 'No se pudo enviar la reaccion.');
          this.cdr.detectChanges();
        },
      }),
    );
  }

  startEditMessage(message: WaMessage): void {
    if (!this.canEditMessage(message)) return;
    this.editingMessageId = message.id;
    this.editingMessageText = this.displayMessageBody(message);
    this.messageMenu = undefined;
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.message-edit textarea');
      el?.focus();
      el?.select();
    });
  }

  cancelEditMessage(): void {
    this.editingMessageId = '';
    this.editingMessageText = '';
  }

  saveEditedMessage(message: WaMessage): void {
    if (!this.activeContact || !this.canEditMessage(message)) return;
    const text = this.editingMessageText.trim();
    if (!text || text === this.displayMessageBody(message)) {
      this.cancelEditMessage();
      return;
    }

    this.subs.add(
      this.waService.editMessage(this.activeContact.id, message.id, text).subscribe({
        next: chat => {
          this.activeContact = chat;
          this.cancelEditMessage();
          this.cdr.detectChanges();
        },
        error: err => {
          this.sendError = this.errorText(err, 'No se pudo editar el mensaje.');
          this.cdr.detectChanges();
        },
      }),
    );
  }

  deleteMessage(message: WaMessage): void {
    if (!this.activeContact || !this.canManageMessage(message)) return;
    this.messageMenu = undefined;
    this.subs.add(
      this.waService.deleteMessage(this.activeContact.id, message.id).subscribe({
        next: chat => {
          this.activeContact = chat;
          this.cdr.detectChanges();
        },
        error: err => {
          this.sendError = this.errorText(err, 'No se pudo eliminar el mensaje.');
          this.cdr.detectChanges();
        },
      }),
    );
  }

  canReactToMessage(message: WaMessage): boolean {
    return this.canReply &&
      !this.isReactionMessage(message) &&
      !message.id.startsWith('tmp-') &&
      !!message.metaMessageId;
  }

  canManageMessage(message: WaMessage): boolean {
    return this.canReply &&
      this.isOwnAdvisorMessage(message) &&
      !message.isAuto &&
      !message.id.startsWith('tmp-') &&
      this.isWithinDeleteWindow(message);
  }

  canEditMessage(message: WaMessage): boolean {
    return this.canReply &&
      this.isOwnAdvisorMessage(message) &&
      !message.isAuto &&
      !message.id.startsWith('tmp-') &&
      message.type === 'text' &&
      this.isWithinEditWindow(message);
  }

  messageTime(message: WaMessage): string {
    return this.formatBogotaTime(message.timestamp);
  }

  visibleConversationMessages(messages: WaMessage[] = []): WaMessage[] {
    return messages.filter(message => !this.isReactionMessage(message));
  }

  messageReactions(message: WaMessage, messages: WaMessage[] = []): MessageReactionView[] {
    return messages
      .filter(candidate => this.reactionBelongsToMessage(candidate, message, messages))
      .map(candidate => ({
        id: candidate.id,
        emoji: this.reactionText(candidate),
        by: candidate.reactionByName || candidate.senderName || (candidate.fromMe ? 'Tu' : 'Cliente'),
        removed: !!candidate.reactionRemoved || !this.reactionText(candidate),
        fromMe: this.isOwnReaction(candidate),
      }))
      .filter(reaction => !reaction.removed && !!reaction.emoji);
  }

  private isWithinEditWindow(message: WaMessage): boolean {
    return Date.now() - new Date(message.timestamp).getTime() <= this.editWindowMs;
  }

  private isWithinDeleteWindow(message: WaMessage): boolean {
    return Date.now() - new Date(message.timestamp).getTime() <= this.deleteWindowMs;
  }

  private isOwnAdvisorMessage(message: WaMessage): boolean {
    if (!message.fromMe) return false;
    if (message.advisorId) return message.advisorId === this.currentUserId;
    return !!this.currentUserName && message.senderName === this.currentUserName;
  }

  private formatBogotaTime(value: Date | string): string {
    const date = this.parseDateValue(value);
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(date);
  }

  toggleReactionPopover(event: MouseEvent, msgId: string): void {
  event.stopPropagation();
  this.openReactionPopoverId = this.openReactionPopoverId === msgId ? '' : msgId;
}

uniqueReactionEmojis(msg: WaMessage, messages: WaMessage[]): string[] {
  const emojis = this.messageReactions(msg, messages)
    .filter(r => !r.removed && r.emoji)
    .map(r => r.emoji);
  return [...new Set(emojis)];
}

reactionGroups(msg: WaMessage, messages: WaMessage[]): MessageReactionGroup[] {
  const counts = new Map<string, number>();
  for (const reaction of this.messageReactions(msg, messages)) {
    if (reaction.removed || !reaction.emoji) continue;
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
}

ownReactionEmoji(msg: WaMessage, messages: WaMessage[]): string {
  return this.messageReactions(msg, messages).find(reaction => reaction.fromMe)?.emoji ?? '';
}

reactionSummaryLabel(msg: WaMessage, messages: WaMessage[]): string {
  const reactions = this.messageReactions(msg, messages);
  const names = reactions
    .filter(reaction => !reaction.removed)
    .map(reaction => reaction.fromMe ? 'Yo' : reaction.by)
    .filter(Boolean);
  if (!names.length) return 'Sin reacciones activas';
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length <= 2) return uniqueNames.join(', ');
  return `${uniqueNames.slice(0, 2).join(', ')} +${uniqueNames.length - 2}`;
}


  private closeMessageMenuOnWindowClick = () => {
  if (this.messageMenu) {
    this.messageMenu = undefined;
    this.cdr.detectChanges();
  }
  if (this.openReactionPopoverId) {   // ← agrega esto
    this.openReactionPopoverId = '';
    this.cdr.detectChanges();
  }
};

  sendMessage(): void {
    if (this.selectedFile) {
      this.sendMediaMessage();
      return;
    }

    const text = this.messageText.trim();
    if (!text || !this.activeContact || this.isSending || !this.canReply) return;

    const now = new Date();
    const optimisticMsg = {
      id: `tmp-${Date.now()}`,
      chatId: this.activeContact.id,
      body: text,
      fromMe: true,
      timestamp: now,
      status: 'sent' as const,
      isAuto: false,
      type: 'text',
    };

    this.activeContact = {
      ...this.activeContact,
      preview: text,
      time: this.formatBogotaTime(now),
      messages: [...(this.activeContact.messages ?? []), optimisticMsg],
    };
    this.messageText = '';
    this.sendError = '';
    this.isSending = true;
    this.shouldScroll = true;
    this.resizeMessageInput();

    this.subs.add(
      this.waService.sendMessage(this.addressForContact(this.activeContact), text).subscribe(res => {
        this.isSending = false;
        if (res.ok && res.chat) {
          this.activeContact = res.chat;
          this.shouldScroll = true;
          this.cdr.detectChanges();
          return;
        }

        const messages = [...(this.activeContact?.messages ?? [])];
        const idx = messages.findIndex(msg => msg.id === optimisticMsg.id);
        if (idx >= 0) messages[idx] = { ...messages[idx], status: 'failed' };
        if (this.activeContact) this.activeContact = { ...this.activeContact, messages };
        this.sendError = 'No se pudo enviar. Revisa la conexion o la asignacion.';
        this.cdr.detectChanges();
      }),
    );
  }

  private sendMediaMessage(): void {
    const file = this.selectedFile;
    const contact = this.activeContact;
    if (!file || !contact || this.isSending || !this.canReply) return;

    const caption = this.messageText.trim();
    const previewUrl = this.selectedFilePreviewUrl;
    const kind = this.selectedFileKind;
    const now = new Date();
    const fallback = this.mediaFallbackLabel(kind);
    const optimisticMsg = {
      id: `tmp-media-${Date.now()}`,
      chatId: contact.id,
      body: caption || fallback,
      fromMe: true,
      timestamp: now,
      status: 'sent' as const,
      isAuto: false,
      type: kind,
      mediaUrl: previewUrl,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    };

    this.activeContact = {
      ...contact,
      preview: caption || fallback,
      time: this.formatBogotaTime(now),
      messages: [...(contact.messages ?? []), optimisticMsg],
    };
    this.messageText = '';
    this.sendError = '';
    this.isSending = true;
    this.shouldScroll = true;
    this.resizeMessageInput();

    this.subs.add(
      this.waService.sendMedia(this.addressForContact(contact), file, caption).subscribe(res => {
        this.isSending = false;
        if (res.ok && res.chat) {
          this.activeContact = res.chat;
          this.clearSelectedFile();
          this.shouldScroll = true;
          this.cdr.detectChanges();
          return;
        }

        const messages = [...(this.activeContact?.messages ?? [])];
        const idx = messages.findIndex(msg => msg.id === optimisticMsg.id);
        if (idx >= 0) messages[idx] = { ...messages[idx], status: 'failed' };
        if (this.activeContact) this.activeContact = { ...this.activeContact, messages };
        this.sendError = 'No se pudo enviar el archivo. Revisa la conexion o la asignacion.';
        this.cdr.detectChanges();
      }),
    );
  }

  openAttachmentPicker(): void {
    if (!this.canReply || this.isSending) return;
    this.fileInput?.nativeElement?.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 64 * 1024 * 1024) {
      this.sendError = 'El archivo supera el limite de 64 MB.';
      input.value = '';
      return;
    }

    if (!this.isAllowedUpload(file)) {
      this.sendError = 'Tipo de archivo no permitido para WhatsApp.';
      input.value = '';
      return;
    }

    this.clearSelectedFile(false);
    this.selectedFile = file;
    this.selectedFileKind = this.fileKind(file);
    this.selectedFilePreviewUrl = URL.createObjectURL(file);
    this.sendError = '';
  }

  clearSelectedFile(resetInput = true): void {
    if (this.selectedFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedFilePreviewUrl);
    }
    this.selectedFile = undefined;
    this.selectedFilePreviewUrl = '';
    this.selectedFileKind = 'document';
    this.selectedAudioDuration = 0;
    if (resetInput && this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  formatFileSize(size = 0): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  formatRecordingTime(seconds: number): string {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  async toggleAudioRecording(): Promise<void> {
    if (this.isRecordingAudio) {
      this.mediaRecorder?.stop();
      return;
    }
    if (!this.canReply || this.isSending) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.sendError = 'Este navegador no permite grabar audio.';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.pickRecordingMimeType();
      this.mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      this.recordingChunks = [];
      this.recordingSeconds = 0;

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) this.recordingChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const type = this.normalizeMimeType(this.mediaRecorder?.mimeType || mimeType || 'audio/webm');
        const blob = new Blob(this.recordingChunks, { type });
        const duration = this.recordingSeconds;
        stream.getTracks().forEach(track => track.stop());
        this.stopRecordingTimer();
        this.isRecordingAudio = false;

        if (!blob.size) {
          this.sendError = 'No se pudo capturar audio.';
          this.cdr.detectChanges();
          return;
        }

        const file = new File(
          [blob],
          `nota-voz-${Date.now()}${this.extensionForMime(type)}`,
          { type },
        );
        this.clearSelectedFile(false);
        this.selectedFile = file;
        this.selectedFileKind = 'audio';
        this.selectedFilePreviewUrl = URL.createObjectURL(file);
        this.selectedAudioDuration = duration;
        this.sendError = '';
        this.cdr.detectChanges();
      };

      this.mediaRecorder.start(250);
      this.isRecordingAudio = true;
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds += 1;
        this.cdr.detectChanges();
      }, 1000);
    } catch {
      this.sendError = 'No se pudo acceder al microfono.';
      this.isRecordingAudio = false;
      this.stopRecordingTimer();
    }
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    this.recordingTimer = undefined;
  }

  addNote(): void {
    const text = this.newNote.trim();
    if (!text || !this.activeContact) return;

    const chatId = this.activeContact.id;
    this.activeContact = {
      ...this.activeContact,
      notes: [text, ...(this.activeContact.notes ?? [])],
    };
    this.newNote = '';

    this.subs.add(
      this.waService.saveNote(chatId, text).subscribe({
        next: chat => this.activeContact = chat,
        error: () => this.contactSaveMessage = 'No se pudo guardar la observacion.',
      }),
    );
  }

  removeNote(index: number): void {
    if (!this.activeContact) return;
    const chatId = this.activeContact.id;
    const previous = [...(this.activeContact.notes ?? [])];
    this.activeContact = {
      ...this.activeContact,
      notes: previous.filter((_, i) => i !== index),
    };

    this.subs.add(
      this.waService.deleteNote(chatId, index).subscribe({
        next: chat => this.activeContact = chat,
        error: () => {
          if (this.activeContact?.id === chatId) {
            this.activeContact = { ...this.activeContact, notes: previous };
          }
          this.contactSaveMessage = 'No se pudo eliminar la observacion.';
        },
      }),
    );
  }

  startEditContact(): void {
    if (!this.activeContact) return;
    this.contactDraft = this.draftFromContact(this.activeContact);
    this.contactSaveMessage = '';
    this.isEditingContact = true;
  }

  cancelEditContact(): void {
    if (this.activeContact) this.contactDraft = this.draftFromContact(this.activeContact);
    this.contactSaveMessage = '';
    this.isEditingContact = false;
  }

  saveContact(): void {
    if (!this.activeContact || this.isSavingContact) return;
    const chatId = this.activeContact.id;
    const payload: WaContactUpdate = {
      name: this.contactDraft.name.trim(),
      role: this.contactDraft.role.trim(),
      institution: this.contactDraft.institution.trim(),
      institutionUrl: this.contactDraft.institutionUrl.trim(),
      city: this.contactDraft.city.trim(),
      phone: this.contactDraft.phone.trim(),
      email: this.contactDraft.email.trim(),
      plan: this.contactDraft.plan.trim(),
      modules: this.contactDraft.modulesText
        .split(',')
        .map(module => module.trim())
        .filter(Boolean),
    };

    this.isSavingContact = true;
    this.contactSaveMessage = '';

    this.subs.add(
      this.waService.updateContact(chatId, payload).subscribe({
        next: chat => {
          this.activeContact = chat;
          this.contactDraft = this.draftFromContact(chat);
          this.isEditingContact = false;
          this.isSavingContact = false;
          this.contactSaveMessage = 'Informacion guardada.';
          this.cdr.detectChanges();
        },
        error: () => {
          this.isSavingContact = false;
          this.contactSaveMessage = 'No se pudo guardar la informacion.';
        },
      }),
    );
  }

  closeActiveChat(): void {
    if (!this.activeContact || this.activeContact.assignedTo !== this.currentUserId || this.isClosingChat) return;
    this.isClosingChat = true;
    const closedChatId = this.activeContact.id;
    this.subs.add(
      this.waService.closeChat(this.activeContact.id).subscribe(chat => {
        this.isClosingChat = false;
        this.contacts = this.contacts.map(contact =>
          contact.id === closedChatId ? chat : contact,
        );
        this.activeContact = undefined;
        this.showInfoPanel = false;
        this.messageMenu = undefined;
        this.cancelEditMessage();
        if (this.activeFilter === 'mine') this.activeFilter = 'all';
        this.sendError = '';
        this.cdr.detectChanges();
      }, () => {
        this.isClosingChat = false;
        this.sendError = 'No se pudo cerrar el chat.';
        this.cdr.detectChanges();
      }),
    );
  }

  openTicketModal(): void {
    if (!this.activeContact) return;
    const contact = this.activeContact;
    this.ticketDto = {
      titulo: `Ticket desde WhatsApp - ${contact.name || 'Cliente'}`,
      priority: 'medium' as const,
      category: '',
    };
    if (this.ticketCategories.length === 0) {
      this.ticketService.getCategories().subscribe(cats => {
        this.ticketCategories = cats;
        this.cdr.detectChanges();
      });
    }
    this.showTicketModal = true;
    this.cdr.detectChanges();
  }

  closeTicketModal(): void {
    this.showTicketModal = false;
    this.cdr.detectChanges();
  }

  confirmTicket(): void {
    if (!this.activeContact || this.creatingTicket) return;
    this.creatingTicket = true;
    this.ticketFeedback = null;
    this.showTicketModal = false;
    const contact = this.activeContact;
    const body = {
      titulo: this.ticketDto.titulo.trim(),
      priority: this.ticketDto.priority,
      category: this.ticketDto.category || undefined,
    };
    this.ticketService.createFromWhatsapp(contact.id, body).subscribe({
      next: (ticket) => {
        this.creatingTicket = false;
        this.sound.playTicketNotification();
        this.ticketFeedback = { type: 'ok', text: 'Ticket generado correctamente' };
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.ticketFeedback = null;
          this.cdr.detectChanges();
        }, 3000);
        // Auto-mensaje
        const label = priorityLabel(ticket.priority);
        const address = contact.jid || contact.phone;
        if (address) {
          this.waService.sendMessage(address, `Se generó el ticket ${ticket.codigo} con prioridad ${label} y fue asignado a ${this.currentUserName}.`).subscribe();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.creatingTicket = false;
        const msg = err?.error?.message || err?.message || '';
        this.ticketFeedback = {
          type: 'error',
          text: msg.includes('codigo') || msg.includes('duplicate')
            ? 'El codigo del ticket ya existe. Intenta de nuevo.'
            : 'Error al generar el ticket.',
        };
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.ticketFeedback = null;
          this.cdr.detectChanges();
        }, 4000);
        this.cdr.detectChanges();
      },
    });
  }

  updateOperationalStatus(status: WaOperationalStatus): void {
    if (!this.activeContact || this.isUpdatingOperationalStatus) return;
    this.isUpdatingOperationalStatus = true;
    this.contactSaveMessage = '';

    this.subs.add(
      this.waService.updateOperationalStatus(this.activeContact.id, status).subscribe({
        next: chat => {
          this.activeContact = chat;
          this.contactDraft = this.draftFromContact(chat);
          this.isUpdatingOperationalStatus = false;
          this.contactSaveMessage = 'Estado operativo actualizado.';
          this.cdr.detectChanges();
        },
        error: () => {
          this.isUpdatingOperationalStatus = false;
          this.contactSaveMessage = 'No se pudo actualizar el estado.';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  operationalStatusClass(contact: WaChat): string {
    return contact.operationalStatus || contact.assignmentStatus || 'new';
  }

  takeActiveChat(): void {
    if (!this.activeContact || this.isTakingChat || !this.canTakeQueuedChat) return;

    const chatId = this.activeContact.id;
    this.isTakingChat = true;
    this.sendError = '';

    this.subs.add(
      this.waService.takeChat(chatId).subscribe({
        next: chat => {
          this.isTakingChat = false;
          this.activeContact = chat;
          this.contactDraft = this.draftFromContact(chat);
          if (this.activeFilter === 'queue') this.activeFilter = 'mine';
          this.shouldScroll = true;
          this.cdr.detectChanges();
        },
        error: err => {
          this.isTakingChat = false;
          const message = err?.error?.message;
          this.sendError = Array.isArray(message)
            ? message.join(' ')
            : message || 'No se pudo tomar este chat. Intenta de nuevo.';
          this.subs.add(this.waService.loadChats().subscribe());
          this.cdr.detectChanges();
        },
      }),
    );
  }

  openTeamsMeeting(): void {
    if (!this.activeContact) return;
    this.showInfoPanel = false;
    this.teamsMeetingDraft = {
      ...this.defaultTeamsMeetingDraft(),
      subject: `Reunion con ${this.activeContact.name || 'cliente'}`,
    };
    this.teamsMeetingMessage = '';
    this.showTeamsMeeting = true;
    this.loadTeamsStatus();
  }

  closeTeamsMeeting(): void {
    if (this.isCreatingTeamsMeeting) return;
    this.showTeamsMeeting = false;
    this.teamsMeetingMessage = '';
  }

  connectTeams(): void {
    if (this.isLoadingTeams) return;
    const popup = window.open('', 'innovaTeamsAuth', 'width=520,height=720');
    this.isLoadingTeams = true;
    this.teamsMeetingMessage = 'Abriendo inicio de sesion de Microsoft...';

    this.subs.add(
      this.waService.getTeamsAuthUrl().subscribe({
        next: res => {
          this.isLoadingTeams = false;
          if (popup) {
            popup.location.href = res.authUrl;
          } else {
            window.location.href = res.authUrl;
          }
          this.cdr.detectChanges();
        },
        error: err => {
          popup?.close();
          this.isLoadingTeams = false;
          this.teamsMeetingMessage = this.errorText(err, 'No se pudo iniciar sesion en Teams.');
          this.cdr.detectChanges();
        },
      }),
    );
  }

  createTeamsMeeting(): void {
    if (!this.activeContact || this.isCreatingTeamsMeeting) return;
    if (!this.canReply) {
      this.teamsMeetingMessage = 'Este chat no permite enviar el enlace ahora.';
      return;
    }

    const subject = this.teamsMeetingDraft.subject.trim();
    const start = new Date(this.teamsMeetingDraft.startDateTime);
    if (!subject || Number.isNaN(start.getTime())) {
      this.teamsMeetingMessage = 'Escribe un nombre y una hora valida.';
      return;
    }

    this.isCreatingTeamsMeeting = true;
    this.teamsMeetingMessage = 'Creando reunion y enviando enlace...';

    this.subs.add(
      this.waService.createTeamsMeeting(this.activeContact.id, {
        subject,
        startDateTime: start.toISOString(),
        durationMinutes: this.teamsMeetingDraft.durationMinutes,
        calendarTarget: this.teamsMeetingDraft.calendarTarget,
      }).subscribe({
        next: res => {
          this.isCreatingTeamsMeeting = false;
          if (res.chat) {
            this.activeContact = res.chat;
            this.shouldScroll = true;
          }
          this.teamsMeetingMessage = 'Reunion creada y link enviado por WhatsApp.';
          this.cdr.detectChanges();
        },
        error: err => {
          this.isCreatingTeamsMeeting = false;
          if (err?.status === 401) this.isTeamsConnected = false;
          this.teamsMeetingMessage = this.errorText(err, 'No se pudo crear la reunion.');
          this.cdr.detectChanges();
        },
      }),
    );
  }

  private loadTeamsStatus(): void {
    this.isLoadingTeams = true;
    this.subs.add(
      this.waService.getTeamsStatus().subscribe({
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
      }),
    );
  }

  private handleTeamsAuthMessage = (event: MessageEvent): void => {
    if (event.data?.type !== 'teams-auth') return;
    if (event.data.success) {
      this.teamsMeetingMessage = 'Teams conectado. Ya puedes crear la reunion.';
      this.loadTeamsStatus();
    } else {
      this.isLoadingTeams = false;
      this.isTeamsConnected = false;
      this.teamsMeetingMessage = event.data.error || 'No se pudo conectar Teams.';
    }
    this.cdr.detectChanges();
  };

  toggleFloatingNotifications(): void {
    this.floatingNotificationsEnabled = !this.floatingNotificationsEnabled;
    localStorage.setItem(
      'waFloatingNotifications',
      String(this.floatingNotificationsEnabled),
    );

    if (
      this.floatingNotificationsEnabled &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  toggleTheme(): void {
    this.themeService.setMode(this.theme === 'dark' ? 'light' : 'dark');
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
        this.ghostSuggestion = this.slashFiltered[this.slashHighlight]?.slice(this.slashQuery.length) ?? '';
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!this.slashFiltered.length) return;
        this.slashHighlight =
          (this.slashHighlight - 1 + this.slashFiltered.length) % this.slashFiltered.length;
        this.ghostSuggestion = this.slashFiltered[this.slashHighlight]?.slice(this.slashQuery.length) ?? '';
        return;
      }
      if (event.key === 'Enter') {
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
      this.sendMessage();
    }
  }

  onInputChange(): void {
    this.resizeMessageInput();
    const slashIdx = this.messageText.lastIndexOf('/');
    if (slashIdx === -1) {
      this.showSlashMenu = false;
      this.slashQuery = '';
      this.ghostSuggestion = '';
      return;
    }

    this.slashQuery = this.messageText.slice(slashIdx + 1).toLowerCase();
    this.showSlashMenu = true;
    this.slashHighlight = 0;
    const match = this.activeContact?.quickReplies?.find(reply =>
      reply.toLowerCase().startsWith(this.slashQuery) && this.slashQuery.length > 0,
    );
    this.ghostSuggestion = match ? match.slice(this.slashQuery.length) : '';
  }

  selectSlashReply(reply: string): void {
    const slashIdx = this.messageText.lastIndexOf('/');
    this.messageText = slashIdx >= 0
      ? this.messageText.slice(0, slashIdx) + reply
      : reply;
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
    this.resizeMessageInput();
    this.messageInput?.nativeElement?.focus();
  }

  useQuickReply(reply: string): void {
    this.messageText = reply;
    this.resizeMessageInput();
    this.messageInput?.nativeElement?.focus();
  }

  openWhatsappSettings(): void {
    this.showWhatsappSettings = true;
    this.whatsappSettingsMessage = '';
  }

  closeWhatsappSettings(): void {
    if (this.isSavingWhatsappSettings) return;
    this.showWhatsappSettings = false;
    this.whatsappSettingsMessage = '';
  }

  saveWhatsappSettings(): void {
    if (this.isSavingWhatsappSettings) return;
    const quickReplies = this.quickRepliesFromSettingsText(this.settingsDraft.quickRepliesText);

    this.isSavingWhatsappSettings = true;
    this.whatsappSettingsMessage = '';

    this.subs.add(
      this.configService.guardarGlobal({
        whatsappAssignmentMsg: this.settingsDraft.assignmentMsg.trim() || this.defaultAssignmentMsg,
        whatsappQueueMsg: this.settingsDraft.queueMsg.trim() || this.queueCopy,
        whatsappCallUnavailableMsg:
          this.settingsDraft.callUnavailableMsg.trim() || this.defaultCallUnavailableMsg,
        whatsappQuickReplies: quickReplies,
      }).subscribe({
        next: config => {
          const replies = this.normalizeQuickReplies(config.whatsappQuickReplies);
          this.queueCopy = config.whatsappQueueMsg || this.queueCopy;
          this.settingsDraft = {
            assignmentMsg: config.whatsappAssignmentMsg || this.defaultAssignmentMsg,
            queueMsg: config.whatsappQueueMsg || this.queueCopy,
            callUnavailableMsg: config.whatsappCallUnavailableMsg || this.defaultCallUnavailableMsg,
            quickRepliesText: replies.join('\n'),
          };
          this.applyQuickRepliesToContacts(replies);
          this.isSavingWhatsappSettings = false;
          this.whatsappSettingsMessage = 'Configuracion guardada.';
          this.cdr.detectChanges();
        },
        error: () => {
          this.isSavingWhatsappSettings = false;
          this.whatsappSettingsMessage = 'No se pudo guardar la configuracion.';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  restartWhatsappConnection(): void {
    if (this.isRestartingConnection) return;
    this.isRestartingConnection = true;
    this.subs.add(
      this.waService.restartConnection().subscribe({
        next: status => {
          this.connectionStatus = status;
          this.isRestartingConnection = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isRestartingConnection = false;
          this.connectionStatus = {
            ...this.connectionStatus,
            status: 'disconnected',
            lastError: 'No se pudo reiniciar la conexion.',
            updatedAt: new Date().toISOString(),
          };
          this.cdr.detectChanges();
        },
      }),
    );
  }

  getWindowStatus(contact?: WaChat): WindowState {
    if (contact?.isGroup) return 'open';
    if (!contact?.lastClientMsg) return 'closed';
    const diffH = (Date.now() - new Date(contact.lastClientMsg).getTime()) / 3_600_000;
    if (diffH >= 24) return 'closed';
    if (diffH >= 20) return 'warning';
    return 'open';
  }

  getWindowLabel(contact?: WaChat): string {
    if (contact?.isGroup) return 'Grupo';
    if (!contact?.lastClientMsg) return 'Sin ventana';
    const diffH = (Date.now() - new Date(contact.lastClientMsg).getTime()) / 3_600_000;
    if (diffH >= 24) return 'Cerrada';
    const remaining = 24 - diffH;
    const h = Math.floor(remaining);
    const m = Math.floor((remaining - h) * 60);
    return `${h}h ${m}m`;
  }

  getAssignmentLabel(contact?: WaChat): string {
    if (contact?.isGroup) return 'Grupo compartido';
    if (this.isChatClosed(contact)) return 'Atencion cerrada';
    if (!contact?.assignedTo) return 'En cola';
    if (contact.assignedTo === this.currentUserId) return 'Mi chat';
    return contact.assignedToName ? `Asignado a ${contact.assignedToName}` : 'Asignado';
  }

  isChatClosed(contact?: WaChat): boolean {
    return this.getAssignmentStatus(contact) === 'closed' || contact?.tag === 'cerrado';
  }

  async triggerAI(): Promise<void> {
    if (this.isAiGenerating || !this.activeContact) return;
    const c = this.activeContact;
    const draft = this.messageText.trim();
    if (!draft) {
      this.sendError = 'Escribe primero un borrador para que la IA lo mejore.';
      this.messageInput?.nativeElement?.focus();
      return;
    }

    this.isAiGenerating = true;
    this.sendError = '';
    const startedAt = performance.now();
    console.groupCollapsed('[WhatsApp IA] Mejorar texto');
    try {
      const res = await firstValueFrom(
        this.aiService.improveWhatsappDraft({
          draft,
          clientName: c.name,
          institution: c.institution,
          role: c.role,
        }).pipe(timeout(25000)),
      );
      const improved = res.reply?.trim() || draft;
      this.aiSuggestion = improved;
      this.showAiSuggestion = true;
      this.hasImprovedOnce = true;
    } catch (err) {
      console.error('Estado: la IA no pudo mejorar el texto.', err);
      this.sendError = 'No se pudo mejorar el texto con IA. Intenta de nuevo.';
    } finally {
      this.isAiGenerating = false;
      console.groupEnd();
      this.messageInput?.nativeElement?.focus();
    }
  }

  dismissAiSuggestion(): void {
    this.showAiSuggestion = false;
    this.aiSuggestion = '';
  }

  copyAiSuggestion(): void {
    if (!this.aiSuggestion) return;
    navigator.clipboard.writeText(this.aiSuggestion);
  }

  async aiInsight(): Promise<void> {
    if (this.isAiInsightLoading || !this.activeContact) return;
    const c = this.activeContact;
    const messages = this.compactConversationForAi(c);
    if (!messages.length) {
      this.aiInsightText = 'Aun no hay mensajes suficientes para resumir esta conversacion.';
      return;
    }

    this.isAiInsightLoading = true;
    this.aiInsightText = '';
    try {
      const res = await firstValueFrom(
        this.aiService.summarizeWhatsappConversation({
          clientName: c.name,
          institution: c.institution,
          role: c.role,
          city: c.city,
          phone: c.phone,
          notes: (c.notes ?? []).slice(0, 3),
          messages,
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

  private compactConversationForAi(contact: WaChat): { fromMe: boolean; body: string }[] {
    return (contact.messages ?? [])
      .map(message => ({
        ...message,
        body: this.displayMessageBody(message) || this.mediaFallbackLabel(message.type),
      }))
      .filter(message => !!message.body?.trim())
      .slice(-20)
      .map(message => ({
        fromMe: message.fromMe,
        body: this.compactText(message.body, 180),
      }));
  }

  private compactText(value: string, maxLength: number): string {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}...` : clean;
  }

  private addressForContact(contact: WaChat): string {
    return contact.jid || contact.phone;
  }

  private fileKind(file: File): 'image' | 'video' | 'audio' | 'document' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  mediaFallbackLabel(kind: 'image' | 'video' | 'audio' | 'document' | string, fileName = ''): string {
    const label = {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    }[kind] ?? 'Archivo';
    return kind === 'document' && fileName ? `${label}: ${fileName}` : label;
  }

  displayPreview(contact: WaChat): string {
    const preview = this.cleanLegacyMediaFallback(contact.preview);
    return preview || 'Sin mensajes recientes';
  }

  avatarSrc(contact?: WaChat): string {
    return contact?.avatar || this.fallbackAvatar(contact?.name || contact?.phone || 'WhatsApp');
  }

  useFallbackAvatar(event: Event, contact?: WaChat): void {
    const img = event.target as HTMLImageElement;
    img.src = this.fallbackAvatar(contact?.name || contact?.phone || 'WhatsApp');
  }

  shouldShowMessageBody(message: WaMessage): boolean {
    return !!this.displayMessageBody(message);
  }

  displayMessageBody(message: WaMessage): string {
    const body = (message.body || '').trim();
    if (this.isReactionMessage(message)) return '';
    if (!body || this.isLegacyMediaFallback(body) || this.isEncryptedBlob(body)) return '';
    if (message.type && message.type !== 'text') {
      const fallback = this.mediaFallbackLabel(message.type, message.fileName);
      if (body === fallback || body === this.mediaFallbackLabel(message.type)) return '';
      if (message.fileName && body.includes(message.fileName)) return '';
      return '';
    }
    return body;
  }

  mediaUrlFor(message: WaMessage): string {
    return this.safeResourceUrl(message.mediaUrl);
  }

  private isEncryptedBlob(value: string): boolean {
    return /^enc:v\d+:/i.test(value) || /enc:v\d+:/i.test(value);
  }

  getInstitutionHref(contact?: WaChat): string {
    return this.safeHttpUrl(contact?.institutionUrl);
  }

  getPhoneHref(contact?: WaChat): string {
    const phone = (contact?.phone || '').replace(/[^\d+]/g, '');
    return phone ? `tel:${phone}` : '';
  }

  getEmailHref(contact?: WaChat): string {
    const email = (contact?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
    return `mailto:${encodeURIComponent(email)}`;
  }

  private isAllowedUpload(file: File): boolean {
    const mimeType = this.normalizeMimeType(file.type);
    if (!this.allowedUploadTypes.includes(mimeType)) return false;
    const ext = this.extensionFromName(file.name);
    const expected = this.extensionForMime(mimeType);
    return !expected || !ext || ext === expected || this.isCompatibleExtension(mimeType, ext);
  }

  private pickRecordingMimeType(): string {
    const options = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
    ];
    return options.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
  }

  private normalizeMimeType(value = ''): string {
    return value.toLowerCase().split(';')[0].trim();
  }

  private extensionForMime(mimeType = ''): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'audio/aac': '.aac',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/amr': '.amr',
      'audio/webm': '.webm',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/csv': '.csv',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    };
    return map[this.normalizeMimeType(mimeType)] ?? '';
  }

  private extensionFromName(name = ''): string {
    const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
    return match?.[0] ?? '';
  }

  private isCompatibleExtension(mimeType: string, ext: string): boolean {
    const compatible: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'audio/mpeg': ['.mp3', '.mpeg'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls', '.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    };
    return compatible[mimeType]?.includes(ext) ?? false;
  }

  private safeResourceUrl(value?: string): string {
    if (!value) return '';
    if (value.startsWith('blob:')) return value;
    return this.safeHttpUrl(value);
  }

  private safeHttpUrl(value?: string): string {
    if (!value) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  private fallbackAvatar(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=25D366&color=fff`;
  }

  private cleanLegacyMediaFallback(value = ''): string {
    const clean = value.trim();
    if (!clean) return '';
    const match = clean.match(/^\[(Imagen|Video|Audio|Documento|Sticker)(?::[^\]]+|\srecibido)?\]$/i);
    if (!match) return clean;
    const type = match[1].toLowerCase();
    if (type === 'sticker') return 'Sticker';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private isLegacyMediaFallback(value = ''): boolean {
    return /^\[(Imagen|Video|Audio|Documento|Sticker)(?::[^\]]+|\srecibido)?\]$/i.test(value.trim());
  }

  private resizeMessageInput(): void {
    setTimeout(() => {
      const textarea = this.messageInput?.nativeElement;
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    });
  }

  private handleIncomingMessage(msg: AwNewMessage): void {
    if (!this.activeContact || this.activeContact.id !== msg.chatId) return;

    const messages = [...(this.activeContact.messages ?? [])];
    if (!messages.some(message => message.id === msg.id)) {
      messages.push({ ...msg, timestamp: this.parseDateValue(msg.timestamp) });
    }

    this.activeContact = {
      ...this.activeContact,
      messages,
      preview: this.isReactionMessage(msg)
        ? this.activeContact.preview
        : this.displayMessageBody(msg) || this.mediaFallbackLabel(msg.type),
      unread: msg.fromMe ? this.activeContact.unread : 0,
      lastClientMsg: msg.fromMe ? this.activeContact.lastClientMsg : this.parseDateValue(msg.timestamp),
    };

    if (!msg.fromMe) {
      this.subs.add(this.waService.markRead(this.activeContact.id).subscribe());
    }

    this.shouldScroll = true;
    this.cdr.detectChanges();
  }

  private handleAssignment(event: AwChatAssigned): void {
    if (event.advisorId !== this.currentUserId) return;
    this.showAssignmentToast(event.chat);
  }

  private handleQueueUpdate(event: AwQueueUpdated): void {
    if (!event.chat || event.chat.assignedTo || !this.isChatWaiting(event.chat)) return;
  }

  private showAssignmentToast(chat: WaChat): void {
    if (!this.floatingNotificationsEnabled) return;

    this.assignmentToast = `Nuevo chat asignado: ${chat.name}`;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.assignmentToast = '', 5_000);

  }

  private syncActiveContact(chats: WaChat[]): void {
    if (!this.activeContact) {
      if (chats.length) {
        this.activeContact = chats[0];
        this.contactDraft = this.draftFromContact(this.activeContact);
        this.shouldScroll = true;
        if (this.activeContact.unread > 0) {
          this.subs.add(this.waService.markRead(this.activeContact.id).subscribe());
        }
      }
      return;
    }

    const updated = chats.find(chat => chat.id === this.activeContact?.id);
    if (!updated) {
      this.activeContact = chats[0];
      if (this.activeContact) this.contactDraft = this.draftFromContact(this.activeContact);
      return;
    }

    const existingMessages = this.activeContact.messages ?? [];
    this.activeContact = {
      ...updated,
      messages: updated.messages?.length ? updated.messages : existingMessages,
    };
    if (!this.isEditingContact) this.contactDraft = this.draftFromContact(this.activeContact);
  }

  private matchesFilter(contact: WaChat): boolean {
    switch (this.activeFilter) {
      case 'mine':
        return contact.assignedTo === this.currentUserId && !this.isChatClosed(contact);
      case 'queue':
        return this.isChatWaiting(contact);
      case 'groups':
        return !!contact.isGroup;
      case 'unread':
        return contact.unread > 0;
      case 'closed':
        return this.isChatClosed(contact);
      case 'all':
      default:
        return true;
    }
  }

  private getAssignmentStatus(contact?: WaChat): 'waiting' | 'active' | 'closed' {
    if (contact?.isGroup) return 'active';
    if (contact?.assignmentStatus) return contact.assignmentStatus;
    if (contact?.tag === 'cerrado') return 'closed';
    if (contact?.tag === 'pendiente') return 'waiting';
    return contact?.assignedTo ? 'active' : 'waiting';
  }

  private isChatWaiting(contact?: WaChat): boolean {
    return !contact?.isGroup &&
      (this.getAssignmentStatus(contact) === 'waiting' || contact?.tag === 'pendiente');
  }

  private isReactionMessage(message?: WaMessage): boolean {
    if (!message) return false;
    return message.type === 'reaction' || /^\[Reaccion(?::\s*.+)?\]$/i.test((message.body || '').trim());
  }

  private reactionText(message: WaMessage): string {
    const body = (message.body || '').trim();
    if (message.reactionRemoved || /^enc:v\d+:/i.test(body) || body === '__reaction_removed__') return '';
    const raw = message.type === 'reaction'
      ? body
      : body.match(/^\[Reaccion(?::\s*(.+))?\]$/i)?.[1]?.trim() ?? '';
    return this.normalizeReactionEmoji(raw);
  }

  private isOwnReaction(message: WaMessage): boolean {
    if (message.participantJid && message.participantJid === this.currentUserId) return true;
    return !!this.currentUserName && (message.reactionByName || message.senderName) === this.currentUserName;
  }

  private reactionBelongsToMessage(reaction: WaMessage, message: WaMessage, messages: WaMessage[]): boolean {
    if (!this.isReactionMessage(reaction)) return false;
    const targetId = reaction.reactionToMessageId || reaction.mediaId;
    if (targetId) {
      return targetId === message.metaMessageId || targetId === message.id;
    }

    const reactionIndex = messages.findIndex(item => item.id === reaction.id);
    const messageIndex = messages.findIndex(item => item.id === message.id);
    if (reactionIndex <= messageIndex) return false;

    for (let i = reactionIndex - 1; i >= 0; i -= 1) {
      if (!this.isReactionMessage(messages[i])) {
        return messages[i].id === message.id;
      }
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
      'x': '\u274C',
      'X': '\u274C',
    };
    return map[clean] ?? '';
  }

  private parseDateValue(value: Date | string): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      return new Date(`${value}Z`);
    }
    return new Date(value);
  }

  private draftFromContact(contact: WaChat): ContactDraft {
    return {
      name: contact.name ?? '',
      role: contact.role ?? '',
      institution: contact.institution ?? '',
      institutionUrl: contact.institutionUrl ?? '',
      city: contact.city ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      plan: contact.plan ?? '',
      modulesText: (contact.modules ?? []).join(', '),
    };
  }

  private emptyDraft(): ContactDraft {
    return {
      name: '',
      role: '',
      institution: '',
      institutionUrl: '',
      city: '',
      phone: '',
      email: '',
      plan: '',
      modulesText: '',
    };
  }

  private defaultSettingsDraft(): WhatsappSettingsDraft {
    return {
      assignmentMsg: this.defaultAssignmentMsg,
      queueMsg: this.queueCopy,
      callUnavailableMsg: this.defaultCallUnavailableMsg,
      quickRepliesText: this.defaultQuickReplies.join('\n'),
    };
  }

  private defaultTeamsMeetingDraft(): TeamsMeetingDraft {
    const start = new Date(Date.now() + 15 * 60_000);
    return {
      subject: 'Reunion de seguimiento',
      startDateTime: this.toDateTimeLocalValue(start),
      durationMinutes: 30,
      calendarTarget: 'personal',
    };
  }

  private toDateTimeLocalValue(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private errorText(err: any, fallback: string): string {
    const message = err?.error?.message ?? err?.error?.error;
    if (Array.isArray(message)) return message.join(' ');
    return message || fallback;
  }

  private normalizeQuickReplies(value?: string[]): string[] {
    const replies = Array.isArray(value)
      ? value.map(reply => reply.trim()).filter(Boolean)
      : [];
    return replies.length ? replies.slice(0, 20) : [...this.defaultQuickReplies];
  }

  private quickRepliesFromSettingsText(value: string): string[] {
    const replies = value
      .split(/\r?\n/)
      .map(reply => reply.trim())
      .filter(Boolean)
      .slice(0, 20);
    return replies.length ? replies : [...this.defaultQuickReplies];
  }

  private applyQuickRepliesToContacts(replies: string[]): void {
    this.contacts = this.contacts.map(contact => ({ ...contact, quickReplies: replies }));
    if (this.activeContact) {
      this.activeContact = { ...this.activeContact, quickReplies: replies };
    }
  }

  private scrollToBottom(): void {
    try {
      this.messagesContainer.nativeElement.scrollTop =
        this.messagesContainer.nativeElement.scrollHeight;
    } catch {
      // View not ready yet.
    }
  }
}
