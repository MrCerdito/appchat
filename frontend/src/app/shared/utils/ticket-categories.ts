export const DEFAULT_TICKET_CATEGORIES = [
  'Soporte tecnico',
  'Administrativo',
  'Academico',
  'Facturacion',
  'Otro',
];

export const TICKET_PRIORITIES = [
  { value: 'low', label: 'Baja', color: '#6b7280' },
  { value: 'medium', label: 'Media', color: '#f59e0b' },
  { value: 'high', label: 'Alta', color: '#ef4444' },
  { value: 'critical', label: 'Critica', color: '#dc2626' },
] as const;

export const TICKET_STATUSES = [
  { value: 'open', label: 'Abierto', color: '#3b82f6' },
  { value: 'in_progress', label: 'En progreso', color: '#f59e0b' },
  { value: 'resolved', label: 'Resuelto', color: '#10b981' },
  { value: 'closed', label: 'Cerrado', color: '#6b7280' },
] as const;

export function priorityLabel(value: string): string {
  return TICKET_PRIORITIES.find(p => p.value === value)?.label ?? value;
}

export function priorityColor(value: string): string {
  return TICKET_PRIORITIES.find(p => p.value === value)?.color ?? '#6b7280';
}

export function statusLabel(value: string): string {
  return TICKET_STATUSES.find(s => s.value === value)?.label ?? value;
}

export function statusColor(value: string): string {
  return TICKET_STATUSES.find(s => s.value === value)?.color ?? '#6b7280';
}
