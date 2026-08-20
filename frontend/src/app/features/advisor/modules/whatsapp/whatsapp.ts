import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WaIconComponent } from '../../../../shared/components/wa-icon/wa-icon.component';
import { VoicePlayerComponent } from '../../../../shared/components/voice-player/voice-player.component';
import {
  VoiceRecorderComponent,
  VoiceRecordingResult,
} from '../../../../shared/components/voice-recorder/voice-recorder.component';
import { firstValueFrom, interval, Subscription, switchMap } from 'rxjs';

import { AiService } from '../../../../core/services/ai.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfiguracionFrontendService } from '../../../../core/services/configuracion.service';
import { TicketService } from '../../../../core/services/ticket.service';
import { SoundService } from '../../../../core/services/sound.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { InternalChatService } from '../../../../core/services/internal-chat.service';
import { SessionService } from '../../../../core/services/session.service';
import { InternalChatPanelComponent } from './internal-chat-panel/internal-chat-panel';
import {
  AwChatAssigned,
  AwNewMessage,
  AwQueueUpdated,
  WaChat,
  WaConnectionStatus,
  WaContactUpdate,
  WaMessage,
} from '../../../../core/models/whatsapp.models';
import { InternalConversation } from '../../../../core/models/internal-chat.models';
import { User } from '../../../../core/models/user.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { priorityLabel, priorityColor } from '../../../../shared/utils/ticket-categories';
import { scrollToBottom as scrollToBottomEl } from '../../../../shared/utils/scroll';
import { formatBogotaTime as formatBogotaTimeShared } from '../../../../shared/utils/date';

export type { WaChat as Contact };

type WaFilter = 'all' | 'mine' | 'queue' | 'groups' | 'unread' | 'closed' | 'advisor';
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

interface ComposerState {
  messageText: string;
  replyingTo: WaMessage | null;
  editingMessageId: string;
  editingMessageText: string;
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
  imports: [CommonModule, FormsModule, WaIconComponent, DecimalPipe, InternalChatPanelComponent, VoicePlayerComponent, VoiceRecorderComponent],
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;

  @HostBinding('class.theme-light') get isLightTheme(): boolean {
    return this.theme === 'light';
  }

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('docInput') docInput!: ElementRef<HTMLInputElement>;

  queueCopy = 'Te encuentras en cola. En breves momentos un agente se comunicara contigo.';
  readonly defaultAssignmentMsg =
    'Hola, soy {{agente}}. Ya fui asignado a tu conversacion y revisare tu caso.';
  readonly defaultCallUnavailableMsg =
    'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.';
  readonly defaultQuickReplies: Array<{ name: string; content: string }> = [
    { name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
    { name: 'Espera', content: 'Dame un momento mientras valido la informacion.' },
    { name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
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
    { id: 'advisor', label: 'Asesor' },
  ];
  readonly operationalStatusOptions: { id: WaOperationalStatus; label: string; hint: string }[] = [
    { id: 'in_progress', label: 'En gestion', hint: 'Atencion activa del caso.' },
    { id: 'waiting_technical', label: 'Esperando soporte', hint: 'Mantiene el agente asignado y no dispara cierre.' },
    { id: 'resolved', label: 'Resuelto', hint: 'Solucionado; entra al tiempo de cierre automatico.' },
  ];
  readonly editWindowMs = 15 * 60_000;
  readonly deleteWindowMs = 60 * 60 * 60_000;

  showMoreFilter = false;
  showCompactFilter = false;
  compactFilterTop = 0;
  compactFilterLeft = 0;

  contacts: WaChat[] = [];
  activeContact?: WaChat;
  contactDraft: ContactDraft = this.emptyDraft();
  settingsDraft: WhatsappSettingsDraft = this.defaultSettingsDraft();

  activeFilter: WaFilter = 'mine';
  searchQuery = '';
  messageText = '';
  selectedFile?: File;
  openReactionPopoverId = '';
  closingReactionPopoverId = '';
  emojiPickerOpen = false;
  private closeReactionTimer: ReturnType<typeof setTimeout> | null = null;
  selectedFilePreviewUrl = '';
  selectedFileKind: 'image' | 'video' | 'audio' | 'document' = 'document';
  selectedAudioDuration = 0;
  theme: WaTheme = 'dark';
  isRecordingAudio = false;
  showAttachMenu = false;
  sendError = '';
  newNote = '';
  aiInsightText = 'Analisis pendiente.';
  assignmentToast = '';
  toastMessage = '';
  toastType: 'ok' | 'error' = 'ok';

  showImprovePanel = false;
  isImproving      = false;
  improveTone      = 'formal';
  improveCustomTone = '';
  improveLength: 'short' | 'medium' | 'long' = 'medium';
  improveStep: 'tones' | 'variants' = 'tones';
  improveVariants: string[] = [];
  improveVariantIndex = -1;
  readonly improveTones = [
    { id: 'formal',  label: 'Formal',  desc: 'Serio e institucional' },
    { id: 'educado', label: 'Educado', desc: 'Amable y respetuoso' },
    { id: 'directo', label: 'Directo', desc: 'Claro y sin rodeos' },
    { id: 'custom',  label: 'Personalizado', desc: 'Escribe el tono que quieras' },
  ] as const;
  readonly improveLengths = [
    { id: 'short',  label: 'Corta' },
    { id: 'medium', label: 'Normal' },
    { id: 'long',   label: 'Extensa' },
  ] as const;

  ghostSuggestion = '';
  showSlashMenu = false;
  slashQuery = '';
  slashHighlight = 0;

  isTyping = false;
  isSending = false;
  isAiInsightLoading = false;
  isLoadingChats = true;
  loadingProgress = 0;
  isEditingContact = false;
  isSavingContact = false;
  isTakingChat = false;
  isClosingChat = false;
  isSavingWhatsappSettings = false;
  isUpdatingOperationalStatus = false;
  isTransferring = false;
  showTransferModal = false;
  transferTargetAdvisorId = '';
  transferAdvisors: User[] = [];
  transferSearchQuery = '';
  creatingTicket = false;
  ticketFeedback: { type: 'ok' | 'error'; text: string } | null = null;
  showTicketModal = false;
  ticketCategories: string[] = [];
  ticketDto = { titulo: '', priority: 'medium' as const, category: '' };
  showWhatsappSettings = false;
  showTeamsMeeting = false;
  showInfoPanel = false;
  showAiInsightModal = false;
  compactList = false;
  profilePhotoPreview?: { src: string; name: string };
  mediaPreview?: { src: string; name: string };
  videoPreview?: { src: string; name: string };
  mediaZoom = 1;
  mediaPanX = 0;
  mediaPanY = 0;
  protected isMediaDragging = false;
  @ViewChild('mediaImage') mediaImage?: ElementRef<HTMLImageElement>;
  private mediaDragStartX = 0;
  private mediaDragStartY = 0;
  private mediaDragPanX = 0;
  private mediaDragPanY = 0;
  private mediaPinchDist = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressMsgId = '';
  messageMenu?: { x: number; y: number; message: WaMessage; side: 'left' | 'right' };
  editingMessageId = '';
  editingMessageText = '';
  replyingTo: WaMessage | null = null;
  forwardingMessage: WaMessage | null = null;
  private forwardSourceChatId: string | null = null;
  private composerByChat = new Map<string, ComposerState>();
  forwardSearchQuery = '';
  forwardTargetIds = new Set<string>();
  isForwarding = false;
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
  qrExpiresIn = 0;
  private qrCountdownTimer: ReturnType<typeof setInterval> | null = null;
  floatingNotificationsEnabled = true;
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
    'audio/mp3',
    'audio/ogg',
    'audio/opus',
    'audio/amr',
    'audio/webm',
    'audio/wav',
    'audio/x-wav',
    'audio/x-m4a',
    'audio/flac',
    'audio/3gpp',
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
    'application/zip',
    'application/x-zip-compressed',
    'application/zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/x-rar',
    'application/x-7z-compressed',
    'application/x-compressed',
  ];
  readonly reactionQuick = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F525}', '\u{1F602}', '\u{1F389}', '\u{1F62E}'];
  readonly reactionEmojiGroups: { label: string; emojis: string[] }[] = [
    { label: 'Reacciones', emojis: ['\u{1F44D}', '\u{1F44E}', '\u2764\uFE0F', '\u{1F525}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F621}', '\u{1F44F}', '\u{1F64F}'] },
    { label: 'Emociones', emojis: ['\u{1F600}', '\u{1F601}', '\u{1F923}', '\u{1F60A}', '\u{1F60D}', '\u{1F929}', '\u{1F60E}', '\u{1F914}', '\u{1F62D}', '\u{1F92F}'] },
    { label: 'Gestos', emojis: ['\u270C\uFE0F', '\u{1F91E}', '\u{1F91A}', '\u{1F91D}', '\u{1F4AA}', '\u{1F64C}', '\u{1F44C}', '\u{1F91F}', '\u{1FAA1}', '\u{1FAF6}'] },
    { label: 'Celebracion', emojis: ['\u{1F389}', '\u{1F38A}', '\u{1F973}', '\u{1F3C6}', '\u2B50', '\u2705', '\u274C', '\u{1F4CC}', '\u{1F680}', '\u{1F4AF}'] },
  ];

  currentUserId = '';
  currentUserName = '';
  currentUserRole = '';
  advisorPhotoUrl = '';

  chatMode: 'clients' | 'advisors' = 'clients';
  internalUnreadTotal = 0;
  internalChatOpen = false;
  @ViewChild(InternalChatPanelComponent) internalPanel?: InternalChatPanelComponent;

  hasMoreMessages = false;
  isLoadingOlder = false;
  showScrollToBottom = false;
  private messagePage = 1;

  private shouldScroll = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private subs = new Subscription();
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly waService: WhatsappChatService,
    private readonly internalChat: InternalChatService,
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
    private readonly configService: ConfiguracionFrontendService,
    private readonly ticketService: TicketService,
    private readonly sound: SoundService,
    private readonly aiService: AiService,
    private readonly themeService: ThemeService,
    private readonly sanitizer: DomSanitizer,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.currentUserId = user?.id || '';
    this.currentUserName = user?.name || '';
    this.currentUserRole = user?.role || '';
    this.advisorPhotoUrl = user?.profilePhotoUrl || '';
    this.theme = this.themeService.currentTheme;

    this.subs.add(
      this.route.queryParamMap.subscribe(params => {
        this.setChatMode(params.get('modo') === 'advisors' ? 'advisors' : 'clients');
      }),
    );

    this.subs.add(
      this.themeService.currentTheme$.subscribe(t => {
        this.theme = t;
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.authService.user$.subscribe(u => {
        this.currentUserId = u?.id || this.currentUserId;
        this.currentUserName = u?.name || this.currentUserName;
        this.currentUserRole = u?.role || this.currentUserRole;
        this.advisorPhotoUrl = u?.profilePhotoUrl || '';
        this.cdr.detectChanges();
      }),
    );

    if (this.currentUserId) {
      this.waService.joinAsAdvisor(this.currentUserId);
    }

    this.internalChat.connect();
    this.subs.add(
      this.internalChat.getUnreadTotalStream().subscribe(total => {
        this.internalUnreadTotal = total;
        this.cdr.detectChanges();
      }),
    );
    this.subs.add(
      this.internalChat.getConversationsStream().subscribe(() => {
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(
      this.waService.getConnectionStream().subscribe(status => {
        this.connectionStatus = status;
        if (status.status === 'qr') {
          this.startQrCountdown();
        } else {
          this.stopQrCountdown();
        }
        this.cdr.detectChanges();
      }),
    );

    this.subs.add(this.waService.loadConnection().subscribe());

    this.subs.add(
      interval(30_000).pipe(
        switchMap(() => this.waService.loadConnection()),
      ).subscribe(),
    );

    // Respaldo por polling: si se pierde un evento de asignación o
    // actualización del chat, la lista se auto-corrige sin recargar.
    this.subs.add(
      interval(15_000).pipe(
        switchMap(() => this.waService.refreshChatsSilently()),
      ).subscribe(),
    );

    this.subs.add(
      this.configService.getEfectiva().subscribe(config => {
        this.queueCopy = config.whatsappQueueMsg || this.queueCopy;
        const replies = this.normalizeQuickReplies(config.whatsappQuickReplies);
        this.settingsDraft = {
          assignmentMsg: config.whatsappAssignmentMsg || this.defaultAssignmentMsg,
          queueMsg: config.whatsappQueueMsg || this.queueCopy,
          callUnavailableMsg: config.whatsappCallUnavailableMsg || this.defaultCallUnavailableMsg,
          quickRepliesText: replies.map((r: any) => r.content).join('\n'),
        };
        this.applyQuickRepliesToContacts(replies);
        this.cdr.detectChanges();
      }),
    );

    this.startLoadingProgress();

    this.subs.add(
      this.waService.loadChats().subscribe(res => {
        this.isLoadingChats = false;
        this.loadingProgress = 100;
        this.stopProgressTimer();
        const chats = Array.isArray(res) ? res : res.chats;
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
      this.waService.onChatUpdated().subscribe(chat => {
        if (this.activeContact && this.activeContact.id === chat.id) {
          this.reloadActiveMessages();
        }
      }),
    );

    this.subs.add(
      this.waService.onChatAssigned().subscribe(event => this.handleAssignment(event)),
    );

    this.subs.add(
      this.waService.onQueueUpdated().subscribe(event => this.handleQueueUpdate(event)),
    );

    window.addEventListener('message', this.handleTeamsAuthMessage);
    window.addEventListener('click', this.closeMessageMenuOnWindowClick);
    document.addEventListener('click', this.handleMentionClick);

    // ── Compact mode ───────────────────────────────────────────────────────
    this.checkCompact();
    this.resizeObserver = new ResizeObserver(() => this.checkCompact());
    this.resizeObserver.observe(document.body);
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScroll) return;
    this.scrollToBottom();
    this.shouldScroll = false;
  }

  setChatMode(mode: 'clients' | 'advisors'): void {
    if (this.chatMode === mode) return;
    this.saveComposer();
    this.chatMode = mode;
    this.showWhatsappSettings = false;
    this.showCompactFilter = false;
    this.showInfoPanel = false;
    this.closeMediaPreview();
    this.closeVideoFullscreen();
    this.closeProfilePhoto();
    if (mode === 'advisors') {
      this.activeContact = undefined;
      this.waService.setActiveChat(null);
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  onInternalActiveChange(open: boolean): void {
    this.internalChatOpen = open;
    this.cdr.detectChanges();
  }

  // ── Internal chat (advisors) delegates ─────────────────────────────────
  get internalConversations(): InternalConversation[] {
    return this.internalPanel?.conversations ?? [];
  }

  get internalFilteredConversations(): InternalConversation[] {
    return this.internalPanel?.filteredConversations ?? [];
  }

  get internalIsLoadingConversations(): boolean {
    return this.internalPanel?.isLoadingConversations ?? true;
  }

  get internalActiveConversationId(): string | null {
    return this.internalPanel?.activeConversation?.id ?? null;
  }

  get internalSearchQuery(): string {
    return this.internalPanel?.searchQuery ?? '';
  }

  set internalSearchQuery(v: string) {
    if (this.internalPanel) this.internalPanel.searchQuery = v;
  }

  internalConversationName(conv: InternalConversation): string {
    return this.internalPanel?.conversationName(conv) ?? '';
  }

  internalConversationAvatar(conv: InternalConversation): string {
    return this.internalPanel?.conversationAvatar(conv) ?? '';
  }

  internalConversationPhotoUrl(conv: InternalConversation): string | null {
    return this.internalPanel?.conversationPhotoUrl(conv) ?? null;
  }

  internalConversationTime(conv: InternalConversation): string {
    return this.internalPanel?.convTime(conv) ?? '';
  }

  internalPreviewText(conv: InternalConversation): string {
    return this.internalPanel?.previewText(conv) ?? '';
  }

  selectInternalConversation(conv: InternalConversation): void {
    this.internalPanel?.selectConversation(conv);
  }

  openInternalNewChat(): void {
    this.internalPanel?.openNewChat();
  }

  // ── Compact mode check ───────────────────────────────────────────────────
  private checkCompact(): void {
    const compact = window.innerWidth <= 900;
    if (compact !== this.compactList) {
      this.compactList = compact;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.stopProgressTimer();
    this.subs.unsubscribe();
    this.resizeObserver?.disconnect();
    window.removeEventListener('message', this.handleTeamsAuthMessage);
    window.removeEventListener('click', this.closeMessageMenuOnWindowClick);
    document.removeEventListener('click', this.handleMentionClick);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.closeReactionTimer) clearTimeout(this.closeReactionTimer);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.saveComposer();
    this.waService.setActiveChat(null);
    this.clearSelectedFile();
  }

  private startLoadingProgress(): void {
    this.loadingProgress = 0;
    this.stopProgressTimer();

    const tick = () => {
      if (this.isLoadingChats) {
        const remaining = 100 - this.loadingProgress;
        const increment = Math.min(remaining * 0.15 + Math.random() * 3, 8);
        this.loadingProgress = Math.min(this.loadingProgress + increment, 90);
      } else {
        this.loadingProgress = 100;
        this.stopProgressTimer();
      }
      this.cdr.detectChanges();
    };

    this.progressTimer = setInterval(tick, 400);
    tick();
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
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
      case 'advisor':
        return this.contacts.filter(c => !!c.assignedTo && !this.isChatClosed(c)).length;
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
      if (this.currentUserRole === 'admin') return true;
      return !this.activeContact.assignedTo || this.activeContact.assignedTo === this.currentUserId;
    }
    if (this.isAttentionClosed) return false;
    if (this.currentUserRole === 'admin') return true;
    return this.activeContact.assignedTo === this.currentUserId;
  }

  restartWaConnection(): void {
    if (this.isRestartingConnection) return;
    this.isRestartingConnection = true;
    this.subs.add(
      this.waService.restartConnection().subscribe({
        next: () => { this.isRestartingConnection = false; this.cdr.detectChanges(); },
        error: () => { this.isRestartingConnection = false; this.cdr.detectChanges(); },
      }),
    );
  }

  logoutWaSession(): void {
    if (this.isRestartingConnection) return;
    this.isRestartingConnection = true;
    this.subs.add(
      this.waService.logoutConnection().subscribe({
        next: () => {
          this.isRestartingConnection = false;
          setTimeout(() => this.restartWaConnection(), 500);
          this.cdr.detectChanges();
        },
        error: () => { this.isRestartingConnection = false; this.cdr.detectChanges(); },
      }),
    );
  }

  private startQrCountdown(): void {
    this.stopQrCountdown();
    this.qrExpiresIn = 55;
    this.qrCountdownTimer = setInterval(() => {
      this.qrExpiresIn = Math.max(0, this.qrExpiresIn - 1);
      this.cdr.detectChanges();
      if (this.qrExpiresIn <= 0) this.stopQrCountdown();
    }, 1000);
  }

  private stopQrCountdown(): void {
    if (this.qrCountdownTimer) {
      clearInterval(this.qrCountdownTimer);
      this.qrCountdownTimer = null;
    }
  }

  get canImproveDraft(): boolean {
    return !!this.activeContact && !this.isImproving && !!this.messageText.trim();
  }

  get hasComposerContent(): boolean {
    return !!this.messageText.trim() || !!this.selectedFile;
  }

  get slashFiltered(): Array<{ name: string; content: string }> {
    const q = this.slashQuery.toLowerCase();
    return (this.activeContact?.quickReplies ?? []).filter((reply: any) => {
      const text = typeof reply === 'string' ? reply : (reply.name + ' ' + reply.content);
      return text.toLowerCase().includes(q);
    }).map((reply: any) =>
      typeof reply === 'string' ? { name: reply.slice(0, 60), content: reply } : reply
    ) ?? [];
  }

  get visibleQuickReplies(): Array<{ name: string; content: string }> {
    return (this.activeContact?.quickReplies ?? []).slice(0, 3).map((reply: any) =>
      typeof reply === 'string' ? { name: reply.slice(0, 60), content: reply } : reply
    ) ?? [];
  }

  get selectedMoreFilter(): WaFilter | '' {
    return this.moreFilterOptions.some(filter => filter.id === this.activeFilter)
      ? this.activeFilter
      : '';
  }

  get allFilters(): { id: WaFilter; label: string }[] {
    return [...this.filterOptions, ...this.moreFilterOptions];
  }

  get replyPlaceholder(): string {
    if (!this.activeContact) return 'Selecciona una conversacion';
    if (this.connectionStatus.status !== 'connected') return 'Conecta WhatsApp escaneando el QR';
    if (this.activeContact.isGroup) return 'Responder al grupo desde InnovaCloud';
    if (this.isAttentionClosed) return 'Atencion cerrada. El historial se conserva';
    if (this.isInQueue) return 'Conversacion en cola';
    if (this.isAssignedToSomeoneElse) return 'Asignado a otro agente';
    if (this.isImproving) return 'Mejorando texto...';
    return 'Escribe un mensaje o / para respuestas rapidas';
  }

  setFilter(filter: WaFilter): void {
    this.activeFilter = filter;
  }

  toggleMoreFilter(): void {
    this.showMoreFilter = !this.showMoreFilter;
  }

  get activeFilterLabel(): string {
    const all = [...this.filterOptions, ...this.moreFilterOptions];
    return all.find(f => f.id === this.activeFilter)?.label ?? '';
  }

  toggleCompactFilter(event: MouseEvent): void {
    event.stopPropagation();
    if (this.showCompactFilter) {
      this.showCompactFilter = false;
      return;
    }
    const btn = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.compactFilterTop = btn.top;
    this.compactFilterLeft = btn.right + 8;
    this.showCompactFilter = true;
  }

  /** @deprecated replaced by toggleMoreFilter() dropdown */
  setMoreFilter(filter: WaFilter | ''): void {
    if (filter) this.setFilter(filter);
  }

  loadMoreChats(): void {
    this.subs.add(
      this.waService.loadMoreChats().subscribe({
        next: () => {
          this.cdr.detectChanges();
        },
        error: (err) => console.error('HTTP Error:', err),
      }),
    );
  }

  get hasMoreChats(): boolean {
    return this.waService.hasMore;
  }

  get isLoadingMoreChats(): boolean {
    return this.waService.isLoadingMore;
  }

  selectContact(contact: WaChat): void {
    const switching = !this.activeContact || this.activeContact.id !== contact.id;
    if (this.activeContact && this.activeContact.id !== contact.id) {
      this.saveComposer();
      if (this.forwardingMessage) this.cancelForward();
    }
    this.activeContact = contact;
    this.showInfoPanel = false;
    this.isEditingContact = false;
    this.contactDraft = this.draftFromContact(contact);
    this.aiInsightText = 'Analisis pendiente.';
    this.contactSaveMessage = '';
    this.sendError = '';
    this.newNote = '';
    this.shouldScroll = true;
    this.showScrollToBottom = false;
    this.hasMoreMessages = false;
    this.isLoadingOlder = false;
    this.messagePage = 1;
    this.closeMediaPreview();
    this.closeVideoFullscreen();
    this.closeProfilePhoto();
    if (switching) this.loadComposer(contact.id);
    this.waService.setActiveChat(contact.id);

    if (contact.unread > 0) {
      contact.unread = 0;
      this.subs.add(this.waService.markRead(contact.id).subscribe());
    }

    this.subs.add(
      this.waService.loadMessages(contact.id, 1, 100).subscribe(({ messages, hasMore }) => {
        if (!this.activeContact || this.activeContact.id !== contact.id) return;
        this.activeContact = { ...this.activeContact, messages };
        this.hasMoreMessages = hasMore;
        this.messagePage = 1;
        this.contactDraft = this.draftFromContact(this.activeContact);
        this.shouldScroll = true;
        this.cdr.detectChanges();
      }),
    );
  }

  closeActiveContactView(): void {
    this.saveComposer();
    this.waService.setActiveChat(null);
    this.activeContact = undefined;
    this.showInfoPanel = false;
    this.messageMenu = undefined;
    this.cancelEditMessage();
    this.cdr.detectChanges();
  }

  private saveComposer(): void {
    if (!this.activeContact) return;
    this.composerByChat.set(this.activeContact.id, {
      messageText: this.messageText,
      replyingTo: this.replyingTo,
      editingMessageId: this.editingMessageId,
      editingMessageText: this.editingMessageText,
    });
  }

  private loadComposer(chatId: string): void {
    this.clearSelectedFile(false);
    const state = this.composerByChat.get(chatId);
    if (state) {
      this.messageText = state.messageText;
      this.replyingTo = state.replyingTo;
      this.editingMessageId = state.editingMessageId;
      this.editingMessageText = state.editingMessageText;
    } else {
      this.messageText = '';
      this.replyingTo = null;
      this.editingMessageId = '';
      this.editingMessageText = '';
    }
    this.resizeMessageInput();
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showImprovePanel) { this.closeImprovePanel(); return; }
    if (this.mediaPreview) {
      this.closeMediaPreview();
    } else if (this.videoPreview) {
      this.closeVideoFullscreen();
    } else if (this.profilePhotoPreview) {
      this.closeProfilePhoto();
    }
  }

  openVideoFullscreen(message: WaMessage, event?: Event): void {
    event?.stopPropagation();
    const src = this.mediaUrlFor(message);
    if (!src) return;
    this.videoPreview = {
      src,
      name: message.fileName || 'Video',
    };
  }

  closeVideoFullscreen(): void {
    this.videoPreview = undefined;
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

  toggleEmojiPicker(): void {
    this.emojiPickerOpen = !this.emojiPickerOpen;
  }

  reactToMessage(message: WaMessage, emoji: string): void {
    if (!this.activeContact || !this.canReactToMessage(message)) return;
    const currentEmoji = this.ownReactionEmoji(message, this.activeContact.messages ?? []);
    const nextEmoji = emoji && emoji === currentEmoji ? '' : emoji;
    this.messageMenu = undefined;
    this.emojiPickerOpen = false;
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

  groupedMessages(messages: WaMessage[]): { label: string; messages: WaMessage[] }[] {
    const visible = this.visibleConversationMessages(messages);
    const groups: { label: string; messages: WaMessage[] }[] = [];
    let currentLabel = '';
    let currentGroup: WaMessage[] = [];
    for (const msg of visible) {
      const date = this.parseDateValue(msg.timestamp);
      const label = this.formatDateLabel(date);
      if (label !== currentLabel) {
        if (currentGroup.length) groups.push({ label: currentLabel, messages: currentGroup });
        currentLabel = label;
        currentGroup = [];
      }
      currentGroup.push(msg);
    }
    if (currentGroup.length) groups.push({ label: currentLabel, messages: currentGroup });
    return groups;
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
    return formatBogotaTimeShared(date);
  }

  private formatDateLabel(date: Date): string {
    const bogoKey = (d: Date) => {
      const b = new Date(d.getTime() - 5 * 3600000);
      return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`;
    };
    const dateKey = bogoKey(date);
    const todayKey = bogoKey(new Date());
    if (dateKey === todayKey) return 'Hoy';
    const yesterday = new Date();
    const bYesterday = new Date(yesterday.getTime() - 5 * 3600000);
    bYesterday.setUTCDate(bYesterday.getUTCDate() - 1);
    const yKey = `${bYesterday.getUTCFullYear()}-${String(bYesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(bYesterday.getUTCDate()).padStart(2, '0')}`;
    if (dateKey === yKey) return 'Ayer';
    const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    const bd = new Date(date.getTime() - 5 * 3600000);
    return `${bd.getUTCDate()} ${months[bd.getUTCMonth()]} ${bd.getUTCFullYear()}`;
  }

  toggleReactionPopover(event: MouseEvent, msgId: string): void {
  event.stopPropagation();
  if (this.closeReactionTimer) { clearTimeout(this.closeReactionTimer); this.closeReactionTimer = null; }
  if (this.openReactionPopoverId === msgId) {
    this.closingReactionPopoverId = msgId;
    this.closeReactionTimer = setTimeout(() => {
      this.openReactionPopoverId = '';
      this.closingReactionPopoverId = '';
      this.closeReactionTimer = null;
      this.cdr.detectChanges();
    }, 150);
  } else {
    this.closingReactionPopoverId = '';
    this.openReactionPopoverId = msgId;
  }
}

dismissReactionPopover(): void {
  if (!this.openReactionPopoverId) return;
  if (this.closeReactionTimer) { clearTimeout(this.closeReactionTimer); this.closeReactionTimer = null; }
  this.closingReactionPopoverId = this.openReactionPopoverId;
  this.closeReactionTimer = setTimeout(() => {
    this.openReactionPopoverId = '';
    this.closingReactionPopoverId = '';
    this.closeReactionTimer = null;
    this.cdr.detectChanges();
  }, 150);
}

copyMessageText(message: WaMessage): void {
  const text = (message.body || '').trim();
  if (!text) return;
  navigator.clipboard.writeText(text);
  this.sendError = '';
  this.messageMenu = undefined;
}

async copyMessageImage(message: WaMessage): Promise<void> {
  const src = this.mediaUrlFor(message);
  this.messageMenu = undefined;
  if (!src) return;
  try {
    const blob = await this.imageBlobFromUrl(src);
    if (!blob) throw new Error('no-blob');
    await this.writeClipboardImage(blob);
    this.showToast('Imagen copiada al portapapeles', 'ok');
  } catch {
    try {
      const blob = await this.imageBlobViaCanvas(src);
      if (!blob) throw new Error('no-blob');
      await this.writeClipboardImage(blob);
      this.showToast('Imagen copiada al portapapeles', 'ok');
    } catch {
      this.showToast('No se pudo copiar la imagen', 'error');
    }
  }
}

private async imageBlobFromUrl(url: string): Promise<Blob | null> {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  return blob.type.startsWith('image/') ? blob : null;
}

private async imageBlobViaCanvas(url: string): Promise<Blob | null> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 300;
  canvas.height = img.naturalHeight || 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

private async writeClipboardImage(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined') throw new Error('no-clipboard-item');
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type || 'image/png']: blob }),
  ]);
}

private showToast(message: string, type: 'ok' | 'error' = 'ok', ms = 3000): void {
  this.toastMessage = message;
  this.toastType = type;
  if (this.toastTimer) clearTimeout(this.toastTimer);
  this.toastTimer = setTimeout(() => (this.toastMessage = ''), ms);
}

startReply(message: WaMessage): void {
  this.replyingTo = message;
  this.messageMenu = undefined;
  this.forwardingMessage = null;
}

cancelReply(): void {
  this.replyingTo = null;
}

scrollToQuotedMessage(msg: WaMessage): void {
  const chat = this.activeContact;
  const quotedId = msg.replyToMessageId;
  if (!chat || !quotedId) return;
  const findTarget = (list: WaMessage[]) =>
    list.find(m => m.id === quotedId || m.metaMessageId === quotedId);

  const existing = findTarget(chat.messages ?? []);
  if (existing) {
    this.scrollToMsgElement(existing.id);
    return;
  }

  this.waService.loadMessages(chat.id, 1, 100, quotedId).subscribe({
    next: ({ messages }) => {
      if (!this.activeContact || this.activeContact.id !== chat.id) return;
      this.activeContact = { ...this.activeContact, messages };
      this.cdr.detectChanges();
      const target = findTarget(messages);
      if (target) {
        setTimeout(() => this.scrollToMsgElement(target.id), 150);
      }
    },
    error: (err) => console.error('HTTP Error:', err),
  });
}

private scrollToMsgElement(messageId: string): void {
  try {
    const container = this.messagesContainer.nativeElement as HTMLElement;
    const el = container.querySelector<HTMLElement>(
      `[data-msg-id="${messageId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('wa-flash');
    setTimeout(() => el.classList.remove('wa-flash'), 1200);
  } catch {}
}

startForward(message: WaMessage): void {
  this.forwardingMessage = message;
  this.forwardSourceChatId = this.activeContact?.id ?? null;
  this.forwardSearchQuery = '';
  this.forwardTargetIds = new Set();
  this.messageMenu = undefined;
  this.replyingTo = null;
}

cancelForward(): void {
  this.forwardingMessage = null;
  this.forwardSourceChatId = null;
  this.forwardSearchQuery = '';
  this.forwardTargetIds = new Set();
}

toggleForwardTarget(targetChatId: string): void {
  const next = new Set(this.forwardTargetIds);
  if (next.has(targetChatId)) next.delete(targetChatId);
  else next.add(targetChatId);
  this.forwardTargetIds = next;
}

confirmForward(): void {
  if (!this.forwardingMessage || !this.forwardSourceChatId || this.isForwarding || this.forwardTargetIds.size === 0) return;
  this.isForwarding = true;
  const sourceId = this.forwardSourceChatId;
  const messageId = this.forwardingMessage.id;
  const ids = [...this.forwardTargetIds];
  let completed = 0;
  for (const targetChatId of ids) {
    this.subs.add(
      this.waService.forwardMessage(sourceId, messageId, targetChatId).subscribe({
        next: () => {
          completed++;
          if (completed === ids.length) {
            this.isForwarding = false;
            this.cancelForward();
            this.assignmentToast = `Reenviado a ${ids.length} chat${ids.length === 1 ? '' : 's'}`;
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => this.assignmentToast = '', 3000);
            this.cdr.detectChanges();
          }
        },
        error: () => {
          completed++;
          if (completed === ids.length) {
            this.isForwarding = false;
            this.sendError = 'No se pudo reenviar el mensaje a todos los chats.';
            this.cdr.detectChanges();
          }
        },
      }),
    );
  }
}

quickReply(message: WaMessage): void {
  if (!message.body) return;
  if (this.replyingTo) return;
  this.startReply(message);
}

get filteredChats(): WaChat[] {
  const q = this.forwardSearchQuery.toLowerCase().trim();
  const chats = this.contacts.filter(c => c.id !== this.activeContact?.id);
  if (!q) return chats.slice(0, 20);
  return chats.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 20);
}

onBubbleTouchStart(event: TouchEvent, msg: WaMessage): void {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  this.longPressMsgId = msg.id;
  this.longPressTimer = setTimeout(() => {
    this.longPressTimer = null;
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const menuWidth = 198;
    const menuHeight = 200;
    const preferredX = msg.fromMe ? rect.left - menuWidth - 10 : rect.right + 10;
    const fallbackX = msg.fromMe ? rect.right - menuWidth : rect.left;
    const rawX = preferredX < 8 || preferredX + menuWidth > window.innerWidth - 8 ? fallbackX : preferredX;
    const rawY = rect.top + (rect.height / 2) - 28;
    this.messageMenu = {
      x: Math.max(8, Math.min(rawX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(rawY, window.innerHeight - menuHeight - 8)),
      message: msg,
      side: msg.fromMe ? 'right' : 'left',
    };
    this.cdr.detectChanges();
  }, 500);
}

onBubbleTouchEnd(): void {
  if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
  this.longPressMsgId = '';
}

onBubbleTouchMove(): void {
  if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
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
    this.emojiPickerOpen = false;
    this.cdr.detectChanges();
  }
  if (this.showAttachMenu) {
    this.showAttachMenu = false;
    this.cdr.detectChanges();
  }
  this.dismissReactionPopover();
};

  private handleMentionClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const el = target?.closest?.('.wa-mention[data-mention]') as HTMLElement | null;
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    const name = (el.getAttribute('data-mention') || '').trim();
    if (!name) return;
    const match = this.contacts.find(
      contact => (contact.name || '').toLowerCase() === name.toLowerCase(),
    );
    if (match) {
      this.selectContact(match);
    }
  };

  sendMessage(): void {
    if (this.selectedFile) {
      this.sendMediaMessage();
      return;
    }

    const rawText = this.messageText.trim();
    if (!rawText || !this.activeContact || this.isSending || !this.canReply) return;

    const text = this.formatForWhatsApp(rawText);
    const replyingTo = this.replyingTo;
    this.replyingTo = null;
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
      replyToMessageId: replyingTo?.metaMessageId || replyingTo?.id,
      quotedBody: replyingTo?.body,
      quotedSender: replyingTo?.senderName,
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
    this.saveComposer();

    this.subs.add(
      (replyingTo
        ? this.waService.replyToMessage(this.activeContact.id, replyingTo.id, text)
        : this.waService.sendMessage(this.addressForContact(this.activeContact), text)
      ).subscribe({
        next: (res: any) => {
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
        },
        error: (err: any) => {
          this.isSending = false;
          const messages = [...(this.activeContact?.messages ?? [])];
          const idx = messages.findIndex(msg => msg.id === optimisticMsg.id);
          if (idx >= 0) messages[idx] = { ...messages[idx], status: 'failed' };
          if (this.activeContact) this.activeContact = { ...this.activeContact, messages };
          this.sendError = err?.error?.error || err?.error?.message || 'Error al enviar el mensaje.';
          this.clearSelectedFile();
          this.cdr.detectChanges();
        },
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
    this.saveComposer();

    this.subs.add(
      this.waService.sendMedia(this.addressForContact(contact), file, caption, this.selectedAudioDuration).subscribe({
        next: (res) => {
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
          this.sendError = (res as any).error || 'No se pudo enviar el archivo. Revisa la conexion o la asignacion.';
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSending = false;
          const messages = [...(this.activeContact?.messages ?? [])];
          const idx = messages.findIndex(msg => msg.id === optimisticMsg.id);
          if (idx >= 0) messages[idx] = { ...messages[idx], status: 'failed' };
          if (this.activeContact) this.activeContact = { ...this.activeContact, messages };
          this.sendError = err?.error?.error || err?.error?.message || 'Error al enviar el archivo.';
          this.clearSelectedFile();
          this.cdr.detectChanges();
        },
      }),
    );
  }

  openAttachmentPicker(): void {
    if (!this.canReply || this.isSending) return;
    this.fileInput?.nativeElement?.click();
  }

  pickImage(): void {
    if (!this.canReply || this.isSending) return;
    this.imageInput?.nativeElement?.click();
  }

  pickVideo(): void {
    if (!this.canReply || this.isSending) return;
    this.videoInput?.nativeElement?.click();
  }

  pickDocument(): void {
    if (!this.canReply || this.isSending) return;
    this.docInput?.nativeElement?.click();
  }

  toggleAttachMenu(): void {
    if (!this.canReply || this.isSending || this.isRecordingAudio) return;
    this.showAttachMenu = !this.showAttachMenu;
    this.cdr.detectChanges();
  }

  selectAttach(kind: 'image' | 'file' | 'video'): void {
    this.showAttachMenu = false;
    if (kind === 'image') this.pickImage();
    else if (kind === 'video') this.pickVideo();
    else this.pickDocument();
    this.cdr.detectChanges();
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
    this.selectedFile = this.normalizeAudioFile(file);
    this.selectedFileKind = this.fileKind(this.selectedFile);
    this.selectedFilePreviewUrl = URL.createObjectURL(this.selectedFile);
    this.sendError = '';
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
    const file = files[0];
    if (file.size > 64 * 1024 * 1024) {
      this.sendError = 'El archivo supera el limite de 64 MB.';
      return;
    }
    if (!this.isAllowedUpload(file)) {
      this.sendError = 'Tipo de archivo no permitido para WhatsApp.';
      return;
    }

    this.clearSelectedFile(false);
    this.selectedFile = this.normalizeAudioFile(file);
    this.selectedFileKind = this.fileKind(this.selectedFile);
    this.selectedFilePreviewUrl = URL.createObjectURL(this.selectedFile);
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
    if (resetInput) {
      [this.fileInput, this.imageInput, this.videoInput, this.docInput].forEach(ref => {
        if (ref?.nativeElement) ref.nativeElement.value = '';
      });
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

  onVoiceFileReady(result: VoiceRecordingResult): void {
    if (!this.activeContact || !this.canReply || this.isSending) return;
    this.clearSelectedFile(false);
    this.selectedFile = result.file;
    this.selectedFileKind = 'audio';
    this.selectedFilePreviewUrl = URL.createObjectURL(result.file);
    this.selectedAudioDuration = result.duration;
    this.sendError = '';
    this.sendMediaMessage();
  }

  onVoiceRecordingChange(recording: boolean): void {
    this.isRecordingAudio = recording;
    this.cdr.detectChanges();
  }

  onVoiceError(message: string): void {
    this.sendError = message;
    this.cdr.detectChanges();
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
      this.ticketService.getCategories().subscribe({
        next: (cats) => {
          this.ticketCategories = cats;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('HTTP Error:', err),
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
        const okText = ticket.emailEnviado
          ? 'Ticket generado y enviado al correo del cliente'
          : 'Ticket generado correctamente';
        this.ticketFeedback = { type: 'ok', text: okText };
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.ticketFeedback = null;
          this.cdr.detectChanges();
        }, 3000);
        // Auto-mensaje
        const label = priorityLabel(ticket.priority);
        const address = contact.jid || contact.phone;
        if (address) {
          this.waService.sendMessage(address, `Se generó el ticket ${ticket.codigo} con prioridad ${label} y fue asignado a ${this.currentUserName}.`).subscribe({
            error: (err) => console.error('HTTP Error:', err),
          });
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.creatingTicket = false;
        const msg = err?.error?.message || err?.message || '';
        this.ticketFeedback = {
          type: 'error',
          text: msg.includes('No se pudo enviar el correo')
            ? 'No se pudo enviar el correo de confirmacion. El ticket no fue generado.'
            : msg.includes('codigo') || msg.includes('duplicate')
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
          this.contacts = this.contacts.map(contact =>
            contact.id === chat.id ? chat : contact,
          );
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

  isRecentChat(contact: WaChat): boolean {
    if (!contact.lastClientMsg) return false;
    const diffMs = Date.now() - new Date(contact.lastClientMsg).getTime();
    return diffMs <= 5 * 60 * 1000;
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

  openTransferModal(): void {
    if (!this.activeContact) return;
    this.transferTargetAdvisorId = '';
    this.transferSearchQuery = '';
    this.isTransferring = false;
    this.showTransferModal = true;
    
    this.subs.add(
      this.sessionService.findAdvisors().subscribe(advisors => {
        this.transferAdvisors = (advisors || []).filter(a => a.id !== this.currentUserId);
        this.cdr.detectChanges();
      })
    );
    this.cdr.detectChanges();
  }

  get filteredTransferAdvisors(): User[] {
    const q = this.transferSearchQuery.toLowerCase().trim();
    if (!q) return this.transferAdvisors;
    return this.transferAdvisors.filter(a =>
      a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    );
  }

  selectTransferAdvisor(id: string): void {
    this.transferTargetAdvisorId = id;
    this.cdr.detectChanges();
  }

  closeTransferModal(): void {
    this.showTransferModal = false;
    this.transferTargetAdvisorId = '';
    this.transferSearchQuery = '';
    this.cdr.detectChanges();
  }

  doTransferChat(): void {
    if (!this.activeContact || !this.transferTargetAdvisorId || this.isTransferring) return;

    this.isTransferring = true;
    const chatId = this.activeContact.id;

    this.subs.add(
      this.waService.transferChat(chatId, this.transferTargetAdvisorId).subscribe({
        next: () => {
          this.isTransferring = false;
          this.showTransferModal = false;
          this.transferTargetAdvisorId = '';
          this.activeContact = undefined;
          this.assignmentToast = 'Conversación transferida con éxito';
          this.toastTimer = setTimeout(() => this.assignmentToast = '', 3000);
          this.cdr.detectChanges();
        },
        error: err => {
          this.isTransferring = false;
          const message = err?.error?.message;
          const errMsg = Array.isArray(message)
            ? message.join(' ')
            : message || 'No se pudo transferir este chat.';
          alert(errMsg);
          this.cdr.detectChanges();
        }
      })
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
    const match = (this.activeContact?.quickReplies ?? []).find((reply: any) => {
      const text = typeof reply === 'string' ? reply : (reply.name + ' ' + reply.content);
      return text.toLowerCase().startsWith(this.slashQuery) && this.slashQuery.length > 0;
    });
    if (match) {
      const content = typeof match === 'string' ? match : match.content;
      this.ghostSuggestion = content.slice(this.slashQuery.length);
    } else {
      this.ghostSuggestion = '';
    }
  }

  selectSlashReply(reply: any): void {
    const content = typeof reply === 'string' ? reply : reply.content;
    const slashIdx = this.messageText.lastIndexOf('/');
    this.messageText = slashIdx >= 0
      ? this.messageText.slice(0, slashIdx) + content
      : content;
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
    this.resizeMessageInput();
    this.messageInput?.nativeElement?.focus();
  }

  useQuickReply(reply: any): void {
    const content = typeof reply === 'string' ? reply : reply.content;
    this.messageText = content;
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
            quickRepliesText: replies.map((r: any) => r.content).join('\n'),
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

  isFixedToOther(): boolean {
    if (!this.activeContact?.fixedAdvisorId) return false;
    if (this.currentUserRole === 'admin') return false;
    return true;
  }

  getAssignmentLabel(contact?: WaChat): string {
    if (contact?.isGroup) return 'Grupo compartido';
    if (this.isChatClosed(contact)) return 'Atencion cerrada';
    if (contact?.fixedAdvisorId) return 'ASESOR FIJADO';
    if (!contact?.assignedTo) return 'En cola';
    if (contact.assignedTo === this.currentUserId) return 'Mi chat';
    return contact.assignedToName ? `Asignado a ${contact.assignedToName}` : 'Asignado';
  }

  getHeaderStatus(contact?: WaChat): string {
    if (!contact) return '';
    if (this.isChatClosed(contact)) return 'Cerrado';
    const parts: string[] = [];
    if (contact.status === 'online') parts.push('Activo');
    else if (contact.status === 'away') parts.push('Ausente');
    else parts.push('Inactivo');
    if (contact.assignedToName) parts.push(contact.assignedToName);
    else if (contact.assignedTo === this.currentUserId) parts.push('Mi chat');
    return parts.join(' · ');
  }

  getPresenceLabel(contact?: WaChat): string {
    if (!contact) return '';
    if (contact.status === 'online') return 'Cliente activo en el chat';
    if (contact.status === 'away') return 'Cliente ausente';
    return 'Cliente inactivo';
  }

  isChatClosed(contact?: WaChat): boolean {
    return this.getAssignmentStatus(contact) === 'closed' || contact?.tag === 'cerrado';
  }

  toggleImprovePanel(): void {
    if (!this.messageText.trim()) return;
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
    if (this.improveTone === 'custom') {
      return this.improveCustomTone?.trim() || 'Personalizado';
    }
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
    const draft = this.messageText.trim();
    if (!draft || this.isImproving || !this.activeContact) return;

    const c = this.activeContact;
    const tone =
      this.improveTone === 'custom'
        ? (this.improveCustomTone?.trim() || 'formal')
        : this.improveTone;
    const ultimoCliente = [...(c.messages ?? [])]
      .reverse()
      .find(m => !m.fromMe);
    const context = ultimoCliente?.body
      ? ultimoCliente.body.slice(0, 500)
      : undefined;

    this.isImproving = true;
    try {
      const res = await firstValueFrom(
        this.aiService.improveWhatsappDraft({
          draft,
          clientName: c.name,
          institution: c.institution,
          role: c.role,
          tone,
          length: this.improveLength,
          context,
        }),
      );
      const variants = (res.replies ?? [])
        .map(v => (v ?? '').trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.findIndex(x => x === v) === i)
        .slice(0, 3);
      if (variants.length) {
        this.improveVariants = variants;
        this.improveVariantIndex = -1;
        this.improveStep = 'variants';
      } else {
        this.showToast('No se pudo mejorar el mensaje con IA.', 'error');
      }
    } catch {
      this.showToast('No se pudo mejorar el mensaje con IA.', 'error');
    } finally {
      this.isImproving = false;
    }
  }

  selectImproveVariant(index: number): void {
    const text = this.improveVariants[index];
    if (!text) return;
    this.improveVariantIndex = index;
    this.messageText = text.slice(0, 1000);
    this.showSlashMenu = false;
    this.slashQuery = '';
    this.ghostSuggestion = '';
    this.resizeMessageInput();
    this.messageInput?.nativeElement?.focus();
    this.showToast('Mensaje mejorado', 'ok');
    this.closeImprovePanel();
  }

  async aiInsight(): Promise<void> {
    if (this.isAiInsightLoading || !this.activeContact) return;
    const c = this.activeContact;

    this.isAiInsightLoading = true;
    this.aiInsightText = '';
    try {
      let fetched: WaMessage[] = [];
      try {
        fetched = (await firstValueFrom(
          this.waService.loadMessages(c.id, 1, 500),
        )).messages;
      } catch {
        fetched = c.messages ?? [];
      }
      const messages = this.compactConversationForAi(fetched);
      if (!messages.length) {
        this.aiInsightText =
          'Aun no hay mensajes suficientes para resumir esta conversacion.';
        return;
      }

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

  private compactConversationForAi(
    messages: WaMessage[],
  ): { fromMe: boolean; body: string; time?: string | number | Date }[] {
    return messages
      .map(message => ({
        fromMe: message.fromMe,
        body: this.compactText(
          this.displayMessageBody(message) || this.mediaFallbackLabel(message.type),
          180,
        ),
        time: message.timestamp,
      }))
      .filter(message => !!message.body?.trim());
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
      sticker: 'Sticker',
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

  voiceAvatar(contact?: WaChat, fromMe?: boolean): string {
    if (fromMe) return this.advisorPhotoUrl || this.avatarSrc(contact);
    return this.avatarSrc(contact);
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

  formatWaMessage(message: WaMessage): SafeHtml {
    const body = this.displayMessageBody(message);
    if (!body) return '';
    const html = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(
        /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_.]+)/gu,
        '<span class="wa-mention" data-mention="$1">@$1</span>'
      )
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
    const audioMime = this.audioMimeFromExtension(file.name);
    if (
      audioMime &&
      (!mimeType || !this.allowedUploadTypes.includes(mimeType))
    ) {
      return true;
    }
    if (this.isArchiveByName(file.name)) return true;
    if (!this.allowedUploadTypes.includes(mimeType)) return false;
    const ext = this.extensionFromName(file.name);
    const expected = this.extensionForMime(mimeType);
    return !expected || !ext || ext === expected || this.isCompatibleExtension(mimeType, ext);
  }

  private isArchiveByName(name = ''): boolean {
    const ext = this.extensionFromName(name);
    return ['.zip', '.rar', '.7z'].includes(ext);
  }

  private audioMimeFromExtension(name = ''): string {
    const map: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.m4b': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.oga': 'audio/ogg',
      '.opus': 'audio/opus',
      '.wav': 'audio/wav',
      '.weba': 'audio/webm',
      '.amr': 'audio/amr',
      '.flac': 'audio/flac',
      '.mka': 'audio/matroska',
      '.wma': 'audio/x-ms-wma',
      '.aif': 'audio/aiff',
      '.aiff': 'audio/aiff',
    };
    return map[this.extensionFromName(name)] ?? '';
  }

  private normalizeAudioFile(file: File): File {
    const audioMime = this.audioMimeFromExtension(file.name);
    if (!audioMime || this.normalizeMimeType(file.type) === audioMime) return file;
    return new File([file], file.name, { type: audioMime });
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
    this.reloadActiveMessages();
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
    if (!this.activeContact) return;

    const updated = chats.find(chat => chat.id === this.activeContact?.id);
    if (!updated) {
      this.activeContact = undefined;
      this.contactDraft = this.emptyDraft();
      this.waService.setActiveChat(null);
      return;
    }

    const existingMessages = this.activeContact.messages ?? [];
    const mergedMessages = this.mergeMessages(existingMessages, updated.messages ?? []);
    this.activeContact = {
      ...updated,
      messages: mergedMessages.length ? mergedMessages : (updated.messages ?? []),
    };
    if (!this.isEditingContact) this.contactDraft = this.draftFromContact(this.activeContact);
  }

  private mergeMessages(current: WaMessage[], incoming: WaMessage[]): WaMessage[] {
    const byId = new Map<string, WaMessage>();
    for (const message of current) byId.set(message.id, message);
    for (const message of incoming) {
      if (!byId.has(message.id)) byId.set(message.id, message);
    }
    return [...byId.values()].sort(
      (a, b) =>
        this.parseDateValue(a.timestamp).getTime() -
        this.parseDateValue(b.timestamp).getTime(),
    );
  }

  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  private reloadActiveMessages(): void {
    const contact = this.activeContact;
    if (!contact) return;
    const prevLastId = (contact.messages ?? []).slice(-1)[0]?.id ?? '';
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      if (!this.activeContact || this.activeContact.id !== contact.id) return;
      this.subs.add(
        this.waService.loadMessages(contact.id, 1, 100).subscribe(({ messages, hasMore }) => {
          if (!this.activeContact || this.activeContact.id !== contact.id) return;
          const lastId = messages.slice(-1)[0]?.id ?? '';
          const existing = this.activeContact.messages ?? [];
          const merged = this.mergeMessages(existing, messages);
          this.activeContact = { ...this.activeContact, messages: merged };
          this.hasMoreMessages = hasMore;
          if (lastId && lastId !== prevLastId) this.shouldScroll = true;
          this.contactDraft = this.draftFromContact(this.activeContact);
          this.cdr.detectChanges();
        }),
      );
    }, 250);
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
      case 'advisor':
        return !!contact.assignedTo && !this.isChatClosed(contact);
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
    const b = new Date(date.getTime() - 5 * 3600000);
    const y = b.getUTCFullYear();
    const m = String(b.getUTCMonth() + 1).padStart(2, '0');
    const d = String(b.getUTCDate()).padStart(2, '0');
    const hh = String(b.getUTCHours()).padStart(2, '0');
    const mm = String(b.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  private errorText(err: any, fallback: string): string {
    const message = err?.error?.message ?? err?.error?.error;
    if (Array.isArray(message)) return message.join(' ');
    return message || fallback;
  }

  private normalizeQuickReplies(value?: any[]): Array<{ name: string; content: string }> {
    if (!Array.isArray(value) || !value.length) return [...this.defaultQuickReplies];

    if (typeof value[0] === 'string') {
      return value
        .map((text: string) => ({ name: text.trim().slice(0, 60), content: text.trim() }))
        .filter(r => r.content);
    }

    return value
      .filter((r: any) => r?.name && r?.content)
      .map((r: any) => ({ name: String(r.name).slice(0, 60), content: String(r.content).slice(0, 500) }));
  }

  private quickRepliesFromSettingsText(value: string): Array<{ name: string; content: string }> {
    const replies = value
      .split(/\r?\n/)
      .map(reply => reply.trim())
      .filter(Boolean);
    return replies.length
      ? replies.map(text => ({ name: text.slice(0, 60), content: text }))
      : [...this.defaultQuickReplies];
  }

  private applyQuickRepliesToContacts(replies: Array<{ name: string; content: string }>): void {
    this.contacts = this.contacts.map(contact => ({ ...contact, quickReplies: replies }));
    if (this.activeContact) {
      this.activeContact = { ...this.activeContact, quickReplies: replies };
    }
  }

  formatForWhatsApp(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1: $2');
  }

  formatPreview(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
  }

  private scrollToBottom(): void {
    try {
      scrollToBottomEl(this.messagesContainer.nativeElement);
    } catch {
      // View not ready yet.
    }
  }

  // ── Progressive message loading (scroll-up to load older) ─────────────
  onScrollMessages(): void {
    const el = this.messagesContainer?.nativeElement as HTMLElement | undefined;
    if (!el) return;

    const threshold = 120;
    const isNearTop = el.scrollTop < threshold;
    if (isNearTop && this.hasMoreMessages && !this.isLoadingOlder) {
      this.loadOlderMessages();
    }

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.showScrollToBottom = !atBottom;
  }

  private loadOlderMessages(): void {
    const contact = this.activeContact;
    if (!contact || this.isLoadingOlder || !this.hasMoreMessages) return;

    this.isLoadingOlder = true;
    this.messagePage++;
    const container = this.messagesContainer.nativeElement as HTMLElement;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    this.subs.add(
      this.waService.loadMessages(contact.id, this.messagePage, 50).subscribe({
        next: ({ messages, hasMore }) => {
          if (!this.activeContact || this.activeContact.id !== contact.id) return;
          const existing = this.activeContact.messages ?? [];
          const merged = this.mergeMessages(messages, existing);
          this.activeContact = { ...this.activeContact, messages: merged };
          this.hasMoreMessages = hasMore;
          this.isLoadingOlder = false;
          this.cdr.detectChanges();
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          });
        },
        error: () => {
          this.isLoadingOlder = false;
          this.messagePage--;
          this.cdr.detectChanges();
        },
      }),
    );
  }

  scrollToBottomSmooth(): void {
    this.showScrollToBottom = false;
    const el = this.messagesContainer?.nativeElement as HTMLElement | undefined;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }
}
