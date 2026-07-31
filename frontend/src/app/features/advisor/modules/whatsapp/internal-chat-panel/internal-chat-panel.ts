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
import { AuthService } from '../../../../../core/services/auth.service';
import { ThemeService } from '../../../../../core/services/theme.service';
import { InternalChatService } from '../../../../../core/services/internal-chat.service';
import {
  InternalChatUser,
  InternalConversation,
  InternalMessage,
} from '../../../../../core/models/internal-chat.models';
import { trackByIndex } from '../../../../../shared/utils/track-by';
import { scrollToBottom as scrollToBottomEl } from '../../../../../shared/utils/scroll';
import { formatBogotaTime } from '../../../../../shared/utils/date';

type SelectedFileKind = 'image' | 'audio' | 'file' | null;

interface ContextMenuState {
  message: InternalMessage;
  x: number;
  y: number;
}

@Component({
  selector: 'app-internal-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, WaIconComponent],
  templateUrl: './internal-chat-panel.html',
  styleUrl: './internal-chat-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InternalChatPanelComponent implements OnInit, AfterViewChecked, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly reactionEmojis = ['👍', '✅', '❌'];

  @Output() activeChange = new EventEmitter<boolean>();

  @ViewChild('icMessages') messagesContainer!: ElementRef;

  conversations: InternalConversation[] = [];
  activeConversation: InternalConversation | null = null;
  messages: InternalMessage[] = [];
  advisors: InternalChatUser[] = [];
  currentUserId = '';
  currentUserRole = '';

  searchQuery = '';
  showNewChat = false;
  newChatSearch = '';

  draft = '';
  isSending = false;

  replyToMessage: InternalMessage | null = null;
  editingMessage: InternalMessage | null = null;
  editingText = '';

  selectedFile: File | null = null;
  selectedFileKind: SelectedFileKind = null;
  selectedFilePreviewUrl = '';
  selectedAudioDuration = 0;

  isRecordingAudio = false;
  recordingSeconds = 0;
  private mediaRecorder?: MediaRecorder;
  private recordingChunks: Blob[] = [];
  private recordingTimer?: ReturnType<typeof setInterval>;

  contextMenu: ContextMenuState | null = null;
  showReactionsForId: string | null = null;

  showForwardPicker = false;
  forwardSource: InternalMessage | null = null;
  forwardTargetId: string | null = null;

  imagePreviewUrl: string | null = null;
  imagePreviewName = '';

  errorMessage = '';

  private subs = new Subscription();
  private shouldScroll = false;

  constructor(
    private readonly internalChat: InternalChatService,
    private readonly authService: AuthService,
    private readonly themeService: ThemeService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.currentUserId = user?.id || '';
    this.currentUserRole = user?.role || '';

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
        this.shouldScroll = true;
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
    this.internalChat.loadConversations().subscribe();
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScroll || !this.messagesContainer) return;
    this.shouldScroll = false;
    scrollToBottomEl(this.messagesContainer.nativeElement);
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
    if (last.type === 'image') return 'Imagen';
    if (last.type === 'audio') return 'Audio';
    if (last.type === 'file') return 'Archivo';
    const body = (last.body || '').trim();
    return body || 'Mensaje';
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
    this.internalChat.setActiveConversation(conv.id);
    this.internalChat.loadMessages(conv.id).subscribe();
    this.cdr.detectChanges();
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

  sendMessage(): void {
    if (!this.activeConversation || this.isSending) return;
    if (this.editingMessage) {
      this.saveEdit();
      return;
    }
    const text = this.draft.trim();
    if (!text) return;
    this.isSending = true;
    this.internalChat.sendText(this.activeConversation.id, text, this.replyToMessage?.id).subscribe(() => {
      this.isSending = false;
      this.draft = '';
      this.replyToMessage = null;
      this.shouldScroll = true;
      this.cdr.detectChanges();
    });
  }

  onFileSelected(event: Event, kind: 'image' | 'file'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.setSelectedFile(file, kind);
  }

  private setSelectedFile(file: File, kind: 'image' | 'audio' | 'file'): void {
    this.selectedFile = file;
    this.selectedFileKind = kind;
    this.selectedFilePreviewUrl = kind === 'image' ? URL.createObjectURL(file) : '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  confirmSendFile(): void {
    if (!this.activeConversation || !this.selectedFile || this.isSending) return;
    this.isSending = true;
    this.internalChat.sendMedia(
      this.activeConversation.id,
      this.selectedFile,
      '',
      this.replyToMessage?.id,
    ).subscribe(() => {
      this.isSending = false;
      this.clearSelectedFile();
      this.replyToMessage = null;
      this.shouldScroll = true;
      this.cdr.detectChanges();
    });
  }

  clearSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileKind = null;
    this.selectedFilePreviewUrl = '';
    this.selectedAudioDuration = 0;
  }

  async toggleAudioRecording(): Promise<void> {
    if (this.isRecordingAudio) {
      this.mediaRecorder?.stop();
      return;
    }
    if (this.isSending) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.errorMessage = 'Este navegador no permite grabar audio.';
      this.cdr.detectChanges();
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
          this.errorMessage = 'No se pudo capturar audio.';
          this.cdr.detectChanges();
          return;
        }
        const file = new File(
          [blob],
          `nota-voz-${Date.now()}${this.extensionForMime(type)}`,
          { type },
        );
        this.selectedAudioDuration = duration;
        this.setSelectedFile(file, 'audio');
      };

      this.mediaRecorder.start(250);
      this.isRecordingAudio = true;
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds += 1;
        this.cdr.detectChanges();
      }, 1000);
    } catch {
      this.errorMessage = 'No se pudo acceder al microfono.';
      this.isRecordingAudio = false;
      this.stopRecordingTimer();
      this.cdr.detectChanges();
    }
  }

  private pickRecordingMimeType(): string {
    const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return options.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  private normalizeMimeType(mimeType = ''): string {
    return mimeType.toLowerCase().split(';')[0].trim();
  }

  private extensionForMime(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/aac': '.aac',
    };
    return map[this.normalizeMimeType(mimeType)] || '.webm';
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    this.recordingTimer = undefined;
  }

  formatRecordingTime(seconds: number): string {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  messageOwn(msg: InternalMessage): boolean {
    return msg.senderId === this.currentUserId;
  }

  messageTime(msg: InternalMessage): string {
    return formatBogotaTime(new Date(msg.createdAt));
  }

  mediaLabel(msg: InternalMessage): string {
    if (msg.type === 'image') return 'Imagen';
    if (msg.type === 'audio') return 'Audio';
    if (msg.type === 'file') return 'Archivo';
    return msg.body || 'Mensaje';
  }

  formatFileSize(size: number | null): string {
    if (!size) return '';
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  quotePreview(msg: InternalMessage): string {
    const target = this.messages.find(m => m.id === msg.replyToMessageId);
    if (!target) return 'Mensaje original';
    return `${target.senderName}: ${target.body || this.mediaLabel(target)}`;
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
    this.editingText = msg.body || '';
    this.replyToMessage = null;
    this.closeContextMenu();
  }

  cancelEdit(): void {
    this.editingMessage = null;
    this.editingText = '';
  }

  saveEdit(): void {
    if (!this.activeConversation || !this.editingMessage) return;
    const text = this.editingText.trim();
    if (!text) return;
    this.internalChat.editMessage(
      this.activeConversation.id,
      this.editingMessage.id,
      text,
    ).subscribe(() => {
      this.cancelEdit();
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
    this.showForwardPicker = true;
    this.forwardTargetId = null;
    this.closeContextMenu();
  }

  closeForward(): void {
    this.showForwardPicker = false;
    this.forwardSource = null;
    this.forwardTargetId = null;
  }

  confirmForward(): void {
    if (!this.activeConversation || !this.forwardSource || !this.forwardTargetId) return;
    const target = this.conversations.find(c => c.id === this.forwardTargetId);
    if (target && target.id === this.activeConversation.id) {
      this.errorMessage = 'Elige una conversación diferente para reenviar.';
      this.cdr.detectChanges();
      return;
    }
    this.internalChat.forwardMessage(
      this.activeConversation.id,
      this.forwardSource.id,
      this.forwardTargetId,
    ).subscribe(() => {
      this.closeForward();
      this.cdr.detectChanges();
    });
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
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.stopRecordingTimer();
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}
