import { TestBed } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { AdvisorNotificationService } from './advisor-notification.service';
import { SoundService } from './sound.service';
import { ChatStateService } from './chat-state.service';
import { NotificationService } from './notification.service';
import { Message } from '../models/message.model';
import { User } from '../models/user.model';

describe('AdvisorNotificationService', () => {
  let service: AdvisorNotificationService;
  let soundSpy: { playAssignmentSound: ReturnType<typeof vi.fn>; playCriticalMessage: ReturnType<typeof vi.fn>; notify: ReturnType<typeof vi.fn> };
  let chatStateSpy: { addMessage: ReturnType<typeof vi.fn>; sessions$: BehaviorSubject<any[]> };

  const currentUser: User = { id: 'adv-1', name: 'Asesor Test', email: 't@t.com', role: 'advisor' };
  const adminUser: User = { id: 'admin-1', name: 'Admin', email: 'a@a.com', role: 'admin' };

  function makeMsg(overrides: Partial<Message & { sessionId?: string; advisorId?: string }> = {}): Message & { sessionId?: string; advisorId?: string } {
    return {
      id: 'msg-1', kind: 'message', content: 'Hola', senderType: 'client',
      senderName: 'Cliente', createdAt: new Date().toISOString(), ...overrides,
    } as any;
  }

  beforeEach(() => {
    soundSpy = {
      playAssignmentSound: vi.fn(),
      playCriticalMessage: vi.fn(),
      notify: vi.fn(),
    };
    const sessions$ = new BehaviorSubject<any[]>([]);
    chatStateSpy = { addMessage: vi.fn().mockReturnValue(true), sessions$ };

    TestBed.configureTestingModule({
      providers: [
        AdvisorNotificationService,
        { provide: SoundService, useValue: soundSpy },
        { provide: ChatStateService, useValue: chatStateSpy },
        { provide: NotificationService, useValue: { info: vi.fn() } },
      ],
    });
    service = TestBed.inject(AdvisorNotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('onSessionAssigned', () => {
    it('should play assignment sound and notify', () => {
      service.onSessionAssigned({ sessionId: 's1', clientName: 'Juan' });
      expect(soundSpy.playAssignmentSound).toHaveBeenCalled();
      expect(soundSpy.notify).toHaveBeenCalledWith('CHAT EN LINEA', expect.stringContaining('Juan'), 'assigned-s1');
    });

    it('should handle missing clientName gracefully', () => {
      service.onSessionAssigned({ sessionId: 's2', clientName: '' });
      expect(soundSpy.notify).toHaveBeenCalledWith('CHAT EN LINEA', expect.stringContaining('Cliente'), 'assigned-s2');
    });
  });

  describe('onNewMessage', () => {
    it('should return shouldNotify=false for non-client messages', () => {
      const result = service.onNewMessage(makeMsg({ senderType: 'advisor' } as any), currentUser, {});
      expect(result.shouldNotify).toBeFalsy();
      expect(chatStateSpy.addMessage).not.toHaveBeenCalled();
    });

    it('should return shouldNotify=false when no sessionId', () => {
      const msg = makeMsg();
      delete (msg as any).session;
      (msg as any).sessionId = undefined;
      const result = service.onNewMessage(msg, currentUser, {});
      expect(result.shouldNotify).toBeFalsy();
    });

    it('should add message to chat state', () => {
      const msg = makeMsg({ sessionId: 's1' });
      service.onNewMessage(msg, currentUser, { viewingSessionId: 's1', isWindowVisible: true });
      expect(chatStateSpy.addMessage).toHaveBeenCalledWith('s1', msg);
    });

    it('should notify when not viewing the session', () => {
      chatStateSpy.sessions$.next([{ id: 's1', advisor: { id: 'adv-1' } }]);
      const msg = makeMsg({ sessionId: 's1' });
      (msg as any).session = { id: 's1', advisor: { id: 'adv-1' } };
      const result = service.onNewMessage(msg, currentUser, { viewingSessionId: 's2', isWindowVisible: true });
      expect(result.shouldNotify).toBeTruthy();
      expect(soundSpy.playCriticalMessage).toHaveBeenCalled();
    });

    it('should NOT notify when viewing the same session with window visible', () => {
      chatStateSpy.sessions$.next([{ id: 's1', advisor: { id: 'adv-1' } }]);
      const msg = makeMsg({ sessionId: 's1' });
      (msg as any).session = { id: 's1', advisor: { id: 'adv-1' } };
      const result = service.onNewMessage(msg, currentUser, { viewingSessionId: 's1', isWindowVisible: true });
      expect(result.shouldNotify).toBeFalsy();
      expect(soundSpy.playCriticalMessage).not.toHaveBeenCalled();
    });

    it('should notify if viewing same session but window not visible', () => {
      chatStateSpy.sessions$.next([{ id: 's1', advisor: { id: 'adv-1' } }]);
      const msg = makeMsg({ sessionId: 's1' });
      (msg as any).session = { id: 's1', advisor: { id: 'adv-1' } };
      const result = service.onNewMessage(msg, currentUser, { viewingSessionId: 's1', isWindowVisible: false });
      expect(result.shouldNotify).toBeTruthy();
    });

    it('should notify for admin role regardless of assignment', () => {
      chatStateSpy.sessions$.next([{ id: 's1', advisor: { id: 'other-adv' } }]);
      const msg = makeMsg({ sessionId: 's1' });
      (msg as any).session = { id: 's1', advisor: { id: 'other-adv' } };
      const result = service.onNewMessage(msg, adminUser, { viewingSessionId: 's2' });
      expect(result.isAssigned).toBeTruthy();
      expect(result.shouldNotify).toBeTruthy();
    });

    it('should NOT notify for unassigned advisor', () => {
      chatStateSpy.sessions$.next([{ id: 's1', advisor: { id: 'other-adv' } }]);
      const msg = makeMsg({ sessionId: 's1' });
      (msg as any).session = { id: 's1', advisor: { id: 'other-adv' } };
      const result = service.onNewMessage(msg, currentUser, { viewingSessionId: 's2' });
      expect(result.isAssigned).toBeFalsy();
      expect(result.shouldNotify).toBeFalsy();
    });

    it('should use advisorId from message for assignment check', () => {
      chatStateSpy.sessions$.next([]);
      const msg = makeMsg({ sessionId: 's1', advisorId: 'adv-1' });
      const result = service.onNewMessage(msg, currentUser, { viewingSessionId: 's2' });
      expect(result.isAssigned).toBeTruthy();
      expect(result.shouldNotify).toBeTruthy();
    });
  });
});
