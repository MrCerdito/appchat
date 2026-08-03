import { Component, ChangeDetectionStrategy, ChangeDetectorRef, HostListener, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { InternalChatService } from '../../../../../../core/services/internal-chat.service';
import { WaChat, WaMessage } from '../../../../../../core/models/whatsapp.models';
import { InternalConversation } from '../../../../../../core/models/internal-chat.models';
import { InternalChatPanelComponent } from '../../../../../../features/advisor/modules/whatsapp/internal-chat-panel/internal-chat-panel';
import { VoiceRecorderComponent, VoiceRecordingResult } from '../../../../../../shared/components/voice-recorder/voice-recorder.component';
import { VoicePlayerComponent } from '../../../../../../shared/components/voice-player/voice-player.component';
import { getInitials, getAvatarColor } from '../../../../../../shared/utils/avatar';
import { scrollToBottom } from '../../../../../../shared/utils/scroll';

interface Contacto {
  id: string;
  nombre: string;
  telefono: string;
  iniciales: string;
  color: string;
  ultimo: string;
  hora: string;
  noLeidos: number;
  online: boolean;
  ultimaVez: string;
  isGroup?: boolean;
}

interface Mensaje {
  id: string;
  texto: string;
  tipo: 'enviado' | 'recibido';
  hora: string;
  leido: boolean;
  fecha: string;
  senderName?: string;
  type?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  failed?: boolean;
  metaMessageId?: string;
  isAuto?: boolean;
  replyToMessageId?: string;
  quotedBody?: string;
  quotedSender?: string;
  editedAt?: Date | string;
  isForwarded?: boolean;
  reactionToMessageId?: string;
  reactionByName?: string;
  reactionRemoved?: boolean;
}

@Component({
  selector: 'app-operaciones-chats',
  standalone: true,
  imports: [CommonModule, FormsModule, InternalChatPanelComponent, VoiceRecorderComponent, VoicePlayerComponent],
  templateUrl: './operaciones-chats.html',
  styleUrl: './operaciones-chats.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesChatsComponent implements OnInit, OnDestroy {
  @ViewChild('messageFeed') messageFeed?: ElementRef<HTMLElement>;
  @ViewChild(InternalChatPanelComponent) internalPanel?: InternalChatPanelComponent;
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('docInput') docInput?: ElementRef<HTMLInputElement>;

  modo: 'clientes' | 'asesores' = 'clientes';
  selectedChatId: string | null = null;
  busqueda = '';
  nuevoMensaje = '';
  loadingProgress = 0;
  internalUnreadTotal = 0;

  selectedFile?: File;
  selectedFilePreviewUrl = '';
  selectedFileKind: 'image' | 'video' | 'audio' | 'document' = 'document';
  selectedAudioDuration = 0;
  isSending = false;
  showAttachMenu = false;
  sendError = '';
  isRecordingAudio = false;
  mediaPreview?: { src: string; name: string };

  messageMenu?: { x: number; y: number; message: Mensaje; side: 'left' | 'right' };
  replyingTo: Mensaje | null = null;
  forwardingMessage: Mensaje | null = null;
  showForwardPicker = false;
  forwardTargetIds = new Set<string>();
  forwardSearch = '';
  isForwarding = false;
  editingMessageId = '';
  editingMessageText = '';
  showReactionsForId: string | null = null;
  actionToast = '';
  readonly reactionEmojis = ['👍', '✅', '❌'];
  readonly editWindowMs = 15 * 60_000;
  readonly deleteWindowMs = 60 * 60 * 60_000;

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressMsgId = '';

  private chatsMap = new Map<string, WaChat>();
  private messagesMap = new Map<string, WaMessage[]>();
  private subs: Subscription[] = [];
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private dataReady = false;

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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private whatsappChat: WhatsappChatService,
    private internalChat: InternalChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('window:click')
  onWindowClick(): void {
    this.closeMessageMenu();
    this.showReactionsForId = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editingMessageId) {
      this.cancelEditMessage();
      return;
    }
    if (this.replyingTo) {
      this.cancelReply();
      return;
    }
    if (this.showForwardPicker) {
      this.closeForward();
      return;
    }
    if (this.messageMenu) {
      this.closeMessageMenu();
    }
  }

  ngOnInit(): void {
    this.dataReady = false;
    this.startLoadingProgress();

    this.internalChat.connect();

    this.subs.push(
      this.internalChat.getUnreadTotalStream().subscribe({
        next: total => {
          this.internalUnreadTotal = total;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('HTTP Error:', err),
      }),
    );

    this.whatsappChat.loadChats().subscribe();

    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(chats => {
        for (const chat of chats) {
          this.chatsMap.set(chat.id, chat);
        }
        if (this.selectedChatId && this.chatsMap.has(this.selectedChatId)) {
          this.whatsappChat.loadMessages(this.selectedChatId, 1, 100).subscribe({
            next: (messages) => {
              this.messagesMap.set(this.selectedChatId!, messages);
              this.dataReady = true;
              this.cdr.markForCheck();
              setTimeout(() => this.scrollToBottom(), 100);
            },
            error: (err) => console.error('HTTP Error:', err),
          });
        } else {
          this.dataReady = true;
        }
        this.cdr.markForCheck();
      }),
    );

    this.route.queryParams.subscribe({
      next: (params) => {
        if (params['modo'] === 'asesores') {
          this.modo = 'asesores';
        }
        if (params['chatId']) {
          this.selectedChatId = params['chatId'];
          if (this.chatsMap.has(params['chatId'])) {
            this.seleccionarChat(params['chatId']);
          } else {
            this.loadChatMessages(params['chatId'], true);
          }
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    this.subs.push(
      this.whatsappChat.onNewMessage().subscribe(data => {
        if (data.chatId === this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId, true);
        }
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.whatsappChat.onChatUpdated().subscribe(() => {
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      interval(15_000).subscribe(() => {
    this.whatsappChat.loadChats().subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
      }),
    );
  }

  private loadChatMessages(chatId: string, silent = false): void {
    if (!silent) {
      this.dataReady = false;
      this.startLoadingProgress();
    }
    this.whatsappChat.loadMessages(chatId, 1, 100).subscribe({
      next: (messages) => {
        this.messagesMap.set(chatId, messages);
        this.dataReady = true;
        this.cdr.markForCheck();
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  private scrollToBottom(): void {
    try {
      if (this.messageFeed?.nativeElement) {
        scrollToBottom(this.messageFeed.nativeElement);
      }
    } catch {}
  }

  get chatList(): Contacto[] {
    return Array.from(this.chatsMap.values()).map(chat => this.mapToContacto(chat));
  }

  get chatsFiltrados(): Contacto[] {
    if (!this.busqueda.trim()) return this.chatList;
    const q = this.busqueda.trim().toLowerCase();
    return this.chatList.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.telefono.includes(q) ||
      c.ultimo.toLowerCase().includes(q),
    );
  }

  get chatSeleccionado(): Contacto | null {
    if (!this.selectedChatId) return null;
    const chat = this.chatsMap.get(this.selectedChatId);
    return chat ? this.mapToContacto(chat) : null;
  }

  get mensajesActuales(): Mensaje[] {
    const messages = this.messagesMap.get(this.selectedChatId ?? '') ?? [];
    return messages
      .filter(m => !this.isReactionMessage(m))
      .map(m => this.mapToMensaje(m));
  }

  get mensajesAgrupados(): { fecha: string; mensajes: Mensaje[] }[] {
    const grupos: Record<string, Mensaje[]> = {};
    for (const m of this.mensajesActuales) {
      if (!grupos[m.fecha]) grupos[m.fecha] = [];
      grupos[m.fecha].push(m);
    }
    return Object.entries(grupos).map(([fecha, mensajes]) => ({ fecha, mensajes }));
  }

  private mapToContacto(chat: WaChat): Contacto {
    return {
      id: chat.id,
      nombre: chat.name,
      telefono: chat.phone,
      iniciales: this.getInitials(chat.name),
      color: this.getAvatarColor(chat.name),
      ultimo: chat.preview || '—',
      hora: chat.time || '',
      noLeidos: chat.unread || 0,
      online: chat.status === 'online',
      ultimaVez: chat.status === 'online' ? 'en línea' : (chat.time ? `últ. vez ${chat.time}` : ''),
      isGroup: chat.isGroup,
    };
  }

  private mapToMensaje(msg: WaMessage): Mensaje {
    const d = new Date(msg.timestamp);
    return {
      id: msg.id,
      texto: msg.body || '',
      tipo: msg.fromMe ? 'enviado' : 'recibido',
      hora: this.formatTime(d),
      leido: msg.status === 'read' || msg.status === 'delivered',
      fecha: this.formatDate(d),
      senderName: msg.senderName || (msg.fromMe ? 'Admin' : undefined),
      type: msg.type,
      mediaUrl: msg.mediaUrl,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      mimeType: msg.mimeType,
      failed: msg.status === 'failed',
      metaMessageId: msg.metaMessageId,
      isAuto: msg.isAuto,
      replyToMessageId: msg.replyToMessageId,
      quotedBody: msg.quotedBody,
      quotedSender: msg.quotedSender,
      editedAt: msg.editedAt,
      isForwarded: msg.isForwarded,
      reactionToMessageId: msg.reactionToMessageId,
      reactionByName: msg.reactionByName,
      reactionRemoved: msg.reactionRemoved,
    };
  }

  private getInitials = getInitials;
  private getAvatarColor = getAvatarColor;

  private tz = 'America/Bogota';

  private formatTime(date: Date): string {
    const b = new Date(date.getTime() - 5 * 3600000);
    const hh = String(b.getUTCHours()).padStart(2, '0');
    const mm = String(b.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatDate(date: Date): string {
    const bogoKey = (d: Date) => {
      const b = new Date(d.getTime() - 5 * 3600000);
      return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`;
    };
    const today = bogoKey(new Date());
    const msg = bogoKey(date);
    if (msg === today) return 'Hoy';

    const [y, m, d] = today.split('-').map(Number);
    let yd = d - 1, ym = m, yy = y;
    if (yd === 0) {
      ym--;
      if (ym === 0) { yy--; ym = 12; }
      yd = new Date(yy, ym, 0).getDate();
    }
    const yesterday = `${yy}-${String(ym).padStart(2, '0')}-${String(yd).padStart(2, '0')}`;
    if (msg === yesterday) return 'Ayer';

    const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    const b = new Date(date.getTime() - 5 * 3600000);
    return `${b.getUTCDate()} ${months[b.getUTCMonth()]}`;
  }

  seleccionarChat(id: string): void {
    this.selectedChatId = id;
    this.loadChatMessages(id, true);
    this.whatsappChat.markRead(id).subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  setModo(mode: 'clientes' | 'asesores'): void {
    if (this.modo === mode) return;
    this.modo = mode;
    if (mode === 'asesores') {
      this.selectedChatId = null;
    }
    this.cdr.markForCheck();
  }

  // ── Internal chat (asesores) delegates ──────────────────────────────────
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

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  enviarMensaje(): void {
    if (this.selectedFile) {
      this.enviarMedia();
      return;
    }
    const texto = this.nuevoMensaje.trim();
    if (!texto || !this.selectedChatId) return;
    const chat = this.chatsMap.get(this.selectedChatId);
    if (!chat) return;

    const reply = this.replyingTo;
    this.nuevoMensaje = '';
    this.replyingTo = null;
    this.cdr.markForCheck();

    if (reply) {
      const to = reply.metaMessageId || reply.id;
      this.whatsappChat.replyToMessage(this.selectedChatId, to, texto).subscribe({
        next: (res) => {
          if (res.ok && this.selectedChatId) {
            this.loadChatMessages(this.selectedChatId, true);
          }
          this.cdr.markForCheck();
        },
        error: (err) => console.error('HTTP Error:', err),
      });
      return;
    }

    const to = chat.jid || chat.phone;
    this.whatsappChat.sendMessage(to, texto).subscribe({
      next: (res) => {
        if (res.ok && this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId, true);
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  // ── Media (adjuntar / enviar) ───────────────────────────────────────────
  toggleAttachMenu(): void {
    if (this.isSending || this.isRecordingAudio) return;
    this.showAttachMenu = !this.showAttachMenu;
    this.cdr.markForCheck();
  }

  selectAttach(kind: 'image' | 'file' | 'video'): void {
    this.showAttachMenu = false;
    const input = kind === 'image' ? this.imageInput : kind === 'video' ? this.videoInput : this.fileInput;
    input?.nativeElement.click();
    this.cdr.markForCheck();
  }

  onFileSelected(event: Event, kind: 'image' | 'file' | 'video'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 64 * 1024 * 1024) {
      this.sendError = 'El archivo supera el limite de 64 MB.';
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    if (!this.isAllowedUpload(file)) {
      this.sendError = 'Tipo de archivo no permitido para WhatsApp.';
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    this.clearSelectedFile(false);
    this.selectedFile = file;
    this.selectedFileKind = this.fileKind(file);
    this.selectedFilePreviewUrl = URL.createObjectURL(file);
    this.sendError = '';
    this.cdr.markForCheck();
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

  private enviarMedia(): void {
    const file = this.selectedFile;
    const chat = this.chatsMap.get(this.selectedChatId ?? '');
    if (!file || !chat || this.isSending) return;

    const to = chat.jid || chat.phone;
    const caption = this.nuevoMensaje.trim();
    const kind = this.selectedFileKind;
    const now = new Date();
    const fallback = this.mediaFallbackLabel(kind);
    const optimistic: WaMessage = {
      id: `tmp-media-${Date.now()}`,
      chatId: chat.id,
      body: caption || fallback,
      fromMe: true,
      timestamp: now,
      status: 'sent',
      isAuto: false,
      type: kind,
      mediaUrl: this.selectedFilePreviewUrl || undefined,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    };

    const current = this.messagesMap.get(chat.id) ?? [];
    this.messagesMap.set(chat.id, [...current, optimistic]);
    this.nuevoMensaje = '';
    this.sendError = '';
    this.isSending = true;
    this.cdr.markForCheck();
    setTimeout(() => this.scrollToBottom(), 50);

    this.whatsappChat.sendMedia(to, file, caption, this.selectedAudioDuration).subscribe({
      next: (res) => {
        this.isSending = false;
        if (res.ok && this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId, true);
          this.clearSelectedFile();
          return;
        }
        this.markMediaFailed(optimistic.id);
        this.sendError = (res as any).error || 'No se pudo enviar el archivo.';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSending = false;
        this.markMediaFailed(optimistic.id);
        this.sendError = err?.error?.error || err?.error?.message || 'Error al enviar el archivo.';
        this.clearSelectedFile();
        this.cdr.markForCheck();
      },
    });
  }

  private markMediaFailed(id: string): void {
    const chatId = this.selectedChatId ?? '';
    const list = this.messagesMap.get(chatId);
    if (!list) return;
    const idx = list.findIndex(m => m.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], status: 'failed' };
      this.messagesMap.set(chatId, list);
    }
  }

  // ── Voz ─────────────────────────────────────────────────────────────────
  onVoiceFileReady(result: VoiceRecordingResult): void {
    if (!this.selectedChatId || this.isSending) return;
    this.clearSelectedFile(false);
    this.selectedFile = result.file;
    this.selectedFileKind = 'audio';
    this.selectedFilePreviewUrl = URL.createObjectURL(result.file);
    this.selectedAudioDuration = result.duration;
    this.sendError = '';
    this.enviarMedia();
  }

  onVoiceRecordingChange(recording: boolean): void {
    this.isRecordingAudio = recording;
    this.cdr.markForCheck();
  }

  onVoiceError(message: string): void {
    this.sendError = message;
    this.cdr.markForCheck();
  }

  // ── Helpers de media ────────────────────────────────────────────────────
  mediaUrlFor(message: Mensaje | WaMessage): string {
    return message.mediaUrl || '';
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

  mediaFallbackLabel(kind: 'image' | 'video' | 'audio' | 'document' | string, fileName = ''): string {
    const label = {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    }[kind] ?? 'Archivo';
    return kind === 'document' && fileName ? `${label}: ${fileName}` : label;
  }

  shouldShowMessageBody(msg: Mensaje): boolean {
    if (!msg.type || msg.type === 'text') return true;
    if (!msg.texto) return false;
    if (msg.texto === 'Imagen' || msg.texto === 'Video' || msg.texto === 'Audio' || msg.texto === 'Documento') return false;
    if (msg.fileName && msg.texto.includes(msg.fileName)) return false;
    return true;
  }

  openMediaPreview(msg: Mensaje, event?: Event): void {
    event?.stopPropagation();
    const src = this.mediaUrlFor(msg);
    if (!src) return;
    this.mediaPreview = { src, name: msg.fileName || msg.texto || 'Imagen' };
  }

  closeMediaPreview(): void {
    this.mediaPreview = undefined;
  }

  // ── Menú contextual de mensaje ───────────────────────────────────────────
  openMessageMenu(event: MouseEvent, msg: Mensaje): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isReactionMessage(msg) || msg.id.startsWith('tmp-')) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 198;
    const menuHeight = 220;
    const preferredX = msg.tipo === 'enviado' ? rect.left - menuWidth - 10 : rect.right + 10;
    const fallbackX = msg.tipo === 'enviado' ? rect.right - menuWidth : rect.left;
    const rawX = preferredX < 8 || preferredX + menuWidth > window.innerWidth - 8 ? fallbackX : preferredX;
    const rawY = rect.top + (rect.height / 2) - 28;
    this.messageMenu = {
      x: Math.max(8, Math.min(rawX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(rawY, window.innerHeight - menuHeight - 8)),
      message: msg,
      side: msg.tipo === 'enviado' ? 'right' : 'left',
    };
    this.showReactionsForId = null;
    this.cdr.markForCheck();
  }

  closeMessageMenu(): void {
    this.messageMenu = undefined;
  }

  onBubbleTouchStart(event: TouchEvent, msg: Mensaje): void {
    if (event.touches.length !== 1) return;
    if (this.isReactionMessage(msg) || msg.id.startsWith('tmp-')) return;
    this.longPressMsgId = msg.id;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      const touch = event.touches[0];
      this.messageMenu = {
        x: Math.max(8, Math.min(touch.clientX, window.innerWidth - 210)),
        y: Math.max(8, Math.min(touch.clientY, window.innerHeight - 230)),
        message: msg,
        side: msg.tipo === 'enviado' ? 'right' : 'left',
      };
      this.cdr.markForCheck();
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

  quickReply(msg: Mensaje): void {
    if (msg.type && msg.type !== 'text') return;
    if (this.isReactionMessage(msg)) return;
    this.startReply(msg);
  }

  // ── Responder ────────────────────────────────────────────────────────────
  startReply(msg: Mensaje): void {
    if (this.isReactionMessage(msg)) return;
    this.replyingTo = msg;
    this.messageMenu = undefined;
    this.showForwardPicker = false;
    this.cdr.markForCheck();
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.wa-input-field');
      input?.focus();
    });
  }

  cancelReply(): void {
    this.replyingTo = null;
    this.cdr.markForCheck();
  }

  scrollToMessage(messageId: string): void {
    const el = this.messageFeed?.nativeElement.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('wa-flash');
    setTimeout(() => el.classList.remove('wa-flash'), 1200);
  }

  // ── Copiar ───────────────────────────────────────────────────────────────
  copyMessageText(msg: Mensaje): void {
    const text = (msg.texto || '').trim();
    if (!text) return;
    navigator.clipboard.writeText(text);
    this.messageMenu = undefined;
    this.showToast('Mensaje copiado');
  }

  // ── Reenviar (multi-destino) ─────────────────────────────────────────────
  startForward(msg: Mensaje): void {
    if (this.isReactionMessage(msg)) return;
    this.forwardingMessage = msg;
    this.forwardTargetIds.clear();
    this.forwardSearch = '';
    this.showForwardPicker = true;
    this.messageMenu = undefined;
    this.replyingTo = null;
    this.cdr.markForCheck();
  }

  closeForward(): void {
    this.showForwardPicker = false;
    this.forwardingMessage = null;
    this.forwardTargetIds.clear();
    this.forwardSearch = '';
    this.cdr.markForCheck();
  }

  get filteredForwardChats(): Contacto[] {
    const q = this.forwardSearch.toLowerCase().trim();
    let chats = this.chatList.filter(c => c.id !== this.selectedChatId);
    if (!q) return chats.slice(0, 20);
    return chats
      .filter(c => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q))
      .slice(0, 20);
  }

  toggleForwardTarget(chatId: string): void {
    if (chatId === this.selectedChatId) return;
    if (this.forwardTargetIds.has(chatId)) this.forwardTargetIds.delete(chatId);
    else this.forwardTargetIds.add(chatId);
    this.cdr.markForCheck();
  }

  confirmForward(): void {
    const source = this.forwardingMessage;
    const chatId = this.selectedChatId;
    const ids = [...this.forwardTargetIds];
    if (!source || !chatId || this.isForwarding || !ids.length) return;
    this.isForwarding = true;
    let done = 0;
    for (const targetId of ids) {
      this.whatsappChat.forwardMessage(chatId, source.id, targetId).subscribe({
        next: () => {
          done++;
          if (done === ids.length) this.finishForward(ids.length);
        },
        error: () => {
          done++;
          if (done === ids.length) this.finishForward(ids.length);
        },
      });
    }
  }

  private finishForward(count: number): void {
    this.isForwarding = false;
    this.closeForward();
    this.showToast(`Reenviado a ${count} chat${count === 1 ? '' : 's'}`);
  }

  // ── Editar ───────────────────────────────────────────────────────────────
  canEditMessage(msg: Mensaje): boolean {
    return msg.tipo === 'enviado' &&
      msg.type === 'text' &&
      !msg.isAuto &&
      !msg.id.startsWith('tmp-') &&
      this.isWithinWindow(msg, this.editWindowMs);
  }

  startEditMessage(msg: Mensaje): void {
    if (!this.canEditMessage(msg)) return;
    this.editingMessageId = msg.id;
    this.editingMessageText = msg.texto;
    this.messageMenu = undefined;
    this.cdr.markForCheck();
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.wa-message-edit textarea');
      el?.focus();
      el?.select();
    });
  }

  cancelEditMessage(): void {
    this.editingMessageId = '';
    this.editingMessageText = '';
    this.cdr.markForCheck();
  }

  saveEditedMessage(msg: Mensaje): void {
    if (!this.selectedChatId || !this.canEditMessage(msg)) return;
    const text = this.editingMessageText.trim();
    if (!text || text === msg.texto) {
      this.cancelEditMessage();
      return;
    }
    this.whatsappChat.editMessage(this.selectedChatId, msg.id, text).subscribe({
      next: () => {
        this.cancelEditMessage();
        if (this.selectedChatId) this.loadChatMessages(this.selectedChatId, true);
      },
      error: (err) => {
        this.sendError = err?.error?.error || err?.error?.message || 'No se pudo editar el mensaje.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────
  canManageMessage(msg: Mensaje): boolean {
    return msg.tipo === 'enviado' &&
      !msg.isAuto &&
      !msg.id.startsWith('tmp-') &&
      this.isWithinWindow(msg, this.deleteWindowMs);
  }

  deleteMessage(msg: Mensaje): void {
    if (!this.selectedChatId || !this.canManageMessage(msg)) return;
    this.messageMenu = undefined;
    this.whatsappChat.deleteMessage(this.selectedChatId, msg.id).subscribe({
      next: () => {
        if (this.selectedChatId) this.loadChatMessages(this.selectedChatId, true);
      },
      error: (err) => {
        this.sendError = err?.error?.error || err?.error?.message || 'No se pudo eliminar el mensaje.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Reacciones ───────────────────────────────────────────────────────────
  isReactionMessage(msg: Mensaje | WaMessage): boolean {
    return !!msg.reactionToMessageId;
  }

  canReactToMessage(msg: Mensaje): boolean {
    return !!msg.metaMessageId && !msg.id.startsWith('tmp-') && !this.isReactionMessage(msg);
  }

  reactToMessage(msg: Mensaje, emoji: string): void {
    if (!this.selectedChatId || !this.canReactToMessage(msg)) return;
    const current = this.ownReactionEmoji(msg);
    const next = emoji && emoji === current ? '' : emoji;
    this.messageMenu = undefined;
    this.showReactionsForId = null;
    this.whatsappChat.reactToMessage(this.selectedChatId, msg.id, next).subscribe({
      next: () => {
        if (this.selectedChatId) this.loadChatMessages(this.selectedChatId, true);
      },
      error: (err) => {
        this.sendError = err?.error?.error || err?.error?.message || 'No se pudo enviar la reacción.';
        this.cdr.markForCheck();
      },
    });
  }

  toggleReactions(msg: Mensaje): void {
    this.showReactionsForId = this.showReactionsForId === msg.id ? null : msg.id;
    this.cdr.markForCheck();
  }

  ownReactionEmoji(msg: Mensaje): string {
    const list = this.messagesMap.get(this.selectedChatId ?? '') ?? [];
    const reaction = list.find(m =>
      m.reactionToMessageId === msg.id &&
      m.fromMe &&
      !m.reactionRemoved &&
      !!m.body,
    );
    return reaction?.body || '';
  }

  messageReactions(msg: Mensaje): { emoji: string; count: number; mine: boolean }[] {
    const list = this.messagesMap.get(this.selectedChatId ?? '') ?? [];
    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const m of list) {
      if (m.reactionToMessageId !== msg.id || m.reactionRemoved || !m.body) continue;
      const emoji = m.body;
      const prev = grouped.get(emoji) ?? { count: 0, mine: false };
      prev.count++;
      if (m.fromMe) prev.mine = true;
      grouped.set(emoji, prev);
    }
    return [...grouped.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }));
  }

  // ── Helpers de acciones ──────────────────────────────────────────────────
  private isWithinWindow(msg: Mensaje, windowMs: number): boolean {
    return Date.now() - this.parseMsgTime(msg) <= windowMs;
  }

  private parseMsgTime(msg: Mensaje): number {
    const raw = this.messagesMap.get(this.selectedChatId ?? '')?.find(m => m.id === msg.id);
    return raw ? new Date(raw.timestamp).getTime() : Date.now();
  }

  showToast(text: string): void {
    this.actionToast = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.actionToast = '';
      this.cdr.markForCheck();
    }, 2600);
    this.cdr.markForCheck();
  }

  private fileKind(file: File): 'image' | 'video' | 'audio' | 'document' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private isAllowedUpload(file: File): boolean {
    const mimeType = this.normalizeMimeType(file.type);
    if (!this.allowedUploadTypes.includes(mimeType)) return false;
    const ext = this.extensionFromName(file.name);
    const expected = this.extensionForMime(mimeType);
    return !expected || !ext || ext === expected || this.isCompatibleExtension(mimeType, ext);
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

  trackByContactoId(_: number, c: Contacto): string { return c.id; }
  trackByMensajeId(_: number, m: Mensaje): string { return m.id; }

  private startLoadingProgress(): void {
    this.loadingProgress = 0;
    this.stopProgressTimer();

    const tick = () => {
      if (!this.dataReady) {
        const remaining = 100 - this.loadingProgress;
        const increment = Math.min(remaining * 0.15 + Math.random() * 3, 8);
        this.loadingProgress = Math.min(this.loadingProgress + increment, 90);
      } else {
        this.loadingProgress = 100;
        this.stopProgressTimer();
      }
      this.cdr.markForCheck();
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

  ngOnDestroy(): void {
    this.stopProgressTimer();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.subs.forEach(s => s.unsubscribe());
    if (this.selectedFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedFilePreviewUrl);
    }
  }
}
