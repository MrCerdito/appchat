import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { WaIconComponent } from '../../../../../shared/components/wa-icon/wa-icon.component';
import { VoicePlayerComponent } from '../../../../../shared/components/voice-player/voice-player.component';
import {
  VoiceRecorderComponent,
  VoiceRecordingResult,
} from '../../../../../shared/components/voice-recorder/voice-recorder.component';
import { AuthService } from '../../../../../core/services/auth.service';
import { ThemeService } from '../../../../../core/services/theme.service';
import { InternalChatService } from '../../../../../core/services/internal-chat.service';
import {
  InternalChatUser,
  InternalConversation,
  InternalMessage,
  InternalMessageType,
} from '../../../../../core/models/internal-chat.models';
import { trackByIndex } from '../../../../../shared/utils/track-by';
import { scrollToBottom as scrollToBottomEl } from '../../../../../shared/utils/scroll';
import {
  formatBogotaTime,
  fmtDateMedium,
  isTodayBogota,
  isYesterdayBogota,
} from '../../../../../shared/utils/date';

type SelectedFileKind = 'image' | 'audio' | 'file' | null;

interface ContextMenuState {
  message: InternalMessage;
  x: number;
  y: number;
}

@Component({
  selector: 'app-internal-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, WaIconComponent, VoicePlayerComponent, VoiceRecorderComponent],
  templateUrl: './internal-chat-panel.html',
  styleUrl: './internal-chat-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InternalChatPanelComponent implements OnInit, AfterViewChecked, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly reactionEmojis = ['👍', '❤️', '🔥', '😂', '🎉', '😮', '😢', '👏', '🙏', '✅', '❌', '⭐'];

  @Output() activeChange = new EventEmitter<boolean>();

  @Input() embedded = false;

  @ViewChild('icMessages') messagesContainer!: ElementRef;
  @ViewChild('draftArea') draftArea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('icContext') icContext?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('groupPhotoInput') groupPhotoInput?: ElementRef<HTMLInputElement>;

  conversations: InternalConversation[] = [];
  activeConversation: InternalConversation | null = null;
  messages: InternalMessage[] = [];
  advisors: InternalChatUser[] = [];
  currentUserId = '';
  currentUserName = '';
  currentUserRole = '';
  advisorPhotoUrl = '';

  isLoadingConversations = true;
  isLoadingMessages = false;

  searchQuery = '';
  showNewChat = false;
  newChatSearch = '';

  draft = '';
  isSending = false;

  replyToMessage: InternalMessage | null = null;
  editingMessage: InternalMessage | null = null;

  selectedFile: File | null = null;
  selectedFileKind: SelectedFileKind = null;
  selectedFilePreviewUrl = '';
  selectedAudioDuration = 0;

  isRecordingAudio = false;

  contextMenu: ContextMenuState | null = null;
  showReactionsForId: string | null = null;

  showForwardPicker = false;
  forwardSource: InternalMessage | null = null;
  forwardTargetIds = new Set<string>();
  forwardSearch = '';

  longPressMsgId = '';

  imagePreviewUrl: string | null = null;
  imagePreviewName = '';
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

  errorMessage = '';
  showAttachMenu = false;
  successMessage = '';
  isUploadingPhoto = false;

  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly senderPalette = [
    '#3B82F6',
    '#8B5CF6',
    '#EC4899',
    '#F59E0B',
    '#10B981',
    '#F97316',
    '#06B6D4',
    '#E11D48',
  ];

  private subs = new Subscription();
  private shouldScroll = false;
  private forceScrollToBottom = false;
  private lastMsgId = '';

  constructor(
    private readonly internalChat: InternalChatService,
    private readonly authService: AuthService,
    private readonly themeService: ThemeService,
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.currentUserId = user?.id || '';
    this.currentUserName = user?.name || '';
    this.currentUserRole = user?.role || '';
    this.advisorPhotoUrl = user?.profilePhotoUrl || '';

    this.subs.add(
      this.authService.user$.subscribe(u => {
        this.currentUserId = u?.id || this.currentUserId;
        this.currentUserName = u?.name || this.currentUserName;
        this.currentUserRole = u?.role || this.currentUserRole;
        this.advisorPhotoUrl = u?.profilePhotoUrl || '';
        this.cdr.detectChanges();
      }),
    );

    this.internalChat.setCurrentUser(this.currentUserId);
    this.internalChat.connect();

    this.subs.add(
      this.internalChat.getConversationsStream().subscribe(list => {
        this.conversations = list;
        if (this.activeConversation) {
          const fresh = list.find(c => c.id === this.activeConversation?.id);
          if (fresh) this.activeConversation = fresh;
        }
        this.cdr.detectChanges();
      }),
    );
    this.subs.add(
      this.internalChat.getMessagesStream().subscribe(list => {
        this.messages = list;
        if (list.length) this.isLoadingMessages = false;
        const last = list.length ? list[list.length - 1] : null;
        if (last && last.id !== this.lastMsgId) this.shouldScroll = true;
        this.lastMsgId = last?.id ?? '';
        this.cdr.detectChanges();
      }),
    );
    this.subs.add(
      this.internalChat.getAdvisorsStream().subscribe(list => {
        this.advisors = list;
        this.cdr.detectChanges();
      }),
    );
    this.subs.add(
      this.internalChat.onReactions().subscribe(() => {
        this.cdr.detectChanges();
      }),
    );

    this.internalChat.loadAdvisors().subscribe();
    this.internalChat.loadConversations().subscribe({
      complete: () => {
        this.isLoadingConversations = false;
        this.cdr.detectChanges();
      },
    });
  }

  ngAfterViewChecked(): void {
    if (!this.messagesContainer) return;
    const list = this.messages;
    const last = list.length ? list[list.length - 1] : null;
    if (!last) return;
    if (this.forceScrollToBottom) {
      this.forceScrollToBottom = false;
      this.shouldScroll = false;
      scrollToBottomEl(this.messagesContainer.nativeElement, { smooth: true });
      return;
    }
    if (!this.shouldScroll) return;
    this.shouldScroll = false;
    const isOwn = last.pending || last.senderId === this.currentUserId;
    if (isOwn || this.isNearBottom()) {
      scrollToBottomEl(this.messagesContainer.nativeElement, { smooth: true });
    }
  }

  private isNearBottom(): boolean {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }

  get filteredConversations(): InternalConversation[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.conversations;
    return this.conversations.filter(c => {
      const name = this.conversationName(c).toLowerCase();
      return name.includes(q);
    });
  }

  get filteredAdvisors(): InternalChatUser[] {
    const q = this.newChatSearch.trim().toLowerCase();
    const list = this.advisors.filter(a => a.id !== this.currentUserId);
    if (!q) return list;
    return list.filter(a =>
      a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
    );
  }

  get existingDirectIds(): Set<string> {
    const ids = new Set<string>();
    for (const c of this.conversations) {
      if (c.type !== 'direct') continue;
      const other = c.members.find(m => m.id !== this.currentUserId);
      if (other) ids.add(other.id);
    }
    return ids;
  }

  conversationName(conv: InternalConversation): string {
    if (conv.type === 'group') return conv.name || 'Grupo';
    const other = conv.members.find(m => m.id !== this.currentUserId);
    return other?.name || 'Chat directo';
  }

  conversationAvatar(conv: InternalConversation): string {
    const name = this.conversationName(conv);
    return name.charAt(0).toUpperCase();
  }

  conversationPhotoUrl(conv: InternalConversation): string | null {
    if (conv.type === 'group') return conv.photoUrl || null;
    const other = conv.members.find(m => m.id !== this.currentUserId);
    return other?.profilePhotoUrl || null;
  }

  changeGroupPhoto(): void {
    if (!this.activeConversation || this.activeConversation.type !== 'group') return;
    this.groupPhotoInput?.nativeElement.click();
  }

  onGroupPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.activeConversation) return;
    if (!file.type.startsWith('image/')) {
      this.errorMessage = 'Solo se permiten imágenes.';
      this.cdr.detectChanges();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.errorMessage = 'La imagen supera el límite de 5 MB.';
      this.cdr.detectChanges();
      return;
    }
    this.isUploadingPhoto = true;
    this.cdr.detectChanges();
    this.internalChat.uploadPhoto(this.activeConversation.id, file).subscribe(res => {
      this.isUploadingPhoto = false;
      if (res?.id) {
        this.activeConversation = { ...this.activeConversation!, ...res };
        this.showSuccess('Foto del grupo actualizada');
      } else {
        this.errorMessage = 'No se pudo actualizar la foto del grupo.';
      }
      this.cdr.detectChanges();
    });
  }

  previewText(conv: InternalConversation): string {
    const last = conv.lastMessage;
    if (!last) return 'Sin mensajes todavía';
    if (last.deleted) return 'Mensaje eliminado';
    let preview = '';
    if (last.type === 'image') preview = (last.body || '').trim() || 'Imagen';
    else if (last.type === 'audio') preview = (last.body || '').trim() || 'Audio';
    else if (last.type === 'file') preview = (last.body || '').trim() || 'Archivo';
    else preview = (last.body || '').trim() || 'Mensaje';
    if (last.senderName === this.currentUserName) return `Tú: ${preview}`;
    return preview;
  }

  chatSubtitle(): string {
    const c = this.activeConversation;
    if (!c) return '';
    if (c.type === 'group') return `${c.members.length} participantes`;
    const other = c.members.find(m => m.id !== this.currentUserId);
    if (other) return other.role === 'admin' ? 'Administrador' : 'Agente';
    return 'Chat directo';
  }

  replyPreview(msg: InternalMessage): string {
    if (msg.deletedAt) return 'Mensaje eliminado';
    if (msg.type === 'text') return msg.body;
    if (msg.type === 'image') return 'Imagen';
    if (msg.type === 'audio') return 'Audio';
    if (msg.type === 'file') return this.isVideoMessage(msg) ? 'Video' : (msg.mediaName || 'Archivo');
    return msg.body;
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

  quotedThumb(msg: InternalMessage): string | null {
    return msg.type === 'image' && msg.mediaUrl ? msg.mediaUrl : null;
  }

  forwardSourceIcon(msg: InternalMessage): string {
    if (msg.type === 'image') return 'photo';
    if (msg.type === 'audio') return 'microphone';
    if (msg.type === 'file') return this.isVideoMessage(msg) ? 'video' : 'file-text';
    return 'message-circle';
  }

  editedLabel(msg: InternalMessage): string {
    return msg.editedAt
      ? `Editado ${formatBogotaTime(new Date(msg.editedAt))}`
      : 'Editado';
  }

  senderColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return this.senderPalette[hash % this.senderPalette.length];
  }

  convTime(conv: InternalConversation): string {
    if (!conv.lastMessageAt) return '';
    return formatBogotaTime(new Date(conv.lastMessageAt));
  }

  selectConversation(conv: InternalConversation): void {
    this.activeConversation = conv;
    this.replyToMessage = null;
    this.editingMessage = null;
    this.errorMessage = '';
    this.activeChange.emit(true);
    this.forceScrollToBottom = true;
    this.internalChat.setActiveConversation(conv.id);
    this.closeImage();
    this.isLoadingMessages = true;
    this.messages = [];
    this.cdr.detectChanges();
    this.internalChat.loadMessages(conv.id).subscribe({
      complete: () => {
        this.isLoadingMessages = false;
        this.cdr.detectChanges();
      },
    });
  }

  backToList(): void {
    this.activeConversation = null;
    this.activeChange.emit(false);
    this.internalChat.setActiveConversation(null);
    this.cdr.detectChanges();
  }

  openNewChat(): void {
    this.showNewChat = true;
    this.newChatSearch = '';
    if (this.advisors.length === 0) {
      this.internalChat.loadAdvisors().subscribe();
    }
    this.cdr.detectChanges();
  }

  closeNewChat(): void {
    this.showNewChat = false;
  }

  startDirect(advisor: InternalChatUser): void {
    if (this.existingDirectIds.has(advisor.id)) {
      const existing = this.conversations.find(c =>
        c.type === 'direct' && c.members.some(m => m.id === advisor.id),
      );
      this.closeNewChat();
      if (existing) {
        this.selectConversation(existing);
        return;
      }
    }
    this.internalChat.openDirect(advisor.id).subscribe(conv => {
      this.closeNewChat();
      if (conv?.id) {
        this.selectConversation(conv);
      } else {
        this.errorMessage = 'No se pudo iniciar el chat.';
        this.cdr.detectChanges();
      }
    });
  }

  onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    event.preventDefault();
    this.sendMessage();
  }

  onEscape(): void {
    if (this.imagePreviewUrl) {
      this.closeImage();
      return;
    }
    if (this.editingMessage) {
      this.cancelEdit();
    } else if (this.replyToMessage) {
      this.cancelReply();
    }
    this.cdr.detectChanges();
  }

  quickReply(msg: InternalMessage): void {
    if (msg.type === 'system' || msg.deletedAt || msg.type !== 'text') return;
    this.replyTo(msg);
  }

  toggleAttachMenu(): void {
    this.showAttachMenu = !this.showAttachMenu;
    this.cdr.detectChanges();
  }

  selectAttach(kind: 'image' | 'file' | 'video'): void {
    this.showAttachMenu = false;
    if (kind === 'image') this.imageInput?.nativeElement.click();
    else if (kind === 'video') this.videoInput?.nativeElement.click();
    else this.fileInput?.nativeElement.click();
    this.cdr.detectChanges();
  }

  showSuccess(message: string): void {
    this.successMessage = message;
    if (this.successTimer) clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => {
      this.successMessage = '';
      this.cdr.detectChanges();
    }, 2600);
  }

  sendMessage(): void {
    if (!this.activeConversation || this.isSending) return;
    if (this.selectedFile) {
      this.confirmSendFile();
      return;
    }
    if (this.editingMessage) {
      this.saveEdit();
      return;
    }
    const text = this.draft.trim();
    if (!text) return;
    this.isSending = true;
    const convId = this.activeConversation.id;
    const replyId = this.replyToMessage?.id ?? null;
    const temp = this.buildTempMessage(convId, text, 'text', replyId);
    this.internalChat.pushOptimistic(convId, temp);
    this.draft = '';
    this.replyToMessage = null;
    this.resetDraftHeight();
    this.internalChat.sendText(convId, text, replyId).subscribe(res => {
      this.isSending = false;
      if (res?.id) {
        this.internalChat.replaceOptimistic(convId, temp.id, res);
      } else {
        this.internalChat.removeOptimistic(convId, temp.id);
        this.errorMessage = 'No se pudo enviar el mensaje.';
      }
      this.cdr.detectChanges();
    });
  }

  onFileSelected(event: Event, kind: 'image' | 'file' | 'video'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.setSelectedFile(file, kind);
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
      this.errorMessage = 'El archivo supera el limite de 64 MB.';
      return;
    }
    this.setSelectedFile(file, 'image');
  }

  private setSelectedFile(file: File, kind: 'image' | 'audio' | 'file' | 'video'): void {
    if (kind === 'file') {
      const normalized = this.normalizeAudioFile(file);
      if (this.normalizeMimeType(normalized.type).startsWith('audio/')) {
        this.selectedFile = normalized;
        this.selectedFileKind = 'audio';
        this.selectedFilePreviewUrl = URL.createObjectURL(normalized);
        this.errorMessage = '';
        this.cdr.detectChanges();
        return;
      }
      file = normalized;
    }
    this.selectedFile = file;
    this.selectedFileKind = kind === 'video' ? 'file' : kind;
    this.selectedFilePreviewUrl = kind === 'image' || kind === 'audio' ? URL.createObjectURL(file) : '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  confirmSendFile(): void {
    if (!this.activeConversation || !this.selectedFile || this.isSending) return;
    this.isSending = true;
    const convId = this.activeConversation.id;
    const replyId = this.replyToMessage?.id ?? null;
    const file = this.selectedFile;
    const previewUrl = this.selectedFilePreviewUrl;
    const kind = this.selectedFileKind ?? 'file';
    const caption = kind === 'audio' ? '' : this.draft.trim();
    const type: InternalMessageType = kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'file';
    const temp = this.buildTempMessage(convId, caption, type, replyId);
    temp.mediaName = file.name;
    temp.mediaSize = file.size;
    if (kind === 'image') temp.mediaUrl = previewUrl || null;
    this.internalChat.pushOptimistic(convId, temp);
    this.clearSelectedFile();
    this.draft = '';
    this.replyToMessage = null;
    this.resetDraftHeight();
    this.internalChat.sendMedia(convId, file, caption, replyId).subscribe(res => {
      this.isSending = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (res?.id) {
        this.internalChat.replaceOptimistic(convId, temp.id, res);
      } else {
        this.internalChat.removeOptimistic(convId, temp.id);
        this.errorMessage = 'No se pudo enviar el archivo.';
      }
      this.cdr.detectChanges();
    });
  }

  clearSelectedFile(): void {
    if (this.selectedFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedFilePreviewUrl);
    }
    this.selectedFile = null;
    this.selectedFileKind = null;
    this.selectedFilePreviewUrl = '';
    this.selectedAudioDuration = 0;
  }

  onVoiceFileReady(result: VoiceRecordingResult): void {
    if (this.isSending) return;
    this.setSelectedFile(result.file, 'audio');
    this.selectedAudioDuration = result.duration;
    this.confirmSendFile();
  }

  onVoiceError(message: string): void {
    this.errorMessage = message;
    this.cdr.detectChanges();
  }

  formatRecordingTime(seconds: number): string {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  messageOwn(msg: InternalMessage): boolean {
    return msg.senderId === this.currentUserId;
  }

  senderAvatar(msg: InternalMessage): string {
    const member = this.activeConversation?.members.find(m => m.id === msg.senderId);
    if (member?.profilePhotoUrl) return member.profilePhotoUrl;
    const advisor = this.advisors.find(a => a.id === msg.senderId);
    return advisor?.profilePhotoUrl || '';
  }

  senderInitial(msg: InternalMessage): string {
    const name = msg.senderName || 'A';
    return name.charAt(0).toUpperCase();
  }

  messageTime(msg: InternalMessage): string {
    return formatBogotaTime(new Date(msg.createdAt));
  }

  mediaLabel(msg: InternalMessage): string {
    if (msg.type === 'image') return 'Imagen';
    if (msg.type === 'audio') return 'Audio';
    if (msg.type === 'file' && this.isVideoMessage(msg)) return 'Video';
    if (msg.type === 'file') return 'Archivo';
    return msg.body || 'Mensaje';
  }

  isVideoMessage(msg: InternalMessage): boolean {
    return (msg.mediaMimeType || '').toLowerCase().startsWith('video/');
  }

  isAudioMessage(msg: InternalMessage): boolean {
    return (msg.mediaMimeType || '').toLowerCase().startsWith('audio/');
  }

  private extensionFromName(name = ''): string {
    const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
    return match?.[0] ?? '';
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

  private normalizeMimeType(value = ''): string {
    return value.toLowerCase().split(';')[0].trim();
  }

  private normalizeAudioFile(file: File): File {
    const audioMime = this.audioMimeFromExtension(file.name);
    if (!audioMime || this.normalizeMimeType(file.type) === audioMime) return file;
    return new File([file], file.name, { type: audioMime });
  }

  formatFileSize(size: number | null): string {
    if (!size) return '';
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  groupedMessages(list: InternalMessage[]): { label: string; messages: InternalMessage[] }[] {
    const groups: { label: string; messages: InternalMessage[] }[] = [];
    let currentLabel = '';
    let current: InternalMessage[] = [];
    for (const msg of list) {
      const label = this.dateLabel(new Date(msg.createdAt));
      if (label !== currentLabel) {
        if (current.length) groups.push({ label: currentLabel, messages: current });
        currentLabel = label;
        current = [];
      }
      current.push(msg);
    }
    if (current.length) groups.push({ label: currentLabel, messages: current });
    return groups;
  }

  private dateLabel(date: Date): string {
    const iso = date.toISOString();
    if (isTodayBogota(iso)) return 'Hoy';
    if (isYesterdayBogota(iso)) return 'Ayer';
    return fmtDateMedium(date);
  }

  private resetDraftHeight(): void {
    if (this.draftArea) this.draftArea.nativeElement.style.height = 'auto';
  }

  private buildTempMessage(
    conversationId: string,
    body: string,
    type: InternalMessageType,
    replyId: string | null,
  ): InternalMessage {
    return {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: this.currentUserId,
      senderName: this.currentUserName || 'Tú',
      senderRole: this.currentUserRole,
      body,
      type,
      mediaUrl: null,
      mediaMimeType: null,
      mediaName: null,
      mediaSize: null,
      durationMs: null,
      mediaWidth: null,
      mediaHeight: null,
      editedAt: null,
      deletedAt: null,
      replyToMessageId: replyId,
      isForwarded: false,
      reactionToMessageId: null,
      reactionEmoji: null,
      reactions: [],
      createdAt: new Date(),
      pending: true,
    };
  }

  onTextInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  quotePreview(msg: InternalMessage): string {
    const target = this.messages.find(m => m.id === msg.replyToMessageId);
    if (!target) return 'Mensaje original';
    if (target.deletedAt) return 'Mensaje eliminado';
    return `${target.senderName}: ${this.replyPreview(target)}`;
  }

  scrollToMessage(messageId: string): void {
    if (!messageId) return;
    const container = this.messagesContainer?.nativeElement as HTMLElement | undefined;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('ic-highlight');
    void el.offsetWidth;
    el.classList.add('ic-highlight');
    setTimeout(() => el.classList.remove('ic-highlight'), 1800);
  }

  reactionNames(msg: InternalMessage): string {
    const mine = msg.reactions.some(r => r.userId === this.currentUserId);
    const names = msg.reactions.slice(0, 3).map(r => (r.userId === this.currentUserId ? 'Tú' : r.name));
    if (msg.reactions.length > 3) names.push(`+${msg.reactions.length - 3}`);
    return names.join(', ');
  }

  myReaction(msg: InternalMessage): string {
    const mine = msg.reactions.find(r => r.userId === this.currentUserId);
    return mine?.emoji || '';
  }

  canEdit(msg: InternalMessage): boolean {
    if (msg.type === 'system' || msg.deletedAt || !this.messageOwn(msg)) return false;
    return Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000;
  }

  editDisabledReason(msg: InternalMessage): string {
    if (msg.type === 'system') return 'Los mensajes del sistema no se pueden editar';
    if (msg.deletedAt) return 'Los mensajes eliminados no se pueden editar';
    if (!this.messageOwn(msg)) return 'Solo puedes editar tus mensajes';
    const remaining = 15 * 60 * 1000 - (Date.now() - new Date(msg.createdAt).getTime());
    if (remaining <= 0) return 'Solo puedes editar dentro de los primeros 15 minutos';
    const mins = Math.max(1, Math.round(remaining / 60000));
    return `Editable por ${mins} min más`;
  }

  canDelete(msg: InternalMessage): boolean {
    if (msg.type === 'system' || msg.deletedAt) return false;
    return this.messageOwn(msg) || this.currentUserRole === 'admin';
  }

  replyTo(msg: InternalMessage): void {
    if (msg.type === 'system' || msg.deletedAt) return;
    this.replyToMessage = msg;
    this.editingMessage = null;
    this.closeContextMenu();
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  startEdit(msg: InternalMessage): void {
    if (!this.canEdit(msg)) return;
    this.editingMessage = msg;
    this.draft = msg.body || '';
    this.replyToMessage = null;
    this.closeContextMenu();
    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.editingMessage = null;
    this.draft = '';
  }

  saveEdit(): void {
    if (!this.activeConversation || !this.editingMessage || this.isSending) return;
    const text = this.draft.trim();
    if (!text) return;
    const convId = this.activeConversation.id;
    const editingId = this.editingMessage.id;
    this.isSending = true;
    this.internalChat.editMessage(convId, editingId, text).subscribe(res => {
      this.isSending = false;
      if (res?.id) {
        this.cancelEdit();
        setTimeout(() => this.scrollToMessage(editingId), 50);
      } else {
        this.errorMessage = 'No se pudo editar el mensaje.';
      }
      this.cdr.detectChanges();
    });
  }

  deleteMessage(msg: InternalMessage): void {
    if (!this.activeConversation) return;
    this.closeContextMenu();
    this.internalChat.deleteMessage(this.activeConversation.id, msg.id).subscribe();
  }

  openForward(msg: InternalMessage): void {
    if (msg.type === 'system' || msg.deletedAt) return;
    this.forwardSource = msg;
    this.forwardTargetIds = new Set();
    this.forwardSearch = '';
    this.showForwardPicker = true;
    this.closeContextMenu();
  }

  closeForward(): void {
    this.showForwardPicker = false;
    this.forwardSource = null;
    this.forwardTargetIds = new Set();
    this.forwardSearch = '';
  }

  get filteredForwardConversations(): InternalConversation[] {
    const q = this.forwardSearch.trim().toLowerCase();
    const list = this.conversations.filter(c => c.id !== this.activeConversation?.id);
    if (!q) return list;
    return list.filter(c => this.conversationName(c).toLowerCase().includes(q));
  }

  toggleForwardTarget(conversationId: string): void {
    if (conversationId === this.activeConversation?.id) return;
    const next = new Set(this.forwardTargetIds);
    if (next.has(conversationId)) next.delete(conversationId);
    else next.add(conversationId);
    this.forwardTargetIds = next;
    this.cdr.detectChanges();
  }

  confirmForward(): void {
    if (!this.activeConversation || !this.forwardSource || this.forwardTargetIds.size === 0) return;
    const sourceId = this.activeConversation.id;
    const messageId = this.forwardSource.id;
    const ids = [...this.forwardTargetIds];
    let completed = 0;
    for (const targetId of ids) {
      this.internalChat.forwardMessage(sourceId, messageId, targetId).subscribe(() => {
        completed += 1;
        if (completed === ids.length) {
          this.closeForward();
          this.showSuccess(`Reenviado a ${ids.length} chat${ids.length === 1 ? '' : 's'}`);
          this.cdr.detectChanges();
        }
      });
    }
  }

  reactToMessage(msg: InternalMessage, emoji: string): void {
    if (!this.activeConversation) return;
    const mine = this.myReaction(msg);
    const next = mine === emoji ? '' : emoji;
    this.internalChat.reactToMessage(this.activeConversation.id, msg.id, next || emoji).subscribe();
    this.showReactionsForId = null;
  }

  toggleReactions(msg: InternalMessage): void {
    this.showReactionsForId = this.showReactionsForId === msg.id ? null : msg.id;
  }

  onContextMenu(event: MouseEvent, msg: InternalMessage): void {
    event.preventDefault();
    if (msg.type === 'system' || msg.deletedAt) return;
    this.contextMenu = { message: msg, x: event.clientX, y: event.clientY };
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.clampContextMenu());
  }

  copyMessageText(msg: InternalMessage): void {
    const text = (msg.body || '').trim();
    if (!text) return;
    navigator.clipboard.writeText(text);
    this.closeContextMenu();
    this.showSuccess('Mensaje copiado');
  }

  onBubbleTouchStart(event: TouchEvent, msg: InternalMessage): void {
    if (event.touches.length !== 1) return;
    if (msg.type === 'system' || msg.deletedAt) return;
    this.longPressMsgId = msg.id;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      const touch = event.touches[0];
      this.contextMenu = { message: msg, x: touch.clientX, y: touch.clientY };
      this.cdr.detectChanges();
      requestAnimationFrame(() => this.clampContextMenu());
    }, 500);
  }

  onBubbleTouchEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressMsgId = '';
  }

  onBubbleTouchMove(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private clampContextMenu(): void {
    const menu = this.icContext?.nativeElement;
    if (!menu || !this.contextMenu) return;
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let { x, y } = this.contextMenu;
    if (rect.right > window.innerWidth - margin) x -= rect.right - window.innerWidth + margin;
    if (rect.bottom > window.innerHeight - margin) y -= rect.bottom - window.innerHeight + margin;
    x = Math.max(margin, x);
    y = Math.max(margin, y);
    if (x !== this.contextMenu.x || y !== this.contextMenu.y) {
      this.contextMenu = { ...this.contextMenu, x, y };
      this.cdr.detectChanges();
    }
  }

  closeContextMenu(): void {
    this.contextMenu = null;
    this.showReactionsForId = null;
  }

  openImage(msg: InternalMessage): void {
    if (!msg.mediaUrl) return;
    this.imagePreviewUrl = msg.mediaUrl;
    this.imagePreviewName = msg.mediaName || 'Imagen';
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
    this.isMediaDragging = false;
  }

  closeImage(): void {
    this.imagePreviewUrl = null;
    this.imagePreviewName = '';
    this.mediaZoom = 1;
    this.mediaPanX = 0;
    this.mediaPanY = 0;
    this.isMediaDragging = false;
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.imagePreviewUrl) this.closeImage();
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

  @HostListener('window:click')
  onWindowClick(): void {
    if (this.contextMenu) this.closeContextMenu();
    if (this.showAttachMenu) this.showAttachMenu = false;
  }

  ngOnDestroy(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.subs.unsubscribe();
    this.internalChat.setActiveConversation(null);
  }
}
