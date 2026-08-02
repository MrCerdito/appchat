import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  protected readonly reactionEmojis = ['👍', '✅', '❌'];

  @Output() activeChange = new EventEmitter<boolean>();

  @ViewChild('icMessages') messagesContainer!: ElementRef;
  @ViewChild('draftArea') draftArea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('icContext') icContext?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput?: ElementRef<HTMLInputElement>;

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

  imagePreviewUrl: string | null = null;
  imagePreviewName = '';

  errorMessage = '';
  showAttachMenu = false;
  successMessage = '';

  private successTimer: ReturnType<typeof setTimeout> | null = null;
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
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.currentUserId = user?.id || '';
    this.currentUserName = user?.name || '';
    this.currentUserRole = user?.role || '';
    this.advisorPhotoUrl = user?.profilePhotoUrl || '';

    this.internalChat.setCurrentUser(this.currentUserId);
    this.internalChat.connect();

    this.subs.add(
      this.internalChat.getConversationsStream().subscribe(list => {
        this.conversations = list;
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

  previewText(conv: InternalConversation): string {
    const last = conv.lastMessage;
    if (!last) return 'Sin mensajes todavía';
    if (last.deleted) return 'Mensaje eliminado';
    let preview = '';
    if (last.type === 'image') preview = 'Imagen';
    else if (last.type === 'audio') preview = 'Audio';
    else if (last.type === 'file') preview = 'Archivo';
    else preview = (last.body || '').trim() || 'Mensaje';
    if (last.senderName === this.currentUserName) return `Tú: ${preview}`;
    return preview;
  }

  chatSubtitle(): string {
    const c = this.activeConversation;
    if (!c) return '';
    if (c.type === 'group') return `${c.members.length} participantes`;
    const other = c.members.find(m => m.id !== this.currentUserId);
    if (other) return other.role === 'admin' ? 'Administrador' : 'Asesor';
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

  private setSelectedFile(file: File, kind: 'image' | 'audio' | 'file' | 'video'): void {
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
    const type: InternalMessageType = kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'file';
    const temp = this.buildTempMessage(convId, '', type, replyId);
    temp.mediaName = file.name;
    temp.mediaSize = file.size;
    if (kind === 'image') temp.mediaUrl = previewUrl || null;
    this.internalChat.pushOptimistic(convId, temp);
    this.clearSelectedFile();
    this.replyToMessage = null;
    this.internalChat.sendMedia(convId, file, '', replyId).subscribe(res => {
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
    return member?.profilePhotoUrl || '';
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
  }

  closeImage(): void {
    this.imagePreviewUrl = null;
    this.imagePreviewName = '';
  }

  @HostListener('window:click')
  onWindowClick(): void {
    if (this.contextMenu) this.closeContextMenu();
    if (this.showAttachMenu) this.showAttachMenu = false;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.internalChat.setActiveConversation(null);
  }
}
