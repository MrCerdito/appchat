import {
  countNotificationsInSection,
  notificationSection,
  notificationsInSection,
} from './notification-section.util';
import { Notification } from './notification.model';

const aviso = (id: string, type: string, read: boolean): Notification => ({
  id,
  type,
  title: id,
  message: id,
  entityType: type.startsWith('ticket_') ? 'ticket' : type === 'correo_nuevo' ? 'correo' : 'tarea',
  entityId: id,
  entityCodigo: null,
  recipientId: 'user-1',
  senderId: null,
  read,
  readAt: read ? '2026-10-01T00:00:00Z' : null,
  meta: null,
  createdAt: '2026-10-01T00:00:00Z',
});

describe('notification-section.util', () => {
  const avisos = [
    aviso('ticket-1', 'ticket_created', false),
    aviso('mail-1', 'correo_nuevo', false),
    aviso('task-1', 'tarea_asignada', true),
    aviso('ticket-2', 'ticket_closed', true),
  ];

  it('clasifica tickets, correos y conserva los otros tipos', () => {
    expect(notificationSection('ticket_sla_expired')).toBe('tickets');
    expect(notificationSection('correo_nuevo')).toBe('correos');
    expect(notificationSection('tarea_asignada')).toBe('otros');
    expect(notificationSection('nuevo_tipo')).toBe('otros');
  });

  it('filtra sin quitar notificaciones de otras secciones', () => {
    expect(notificationsInSection(avisos, 'correos').map((n) => n.id)).toEqual(['mail-1']);
    expect(notificationsInSection(avisos, 'otros').map((n) => n.id)).toEqual(['task-1']);
  });

  it('cuenta total y no leídas independientemente por sección', () => {
    expect(countNotificationsInSection(avisos, 'tickets')).toEqual({ total: 2, unread: 1 });
    expect(countNotificationsInSection(avisos, 'correos')).toEqual({ total: 1, unread: 1 });
    expect(countNotificationsInSection(avisos, 'otros')).toEqual({ total: 1, unread: 0 });
  });
});
