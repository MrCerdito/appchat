import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, of, BehaviorSubject } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

import {
  WaChat,
  WaMessage,
  QuickReply,
  AwNewMessage,
  AwMessageStatus,
  AwChatAssigned,
  AwQueueUpdated,
  WaContactUpdate,
  WaConnectionStatus,
  WaAdminDashboard,
  WaOperationalStatus,
} from '../models/whatsapp.models';

export interface TeamsConnectionStatus {
  connected: boolean;
  accountName?: string;
}

export interface TeamsMeetingRequest {
  subject: string;
  startDateTime: string;
  durationMinutes?: number;
  calendarTarget?: 'personal' | 'shared' | 'none';
}

export interface TeamsMeetingResponse {
  ok: boolean;
  meeting?: {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    joinUrl: string;
  };
  chat?: WaChat;
}

@Injectable({ providedIn: 'root' })
export class WhatsappChatService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/advisors-whatsapp`;
  private readonly wsUrl = environment.wsUrl;

  private socket!: Socket;

  private newMessage$ = new Subject<AwNewMessage>();
  private msgStatus$ = new Subject<AwMessageStatus>();
  private chatAssigned$ = new Subject<AwChatAssigned>();
  private chatUpdated$ = new Subject<WaChat>();
  private queueUpdated$ = new Subject<AwQueueUpdated>();
  private chats$ = new BehaviorSubject<WaChat[]>([]);
  private connection$ = new BehaviorSubject<WaConnectionStatus>({
    status: 'connecting',
    updatedAt: new Date().toISOString(),
  });

  constructor(private http: HttpClient) {
    this.connectSocket();
  }

  private connectSocket(): void {
    this.socket = io(`${this.wsUrl}/advisors-whatsapp`, {
      transports: ['websocket'],
      path: '/socket.io',
      auth: { token: this.getToken() },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      reconnectionAttempts: 20,

    });

    this.socket.on('connect', () => {
      this.connection$.next({ status: 'connected', updatedAt: new Date().toISOString() });
    });

    this.socket.on('disconnect', (reason) => {
      this.connection$.next({ status: 'disconnected', updatedAt: new Date().toISOString() });
    });

    this.socket.on('connect_error', (err) => {
      this.connection$.next({ status: 'error', updatedAt: new Date().toISOString() });
    });

    this.socket.on('aw_new_message', (data: AwNewMessage) => {
      if (this.updateChatOnNewMessage(data)) {
        this.newMessage$.next(data);
      }
    });

    this.socket.on('aw_message_status', (data: AwMessageStatus) => {
      this.msgStatus$.next(data);
      this.updateMessageStatus(data);
    });

    this.socket.on('aw_chat_assigned', (data: AwChatAssigned) => {
      this.chatAssigned$.next(data);
      this.upsertChat(data.chat);
    });

    this.socket.on('aw_chat_updated', (chat: WaChat) => {
      this.upsertChat(chat);
      this.chatUpdated$.next(chat);
    });

    this.socket.on('aw_queue_updated', (data: AwQueueUpdated = {}) => {
      if (data.chat) this.queueUpdated$.next(data);
      this.loadChats().subscribe();
    });

    this.socket.on('aw_connection_update', (data: WaConnectionStatus) => {
      this.connection$.next(data);
    });
  }

  joinAsAdvisor(advisorId: string): void {
    if (!this.socket?.connected) {
      this.socket?.disconnect();
      this.connectSocket();
    }
    this.socket.emit('aw_join', advisorId);
  }

  disconnect(): void {
    this.socket?.disconnect();
  }

  onNewMessage(): Observable<AwNewMessage> {
    return this.newMessage$.asObservable();
  }

  onMessageStatus(): Observable<AwMessageStatus> {
    return this.msgStatus$.asObservable();
  }

  onChatAssigned(): Observable<AwChatAssigned> {
    return this.chatAssigned$.asObservable();
  }

  onChatUpdated(): Observable<WaChat> {
    return this.chatUpdated$.asObservable();
  }

  onQueueUpdated(): Observable<AwQueueUpdated> {
    return this.queueUpdated$.asObservable();
  }

  getChatsStream(): Observable<WaChat[]> {
    return this.chats$.asObservable();
  }

  getChatsSnapshot(): WaChat[] {
    return this.chats$.getValue();
  }

  syncChats(chats: WaChat[]): void {
    this.chats$.next(chats);
  }

  getConnectionStream(): Observable<WaConnectionStatus> {
    return this.connection$.asObservable();
  }

  loadConnection(): Observable<WaConnectionStatus> {
    return this.http.get<WaConnectionStatus>(`${this.apiUrl}/connection`, { headers: this.headers() }).pipe(
      tap(status => this.connection$.next(status)),
      catchError(() => {
        const status: WaConnectionStatus = {
          status: 'disconnected',
          lastError: 'No se pudo consultar la conexion de WhatsApp.',
          updatedAt: new Date().toISOString(),
        };
        this.connection$.next(status);
        return of(status);
      }),
    );
  }

  restartConnection(): Observable<WaConnectionStatus> {
    return this.http.post<WaConnectionStatus>(
      `${this.apiUrl}/connection/restart`,
      {},
      { headers: this.headers() },
    ).pipe(tap(status => this.connection$.next(status)));
  }

  loadChats(): Observable<WaChat[]> {
    return this.http.get<WaChat[]>(`${this.apiUrl}/chats`, { headers: this.headers() }).pipe(
      tap(chats => this.chats$.next(chats)),
      catchError(() => {
        return of([]);
      }),
    );
  }

  loadAdminDashboard(): Observable<WaAdminDashboard> {
    return this.http.get<WaAdminDashboard>(
      `${this.apiUrl}/admin/dashboard`,
      { headers: this.headers() },
    );
  }

  loadMessages(chatId: string, page = 1, limit = 50): Observable<WaMessage[]> {
    return this.http.get<WaMessage[]>(
      `${this.apiUrl}/chats/${chatId}/messages`,
      { headers: this.headers(), params: { page: String(page), limit: String(limit) } },
    );
  }

  sendMessage(to: string, text: string): Observable<{ ok: boolean; messageId?: string; chat?: WaChat }> {
    return this.http.post<{ ok: boolean; messageId?: string; chat?: WaChat }>(
      `${this.apiUrl}/send`,
      { to, text },
      { headers: this.headers() },
    ).pipe(
      tap(res => {
        if (res.chat) this.upsertChat(res.chat);
      }),
      catchError(() => {
        return of({ ok: false });
      }),
    );
  }

  sendMedia(
    to: string,
    file: File,
    caption = '',
  ): Observable<{ ok: boolean; messageId?: string; chat?: WaChat }> {
    const form = new FormData();
    form.append('to', to);
    form.append('file', file);
    if (caption.trim()) form.append('caption', caption.trim());

    return this.http.post<{ ok: boolean; messageId?: string; chat?: WaChat }>(
      `${this.apiUrl}/send-media`,
      form,
      { headers: this.headers() },
    ).pipe(
      tap(res => {
        if (res.chat) this.upsertChat(res.chat);
      }),
      catchError(() => {
        return of({ ok: false });
      }),
    );
  }

  sendTemplate(
    to: string,
    templateName: string,
    langCode = 'es_CO',
    components: any[] = [],
  ): Observable<{ ok: boolean; messageId?: string; chat?: WaChat }> {
    return this.http.post<{ ok: boolean; messageId?: string; chat?: WaChat }>(
      `${this.apiUrl}/send-template`,
      { to, templateName, langCode, components },
      { headers: this.headers() },
    ).pipe(
      tap(res => {
        if (res.chat) this.upsertChat(res.chat);
      }),
      catchError(() => {
        return of({ ok: false });
      }),
    );
  }

  saveNote(chatId: string, note: string): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/note`,
      { note },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  deleteNote(chatId: string, index: number): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/notes/${index}/delete`,
      {},
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  updateTags(chatId: string, tags: string[]): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/tags`,
      { tags },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  updateContact(chatId: string, contact: WaContactUpdate): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/contact`,
      contact,
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  markRead(chatId: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/chats/${chatId}/read`,
      {},
      { headers: this.headers() },
    ).pipe(
      tap(() => this.setUnread(chatId, 0)),
      catchError(() => of(undefined as any)),
    );
  }

  editMessage(chatId: string, messageId: string, body: string): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/messages/${messageId}`,
      { body },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  deleteMessage(chatId: string, messageId: string): Observable<WaChat> {
    return this.http.delete<WaChat>(
      `${this.apiUrl}/chats/${chatId}/messages/${messageId}`,
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  reactToMessage(chatId: string, messageId: string, emoji: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/messages/${messageId}/reaction`,
      { emoji },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  takeChat(chatId: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/take`,
      {},
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  adminAssignChat(chatId: string, advisorId: string, mode: 'admin' | 'temporary' = 'admin', message?: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/admin-assign`,
      { advisorId, mode, ...(message ? { message } : {}) },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  setFixedAdvisor(chatId: string, advisorId: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/fixed-advisor`,
      { advisorId },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  clearFixedAdvisor(chatId: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/fixed-advisor/delete`,
      {},
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  updateOperationalStatus(chatId: string, status: WaOperationalStatus): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/operational-status`,
      { status },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  updateChatPriority(chatId: string, priority: string): Observable<WaChat> {
    return this.http.patch<WaChat>(
      `${this.apiUrl}/chats/${chatId}/priority`,
      { priority },
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  closeChat(chatId: string): Observable<WaChat> {
    return this.http.post<WaChat>(
      `${this.apiUrl}/chats/${chatId}/close`,
      {},
      { headers: this.headers() },
    ).pipe(tap(chat => this.upsertChat(chat)));
  }

  getTeamsStatus(): Observable<TeamsConnectionStatus> {
    return this.http.get<TeamsConnectionStatus>(
      `${this.apiUrl}/teams/status`,
      { headers: this.headers() },
    );
  }

  getTeamsAuthUrl(): Observable<{ authUrl: string }> {
    return this.http.post<{ authUrl: string }>(
      `${this.apiUrl}/teams/auth-url`,
      {},
      { headers: this.headers() },
    );
  }

  createTeamsMeeting(
    chatId: string,
    payload: TeamsMeetingRequest,
  ): Observable<TeamsMeetingResponse> {
    return this.http.post<TeamsMeetingResponse>(
      `${this.apiUrl}/chats/${chatId}/teams-meeting`,
      payload,
      { headers: this.headers() },
    ).pipe(
      tap(res => {
        if (res.chat) this.upsertChat(res.chat);
      }),
    );
  }

  getQuickReplies(): Observable<QuickReply[]> {
    return this.http.get<QuickReply[]>(`${this.apiUrl}/quick-replies`, { headers: this.headers() });
  }

  private updateChatOnNewMessage(msg: AwNewMessage): boolean {
    const current = this.chats$.getValue();
    const idx = current.findIndex(c => c.id === msg.chatId);

    if (idx === -1) {
      this.loadChats().subscribe();
      return true;
    }

    const updated = [...current];
    const chat = { ...updated[idx] };
    const now = this.parseDateValue(msg.timestamp);

    const messages = [...(chat.messages ?? [])];
    const isNewMessage = !messages.some(m => m.id === msg.id);
    if (isNewMessage) {
      messages.push({ ...msg, timestamp: now });
    }
    if (!isNewMessage) return false;

    chat.preview = this.isReactionMessage(msg) ? chat.preview : this.messagePreview(msg);
    chat.time = this.formatBogotaTime(now);
    if (!msg.fromMe && isNewMessage && !this.isReactionMessage(msg)) chat.unread = (chat.unread ?? 0) + 1;
    if (!msg.fromMe) chat.lastClientMsg = now;
    chat.messages = messages;

    updated[idx] = chat;
    this.chats$.next(updated);
    return true;
  }

  private updateMessageStatus(data: AwMessageStatus): void {
    const current = this.chats$.getValue();
    const updated = current.map(chat => ({
      ...chat,
      messages: (chat.messages ?? []).map(message =>
        message.id === data.messageId ? { ...message, status: data.status } : message,
      ),
    }));
    this.chats$.next(updated);
  }

  private upsertChat(chat: WaChat): void {
    const current = this.chats$.getValue();
    const idx = current.findIndex(c => c.id === chat.id);
    const updated = [...current];

    if (idx === -1) {
      updated.unshift(chat);
    } else {
      updated[idx] = { ...updated[idx], ...chat };
    }

    updated.sort((a, b) =>
      new Date(b.lastClientMsg ?? 0).getTime() - new Date(a.lastClientMsg ?? 0).getTime(),
    );
    this.chats$.next(updated);
  }

  private messagePreview(msg: WaMessage): string {
    if (this.isReactionMessage(msg)) return msg.body ? `Reaccion ${msg.body}` : 'Reaccion';
    const body = (msg.body || '').trim();
    if (this.isEncryptedBlob(body)) return this.mediaLabel(msg.type);
    if (msg.type && msg.type !== 'text') return this.mediaLabel(msg.type);
    if (body && !this.isLegacyMediaFallback(body)) return body;
    return body;
  }

  private mediaLabel(type: string): string {
    return {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    }[type] ?? 'Archivo';
  }

  private isLegacyMediaFallback(value: string): boolean {
    return /^\[(Imagen|Video|Audio|Documento|Sticker)(?::[^\]]+|\srecibido)?\]$/i.test(value.trim());
  }

  private isEncryptedBlob(value: string): boolean {
    return /(^|\s)enc:v\d+:/i.test(value);
  }

  private isReactionMessage(message: WaMessage): boolean {
    return message.type === 'reaction' || /^\[Reaccion(?::\s*.+)?\]$/i.test((message.body || '').trim());
  }

  private formatBogotaTime(value: Date | string): string {
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(this.parseDateValue(value));
  }

  private parseDateValue(value: Date | string): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      return new Date(`${value}Z`);
    }
    return new Date(value);
  }

  private setUnread(chatId: string, unread: number): void {
    const updated = this.chats$.getValue().map(chat =>
      chat.id === chatId ? { ...chat, unread } : chat,
    );
    this.chats$.next(updated);
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
