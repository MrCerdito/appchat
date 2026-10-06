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
  tarea_asignada: NotificationPreferenceItem;
  tarea_comentario: NotificationPreferenceItem;
  tarea_actualizada: NotificationPreferenceItem;
  tarea_completada: NotificationPreferenceItem;
  tarea_vencimiento: NotificationPreferenceItem;
  correo_nuevo: NotificationPreferenceItem;
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
  tarea_asignada: 'Tarea asignada',
  tarea_comentario: 'Comentario en tarea',
  tarea_actualizada: 'Tarea actualizada',
  tarea_completada: 'Tarea completada',
  tarea_vencimiento: 'Tarea por vencer',
  correo_nuevo: 'Correo nuevo',
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
  tarea_asignada: 'user-plus',
  tarea_comentario: 'message-square',
  tarea_actualizada: 'edit',
  tarea_completada: 'check-circle',
  tarea_vencimiento: 'alarm-clock',
  correo_nuevo: 'mail',
};
