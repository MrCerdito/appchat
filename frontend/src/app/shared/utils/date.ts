const BOGOTA_OFFSET_MS = -5 * 3600000;
const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function toDate(v: Date | string | null | undefined): Date {
  if (!v) return new Date(NaN);
  return typeof v === 'string' ? new Date(v) : v;
}

function bogotaDate(v: Date | string | null | undefined): Date | null {
  const d = toDate(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + BOGOTA_OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ampm(h: number): string {
  return h < 12 ? 'a. m.' : 'p. m.';
}

function h12(h: number): number {
  const r = h % 12;
  return r === 0 ? 12 : r;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTED FORMATTERS
// ══════════════════════════════════════════════════════════════════════════════

export function formatBogotaTime(date: Date | string | null | undefined): string {
  const d = bogotaDate(date);
  if (!d) return '';
  return `${h12(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${ampm(d.getUTCHours())}`;
}

export function relativeTime(dateStr: string): string {
  const d = bogotaDate(dateStr);
  const n = bogotaDate(new Date().toISOString());
  if (!d || !n) return '';
  const diffMin = Math.round((n.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Ahora';
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffMin} min`;
  const diffDays = Math.round(diffHrs / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return DAYS[d.getUTCDay()];
  if (diffDays < 30) return `Hace ${diffDays} dias`;
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function fmtTime(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtTime12(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${h12(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${ampm(d.getUTCHours())}`;
}

export function fmtTimeSec(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function fmtDateShort(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(-2)}`;
}

export function fmtDateFull(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function fmtDateTime(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtDateTimeFull(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtDateTimeShort(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtDateMedium(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

export function fmtMonthYear(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtMedium(v: Date | string | null | undefined): string {
  const d = bogotaDate(v);
  if (!d) return '';
  const h = d.getUTCHours();
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12(h)}:${pad(d.getUTCMinutes())} ${ampm(h)}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// BOGOTA DATE HELPERS (for date comparisons in chat separators)
// ══════════════════════════════════════════════════════════════════════════════

function dateToBogotaStr(iso: string): string {
  const d = bogotaDate(iso);
  if (!d) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function sameBogotaDay(a: string, b: string): boolean {
  return dateToBogotaStr(a) === dateToBogotaStr(b);
}

export function isTodayBogota(iso: string): boolean {
  return dateToBogotaStr(iso) === dateToBogotaStr(new Date().toISOString());
}

export function isYesterdayBogota(iso: string): boolean {
  const now = new Date();
  const bNow = bogotaDate(now.toISOString());
  if (!bNow) return false;
  bNow.setUTCDate(bNow.getUTCDate() - 1);
  const yStr = `${bNow.getUTCFullYear()}-${pad(bNow.getUTCMonth() + 1)}-${pad(bNow.getUTCDate())}`;
  return dateToBogotaStr(iso) === yStr;
}
