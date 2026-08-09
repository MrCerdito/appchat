export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'menos de 1 min';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(d === 1 ? '1 día' : `${d} días`);
  if (h > 0) parts.push(`${h} h`);
  if (min > 0) parts.push(`${min} min`);
  return parts.length ? parts.join(' ') : '1 min';
}

export function formatShortDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h < 24) return min > 0 ? `${h} h ${min} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  if (d === 1) return remH > 0 ? `1 día ${remH} h` : '1 día';
  return remH > 0 ? `${d} días ${remH} h` : `${d} días`;
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'ahora';
  return `hace ${formatDuration(mins)}`;
}

export function minutesSince(iso: string | Date | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}
