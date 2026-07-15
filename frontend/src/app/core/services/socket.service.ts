import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket        : Socket | null = null;
  private currentToken  : string | undefined;

  private listeners = new Map<string, Subject<any>>();

  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly connectionError$ = new BehaviorSubject<string | null>(null);

  connect(token?: string): void {
    if (this.socket && this.currentToken === token) return;

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.connected$.next(false);
    this.connectionError$.next(null);

    this.socket = io(environment.wsUrl || undefined, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: 20,
    });

    this.socket.on('connect', () => {
      this.connected$.next(true);
      this.connectionError$.next(null);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected$.next(false);
      if (reason !== 'io client disconnect') {
        this.connectionError$.next(`Desconectado: ${reason}`);
      }
    });

    this.socket.on('connect_error', (err) => {
      this.connectionError$.next(`Error de conexión: ${err.message}`);
    });

    this.listeners.forEach((subject, event) => {
      this.socket!.on(event, (data: any) => subject.next(data));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket       = null;
    this.currentToken = undefined;
    this.connected$.next(false);
    this.connectionError$.next(null);
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
