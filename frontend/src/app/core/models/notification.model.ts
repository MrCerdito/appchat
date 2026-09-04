export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityCodigo: string | null;
  recipientId: string;
  senderId: string | null;
  read: boolean;
  readAt: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
  unreadCount: number;
}

export interface NotificationPreferenceItem {
  inApp: boolean;
  desktop: boolean;
}

export interface NotificationPreferences {
  ticket_created: NotificationPreferenceItem;
  ticket_assigned: NotificationPreferenceItem;
  ticket_reassigned: NotificationPreferenceItem;
  ticket_updated: NotificationPreferenceItem;
  ticket_status_changed: NotificationPreferenceItem;
  ticket_priority_changed: NotificationPreferenceItem;
  ticket_closed: NotificationPreferenceItem;
  ticket_denied: NotificationPreferenceItem;
  ticket_deleted: NotificationPreferenceItem;
  ticket_sla_warning: NotificationPreferenceItem;
  ticket_sla_expired: NotificationPreferenceItem;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  ticket_created: 'Ticket creado',
  ticket_assigned: 'Ticket asignado',
  ticket_reassigned: 'Ticket reasignado',
  ticket_updated: 'Ticket actualizado',
  ticket_status_changed: 'Estado cambiado',
  ticket_priority_changed: 'Prioridad cambiada',
  ticket_closed: 'Ticket cerrado',
  ticket_denied: 'Ticket denegado',
  ticket_deleted: 'Ticket eliminado',
  ticket_sla_warning: 'SLA por vencer',
  ticket_sla_expired: 'SLA vencido',
};

export const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  ticket_created: 'plus-circle',
  ticket_assigned: 'user-plus',
  ticket_reassigned: 'repeat',
  ticket_updated: 'edit',
  ticket_status_changed: 'refresh-cw',
  ticket_priority_changed: 'alert-triangle',
  ticket_closed: 'check-circle',
  ticket_denied: 'x-circle',
  ticket_deleted: 'trash-2',
  ticket_sla_warning: 'clock',
  ticket_sla_expired: 'alert-octagon',
};
