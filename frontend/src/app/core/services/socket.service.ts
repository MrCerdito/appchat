import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket        : Socket | null = null;
  private currentToken  : string | undefined;  // ← agregar

  private listeners = new Map<string, Subject<any>>();

  connect(token?: string): void {
  if (this.socket && this.currentToken === token) return;

    // Si hay socket con token diferente, desconectar primero
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.socket = io(environment.wsUrl, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });

    this.listeners.forEach((subject, event) => {
      this.socket!.on(event, (data: any) => subject.next(data));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket       = null;
    this.currentToken = undefined;
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  on<T>(event: string): Observable<T> {
  if (!this.listeners.has(event)) {
    const subject = new Subject<T>();
    this.listeners.set(event, subject);

    if (this.socket) {
      this.socket.on(event, (data: T) => {
        subject.next(data);
      });
    } else {
    }
  } else if (this.socket && !this.socket.hasListeners(event)) {
    const subject = this.listeners.get(event)!;
    this.socket.on(event, (data: T) => {
        subject.next(data);
      });
  }

  return this.listeners.get(event)!.asObservable();
}

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}