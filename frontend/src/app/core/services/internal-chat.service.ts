import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import {
  InternalChatUser,
  InternalConversation,
  InternalMessage,
  InternalReaction,
} from '../models/internal-chat.models';

@Injectable({ providedIn: 'root' })
export class InternalChatService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/internal-chat`;
  private readonly wsUrl = environment.wsUrl;

  private socket!: Socket;
  private socketConnected = false;

  private conversations$ = new BehaviorSubject<InternalConversation[]>([]);
  private messages$ = new BehaviorSubject<InternalMessage[]>([]);
  private unreadTotal$ = new BehaviorSubject<number>(0);
  private advisors$ = new BehaviorSubject<InternalChatUser[]>([]);

  private messagesByConversation = new Map<string, InternalMessage[]>();
  private activeConversationId: string | null = null;

  private newMessageEvent$ = new Subject<InternalMessage>();
  private reactions$ = new Subject<InternalReaction>();

  constructor(private http: HttpClient) {}

  private connectSocket(): void {
    if (this.socket) return;
    this.socket = io(`${this.wsUrl}/internal-chat`, {
      transports: ['websocket'],
      path: '/socket.io',
      auth: { token: this.getToken() },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      reconnectionAttempts: 20,
    });

    this.socket.on('connect', () => {
      this.socketConnected = true;
      this.loadConversations().subscribe();
    });

    this.socket.on('disconnect', () => {
      this.socketConnected = false;
    });

    this.socket.on('connect_error', () => {
      this.socketConnected = false;
    });

    this.socket.on('ic_connected', () => {
      this.loadConversations().subscribe();
    });

    this.socket.on('ic_new_message', (data: { conversationId: string; message: InternalMessage }) => {
      this.handleNewMessage(data);
    });

    this.socket.on('ic_message_edited', (data: { conversationId: string; message: InternalMessage }) => {
      this.applyEdit(data.conversationId, data.message);
    });

    this.socket.on('ic_message_deleted', (data: { conversationId: string; messageId: string; deletedAt: string }) => {
      this.applyDelete(data.conversationId, data.messageId, data.deletedAt);
    });

    this.socket.on('ic_reaction', (data: InternalReaction) => {
      this.applyReaction(data);
    });

    this.socket.on('ic_conversation_updated', (conversation: InternalConversation) => {
      this.upsertConversation(conversation);
    });

    this.socket.on('ic_unread', (data: { conversationId: string; unreadCount: number }) => {
      this.setConversationUnread(data.conversationId, data.unreadCount);
    });
  }

  connect(): void {
    this.connectSocket();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined as unknown as Socket;
  }

  getConversationsStream(): Observable<InternalConversation[]> {
    return this.conversations$.asObservable();
  }

  getConversationsSnapshot(): InternalConversation[] {
    return this.conversations$.getValue();
  }

  getMessagesStream(): Observable<InternalMessage[]> {
    return this.messages$.asObservable();
  }

  getUnreadTotalStream(): Observable<number> {
    return this.unreadTotal$.asObservable();
  }

  getUnreadTotalSnapshot(): number {
    return this.unreadTotal$.getValue();
  }

  getAdvisorsStream(): Observable<InternalChatUser[]> {
    return this.advisors$.asObservable();
  }

  onNewMessage(): Observable<InternalMessage> {
    return this.newMessageEvent$.asObservable();
  }

  onReactions(): Observable<InternalReaction> {
    return this.reactions$.asObservable();
  }

  setActiveConversation(conversationId: string | null): void {
    this.activeConversationId = conversationId;
    if (!conversationId) {
      this.messages$.next([]);
      return;
    }
    const messages = this.messagesByConversation.get(conversationId) ?? [];
    this.messages$.next(messages);
    this.markRead(conversationId).subscribe();
  }

  pushOptimistic(conversationId: string, message: InternalMessage): void {
    const existing = this.messagesByConversation.get(conversationId) ?? [];
    if (existing.some(m => m.id === message.id)) return;
    const updated = [...existing, { ...message, pending: true }];
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId) {
      this.messages$.next(updated);
    }
  }

  replaceOptimistic(conversationId: string, tempId: string, realMessage: InternalMessage): void {
    const existing = this.messagesByConversation.get(conversationId) ?? [];
    if (existing.some(m => m.id === realMessage.id)) {
      const updated = existing.filter(m => m.id !== tempId);
      this.messagesByConversation.set(conversationId, updated);
      if (this.activeConversationId === conversationId) this.messages$.next(updated);
      return;
    }
    const updated = existing.map(m => (m.id === tempId ? this.normalizeMessage(realMessage) : m));
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId) this.messages$.next(updated);
  }

  removeOptimistic(conversationId: string, tempId: string): void {
    const existing = this.messagesByConversation.get(conversationId) ?? [];
    const updated = existing.filter(m => m.id !== tempId);
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId) this.messages$.next(updated);
  }

  loadConversations(): Observable<InternalConversation[]> {
    return this.http.get<InternalConversation[]>(`${this.apiUrl}/conversations`, { headers: this.headers() }).pipe(
      tap(list => this.applyConversations(list)),
      catchError(() => of([] as InternalConversation[])),
    );
  }

  loadAdvisors(): Observable<InternalChatUser[]> {
    return this.http.get<InternalChatUser[]>(`${this.apiUrl}/advisors`, { headers: this.headers() }).pipe(
      tap(list => this.advisors$.next(list)),
      catchError(() => of([] as InternalChatUser[])),
    );
  }

  openDirect(userId: string): Observable<InternalConversation> {
    return this.http.post<InternalConversation>(
      `${this.apiUrl}/conversations/direct`,
      { userId },
      { headers: this.headers() },
    ).pipe(
      tap(conversation => this.upsertConversation(conversation)),
      catchError(() => of(null as unknown as InternalConversation)),
    );
  }

  loadMessages(conversationId: string, before?: string, limit = 50): Observable<InternalMessage[]> {
    const params: Record<string, string> = { limit: String(limit) };
    if (before) params['before'] = before;
    return this.http.get<InternalMessage[]>(
      `${this.apiUrl}/conversations/${conversationId}/messages`,
      { headers: this.headers(), params },
    ).pipe(
      tap(messages => {
        const normalized = messages.map(m => this.normalizeMessage(m));
        const existing = this.messagesByConversation.get(conversationId) ?? [];
        const merged = before
          ? [...normalized, ...existing]
          : normalized;
        const seen = new Set<string>();
        const unique = merged.filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        this.messagesByConversation.set(conversationId, unique);
        if (this.activeConversationId === conversationId) {
          this.messages$.next(unique);
        }
      }),
      catchError(() => of([] as InternalMessage[])),
    );
  }

  sendText(conversationId: string, body: string, replyToMessageId?: string | null): Observable<InternalMessage> {
    return this.http.post<InternalMessage>(
      `${this.apiUrl}/conversations/${conversationId}/messages`,
      { body, ...(replyToMessageId ? { replyToMessageId } : {}) },
      { headers: this.headers() },
    ).pipe(
      catchError(() => of(null as unknown as InternalMessage)),
    );
  }

  sendMedia(conversationId: string, file: File, caption = '', replyToMessageId?: string | null): Observable<InternalMessage> {
    const form = new FormData();
    form.append('file', file);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', replyToMessageId);
    return this.http.post<InternalMessage>(
      `${this.apiUrl}/conversations/${conversationId}/media`,
      form,
      { headers: this.headers() },
    ).pipe(
      catchError(() => of(null as unknown as InternalMessage)),
    );
  }

  editMessage(conversationId: string, messageId: string, body: string): Observable<InternalMessage> {
    return this.http.patch<InternalMessage>(
      `${this.apiUrl}/conversations/${conversationId}/messages/${messageId}`,
      { body },
      { headers: this.headers() },
    ).pipe(
      tap(message => this.applyEdit(conversationId, this.normalizeMessage(message))),
      catchError(() => of(null as unknown as InternalMessage)),
    );
  }

  deleteMessage(conversationId: string, messageId: string): Observable<{ messageId: string; deletedAt: string }> {
    return this.http.delete<{ messageId: string; deletedAt: string }>(
      `${this.apiUrl}/conversations/${conversationId}/messages/${messageId}`,
      { headers: this.headers() },
    ).pipe(
      tap(res => this.applyDelete(conversationId, res.messageId, res.deletedAt)),
      catchError(() => of(null as unknown as { messageId: string; deletedAt: string })),
    );
  }

  forwardMessage(conversationId: string, messageId: string, toConversationId: string): Observable<InternalMessage> {
    return this.http.post<InternalMessage>(
      `${this.apiUrl}/conversations/${conversationId}/messages/${messageId}/forward`,
      { toConversationId },
      { headers: this.headers() },
    ).pipe(
      tap(message => this.appendMessage(toConversationId, this.normalizeMessage(message))),
      catchError(() => of(null as unknown as InternalMessage)),
    );
  }

  reactToMessage(conversationId: string, messageId: string, emoji: string): Observable<InternalReaction> {
    return this.http.post<InternalReaction>(
      `${this.apiUrl}/conversations/${conversationId}/messages/${messageId}/reaction`,
      { emoji },
      { headers: this.headers() },
    ).pipe(
      tap(reaction => this.applyReaction(reaction)),
      catchError(() => of(null as unknown as InternalReaction)),
    );
  }

  markRead(conversationId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiUrl}/conversations/${conversationId}/read`,
      {},
      { headers: this.headers() },
    ).pipe(
      tap(() => {
        this.setConversationUnread(conversationId, 0);
      }),
      catchError(() => of({ ok: false })),
    );
  }

  // ── Socket helpers ──────────────────────────────────────────────────────────
  private handleNewMessage(data: { conversationId: string; message: InternalMessage }): void {
    const message = this.normalizeMessage(data.message);
    const isActive = this.activeConversationId === data.conversationId;
    this.appendMessage(data.conversationId, message, { skipEmit: true });
    if (isActive) {
      this.markRead(data.conversationId).subscribe();
    }
    this.newMessageEvent$.next(message);
    if (this.socketConnected) {
      const conversation = this.conversations$.getValue().find(c => c.id === data.conversationId);
      if (conversation) {
        const preview = message.deletedAt
          ? 'Mensaje eliminado'
          : message.type === 'image'
            ? 'Imagen'
            : message.type === 'audio'
              ? 'Audio'
              : message.type === 'file'
                ? (message.mediaMimeType || '').startsWith('video/')
                  ? 'Video'
                  : 'Archivo'
                : message.body || '';
        this.upsertConversation({
          ...conversation,
          lastMessageAt: message.createdAt,
          lastMessage: {
            id: message.id,
            body: preview,
            senderName: message.senderName,
            createdAt: message.createdAt,
            type: message.type,
            deleted: !!message.deletedAt,
          },
        });
      }
    }
  }

  private applyEdit(conversationId: string, message: InternalMessage): void {
    const list = this.messagesByConversation.get(conversationId);
    if (!list) return;
    const updated = list.map(m => (m.id === message.id ? message : m));
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId) {
      this.messages$.next(updated);
    }
  }

  private applyDelete(conversationId: string, messageId: string, deletedAt: string): void {
    const list = this.messagesByConversation.get(conversationId);
    if (!list) return;
    const updated = list.map(m =>
      m.id === messageId ? { ...m, deletedAt: new Date(deletedAt) } : m,
    );
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId) {
      this.messages$.next(updated);
    }
    const conversations = this.conversations$.getValue();
    const conv = conversations.find(c => c.id === conversationId);
    if (conv?.lastMessage?.id === messageId) {
      this.loadConversations().subscribe();
    }
  }

  private applyReaction(reaction: InternalReaction): void {
    const list = this.messagesByConversation.get(reaction.conversationId);
    if (!list) return;
    const updated = list.map(m =>
      m.id === reaction.messageId ? { ...m, reactions: reaction.reactions } : m,
    );
    this.messagesByConversation.set(reaction.conversationId, updated);
    if (this.activeConversationId === reaction.conversationId) {
      this.messages$.next(updated);
    }
    this.reactions$.next(reaction);
  }

  private appendMessage(
    conversationId: string,
    message: InternalMessage,
    opts: { skipEmit?: boolean } = {},
  ): void {
    const existing = this.messagesByConversation.get(conversationId) ?? [];
    if (existing.some(m => m.id === message.id)) return;
    const updated = [...existing, message];
    this.messagesByConversation.set(conversationId, updated);
    if (this.activeConversationId === conversationId && !opts.skipEmit) {
      this.messages$.next(updated);
    }
    if (opts.skipEmit && this.activeConversationId === conversationId) {
      this.messages$.next(updated);
    }
  }

  private upsertConversation(conversation: InternalConversation): void {
    const current = this.conversations$.getValue();
    const normalized = { ...conversation };
    const idx = current.findIndex(c => c.id === normalized.id);
    const updated = [...current];
    if (idx === -1) {
      updated.unshift(normalized);
    } else {
      updated[idx] = { ...updated[idx], ...normalized };
    }
    updated.sort((a, b) =>
      new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
    );
    this.conversations$.next(updated);
    this.recomputeUnreadTotal();
  }

  private applyConversations(list: InternalConversation[]): void {
    const sorted = [...list].sort((a, b) =>
      new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
    );
    this.conversations$.next(sorted);
    this.recomputeUnreadTotal();
  }

  private setConversationUnread(conversationId: string, unreadCount: number): void {
    const updated = this.conversations$.getValue().map(c =>
      c.id === conversationId ? { ...c, unreadCount } : c,
    );
    this.conversations$.next(updated);
    this.recomputeUnreadTotal();
  }

  private recomputeUnreadTotal(): void {
    const total = this.conversations$
      .getValue()
      .reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    this.unreadTotal$.next(total);
  }

  private normalizeMessage(message: InternalMessage): InternalMessage {
    return {
      ...message,
      reactions: message.reactions ?? [],
      createdAt: new Date(message.createdAt),
      editedAt: message.editedAt ? new Date(message.editedAt) : null,
      deletedAt: message.deletedAt ? new Date(message.deletedAt) : null,
    };
  }

  private headers(): HttpHeaders {
    const token = this.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private getToken(): string {
    return localStorage.getItem('chat_token') ?? '';
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
  }
}
