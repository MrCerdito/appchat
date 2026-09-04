export const DEFAULT_TICKET_CATEGORIES = [
  'Soporte tecnico',
  'Administrativo',
  'Academico',
  'Facturacion',
  'Otro',
];

export const TICKET_PRIORITIES = [
  { value: 'low', label: 'Baja', color: '#22c55e' },
  { value: 'medium', label: 'Media', color: '#f59e0b' },
  { value: 'high', label: 'Alta', color: '#f97316' },
  { value: 'critical', label: 'Critica', color: '#dc2626' },
] as const;

export const TICKET_STATUSES = [
  { value: 'open', label: 'Abierto', color: '#3b82f6' },
  { value: 'in_progress', label: 'En Proceso', color: '#f59e0b' },
  { value: 'on_hold', label: 'En Espera', color: '#8b5cf6' },
  { value: 'denied', label: 'Denegado', color: '#ef4444' },
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

export function slaTimeRemaining(deadline: string | null, totalPausedMs: number): { ms: number; expired: boolean; label: string } {
  if (!deadline) return { ms: 0, expired: false, label: 'Sin SLA' };
  const deadlineMs = new Date(deadline).getTime();
  const remaining = deadlineMs - Date.now() + totalPausedMs;
  if (remaining <= 0) return { ms: 0, expired: true, label: 'Vencido' };
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { ms: remaining, expired: false, label: `${days}d ${hours % 24}h` };
  }
  return { ms: remaining, expired: false, label: `${hours}h ${mins}m` };
}

export function slaColor(remaining: { ms: number; expired: boolean }): string {
  if (remaining.expired) return '#dc2626';
  if (remaining.ms <= 3600000) return '#ef4444';
  if (remaining.ms <= 7200000) return '#f59e0b';
  return '#10b981';
}

