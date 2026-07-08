import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Message } from '../models/message.model';
import { Session } from '../models/session.model';

const UNREAD_KEY = 'chat_unread';

@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private messagesMap = new Map<string, Message[]>();
  private unreadMap = new Map<string, number>();
  private joinedRooms = new Set<string>();
  private activeSessionId: string | null = null;

  sessions$ = new BehaviorSubject<Session[]>([]);
  unreadTotal$ = new BehaviorSubject<number>(0);

  constructor() {
    this.loadUnreadFromStorage();
    this.emitUnreadTotal();
  }

  private loadUnreadFromStorage(): void {
    try {
      const raw = localStorage.getItem(UNREAD_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      Object.entries(parsed).forEach(([key, value]) => this.unreadMap.set(key, value));
    } catch {
      // Ignore corrupted local unread state.
    }
  }

  private saveUnreadToStorage(): void {
    const obj: Record<string, number> = {};
    this.unreadMap.forEach((value, key) => {
      if (value > 0) obj[key] = value;
    });
    localStorage.setItem(UNREAD_KEY, JSON.stringify(obj));
  }

  getUnread(sessionId: string): number {
    return this.unreadMap.get(sessionId) ?? 0;
  }

  setUnread(sessionId: string, count: number): void {
    this.unreadMap.set(sessionId, Math.max(0, count));
    this.saveUnreadToStorage();
    this.emitUnreadTotal();
  }

  incrementUnread(sessionId: string): void {
    this.unreadMap.set(sessionId, (this.unreadMap.get(sessionId) ?? 0) + 1);
    this.saveUnreadToStorage();
    this.emitUnreadTotal();
  }

  getMessages(sessionId: string): Message[] {
    return this.messagesMap.get(sessionId) ?? [];
  }

  setMessages(sessionId: string, messages: Message[]): void {
    this.messagesMap.set(sessionId, messages);
  }

  addMessage(sessionId: string, message: Message): boolean {
    const current = this.messagesMap.get(sessionId) ?? [];
    if (current.some(m => m.id === message.id)) return false;
    this.messagesMap.set(sessionId, [...current, message]);
    return true;
  }

  markRead(sessionId: string, senderType: string): void {
    const current = this.messagesMap.get(sessionId) ?? [];
    this.messagesMap.set(sessionId, current.map(m =>
      m.senderType === senderType ? { ...m, readAt: new Date().toISOString() } : m,
    ));
  }

  clearSession(sessionId: string): void {
    this.messagesMap.delete(sessionId);
    this.unreadMap.delete(sessionId);
    this.joinedRooms.delete(sessionId);
    if (this.activeSessionId === sessionId) this.activeSessionId = null;
    this.saveUnreadToStorage();
    this.emitUnreadTotal();
  }

  reconcileSessions(sessions: Session[]): void {
    const activeIds = new Set(
      sessions
        .filter(session => session.status === 'waiting' || session.status === 'active')
        .map(session => session.id),
    );
    let changed = false;

    for (const sessionId of [...this.unreadMap.keys()]) {
      if (!activeIds.has(sessionId)) {
        this.unreadMap.delete(sessionId);
        changed = true;
      }
    }

    for (const sessionId of [...this.messagesMap.keys()]) {
      if (!activeIds.has(sessionId)) {
        this.messagesMap.delete(sessionId);
        this.joinedRooms.delete(sessionId);
      }
    }

    if (changed) {
      this.saveUnreadToStorage();
      this.emitUnreadTotal();
    }
  }

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  isJoined(sessionId: string): boolean {
    return this.joinedRooms.has(sessionId);
  }

  markJoined(sessionId: string): void {
    this.joinedRooms.add(sessionId);
  }

  removeJoined(sessionId: string): void {
    this.joinedRooms.delete(sessionId);
  }

  private emitUnreadTotal(): void {
    let total = 0;
    this.unreadMap.forEach(value => total += value);
    this.unreadTotal$.next(total);
  }
}
