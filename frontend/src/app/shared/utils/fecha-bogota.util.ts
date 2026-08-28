export const BOGOTA_TZ = 'America/Bogota';

export interface FechaCivil {
  year: number;
  month: number;
  day: number;
}

const PARTE_DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: BOGOTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const OFFSET_DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: BOGOTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface PartesTiempo {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

function partes(tipo: 'parte' | 'offset', instant: Date): PartesTiempo {
  const fmt = tipo === 'parte' ? PARTE_DTF : OFFSET_DTF;
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  }
  const result: PartesTiempo = { year: 0, month: 0, day: 0 };
  result.year = out['year'];
  result.month = out['month'];
  result.day = out['day'];
  if ('hour' in out) result.hour = out['hour'];
  if ('minute' in out) result.minute = out['minute'];
  if ('second' in out) result.second = out['second'];
  return result;
}

/** Offset (en minutos) de Bogota respecto a UTC para un instante dado (UTC-5 sin DST => -300). */
export function offsetBogotaMinutos(instant: Date): number {
  const p = partes('offset', instant);
  const bogotaMs = Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  const utcMs = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds(),
  );
  return Math.round((bogotaMs - utcMs) / 60000);
}

/** Devuelve la fecha civil (día calendario) actual en Bogota. */
export function fechaBogotaActual(now: Date = new Date()): FechaCivil {
  const p = partes('parte', now);
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * Convierte una hora civil en Bogota (año/mes/día y hora local bogotana) a su
 * instante UTC exacto, sin asumir un offset fijo de +5.
 */
export function bogotaCivilAUtc(dia: FechaCivil, hora: number, min: number, seg: number, ms: number): number {
  const localMs = Date.UTC(dia.year, dia.month - 1, dia.day, hora, min, seg, ms);
  const offsetMin = offsetBogotaMinutos(new Date(localMs));
  return localMs - offsetMin * 60000;
}

/**
 * Dado un día civil en Bogota, devuelve el rango UTC [desde, hasta] que cubre
 * todo ese día (00:00:00.000 -> 23:59:59.999 hora bogotana).
 */
export function rangoDiaBogotaUtc(dia: FechaCivil): { desde: string; hasta: string } {
  return {
    desde: new Date(bogotaCivilAUtc(dia, 0, 0, 0, 0)).toISOString(),
    hasta: new Date(bogotaCivilAUtc(dia, 23, 59, 59, 999)).toISOString(),
  };
}

/** Resta días a una fecha civil, devolviendo otra fecha civil (sin tocar timezone). */
export function restarDiasCivil(dia: FechaCivil, dias: number): FechaCivil {
  const base = Date.UTC(dia.year, dia.month - 1, dia.day);
  const d = new Date(base - dias * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Formatea una fecha civil como 'YYYY-MM-DD'. */
export function civilStr(dia: FechaCivil): string {
  const mm = String(dia.month).padStart(2, '0');
  const dd = String(dia.day).padStart(2, '0');
  return `${dia.year}-${mm}-${dd}`;
}

const FECHA_STR = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Dado un string 'YYYY-MM-DD' que representa un día civil bogotano, devuelve el
 * rango UTC [desde, hasta] que cubre ese día completo (00:00 -> 23:59:59.999
 * hora bogotana). Devuelve null si el string no es válido.
 */
export function rangoCivilStr(str: string): { desde: string; hasta: string } | null {
  const m = FECHA_STR.exec(str);
  if (!m) return null;
  return rangoDiaBogotaUtc({ year: +m[1], month: +m[2], day: +m[3] });
}
