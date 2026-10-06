import { Notification, NotificationSection } from './notification.model';

export const NOTIFICATION_SECTIONS: Array<{ id: NotificationSection; label: string }> = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'correos', label: 'Correos' },
  { id: 'otros', label: 'Otros' },
];

export function notificationSection(type: string): NotificationSection {
  if (type.startsWith('ticket_')) return 'tickets';
  if (type === 'correo_nuevo') return 'correos';
  // Nunca se descarta un tipo nuevo o una alerta del workspace de tareas.
  return 'otros';
}

export function notificationsInSection(
  notifications: Notification[],
  section: NotificationSection,
): Notification[] {
  return notifications.filter((n) => notificationSection(n.type) === section);
}

export function countNotificationsInSection(
  notifications: Notification[],
  section: NotificationSection,
): { total: number; unread: number } {
  const items = notificationsInSection(notifications, section);
  return { total: items.length, unread: items.filter((n) => !n.read).length };
}
