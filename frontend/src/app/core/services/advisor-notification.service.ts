import { Injectable } from '@angular/core';
import { SoundService } from './sound.service';
import { ChatStateService } from './chat-state.service';
import { NotificationService } from './notification.service';
import { Message } from '../models/message.model';
import { Session } from '../models/session.model';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AdvisorNotificationService {
  constructor(
    private sound: SoundService,
    private chatState: ChatStateService,
    private notification: NotificationService,
  ) {}

  /** Notificación de chat asignado */
  onSessionAssigned(data: { sessionId: string; clientName: string }): void {
    this.sound.playAssignmentSound();
    this.sound.notify(
      'CHAT EN LINEA',
      `${data.clientName || 'Cliente'}\nNuevo chat asignado`,
      `assigned-${data.sessionId}`,
    );
  }

  /** Notificación de mensaje nuevo. Retorna true si se debe mostrar UI de unread. */
  onNewMessage(
    message: Message & { sessionId?: string; advisorId?: string },
    currentAdvisor: User | null,
    opts: { activeSessionId?: string; viewingSessionId?: string; isWindowVisible?: boolean } = {},
  ): { shouldNotify: boolean; isAssigned: boolean } {
    const sessionId = (message as any).session?.id ?? message.sessionId;
    if (!sessionId || message.senderType !== 'client') {
      return { shouldNotify: false, isAssigned: false };
    }

    // Agregar mensaje (idempotente)
    this.chatState.addMessage(sessionId, message);

    // Verificar asignación
    const session = (message as any).session ??
      this.chatState.sessions$.getValue().find((s: Session) => s.id === sessionId);
    const isAssigned = currentAdvisor?.role === 'admin' ||
      message.advisorId === currentAdvisor?.id ||
      (session as any)?.advisor?.id === currentAdvisor?.id;

    if (!isAssigned) {
      return { shouldNotify: false, isAssigned: false };
    }

    // Verificar si está viendo ese chat exacto
    const isOpenHere = opts.viewingSessionId === sessionId;
    const viendoEseChat = isOpenHere && (opts.isWindowVisible ?? true);

    if (viendoEseChat) {
      return { shouldNotify: false, isAssigned: true };
    }

    // Mostrar notificación
    this.sound.playCriticalMessage();
    this.sound.notify(
      'CHAT EN LINEA',
      `${(session as any)?.clientName || 'Cliente'}\n${message.content || 'Nuevo mensaje del cliente'}`,
      `chat-message-${sessionId}`,
    );

    return { shouldNotify: true, isAssigned: true };
  }

  /** Notificación fallback (toast interno) */
  initFallbackListener(destroyFn: () => void): void {
    this.sound.notificationFallback$
      .subscribe(ev => {
        this.notification.info(ev.title, ev.body.replace(/\n/g, ' · '), ev.icon);
      });
  }
}
