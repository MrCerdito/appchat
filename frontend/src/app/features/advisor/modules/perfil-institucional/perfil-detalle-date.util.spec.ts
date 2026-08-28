import { describe, it, expect } from 'vitest';
import {
  bogotaCivilAUtc,
  fechaBogotaActual,
  offsetBogotaMinutos,
  rangoDiaBogotaUtc,
  restarDiasCivil,
} from './perfil-detalle-date.util';

describe('perfil-detalle-date.util', () => {
  describe('offsetBogotaMinutos', () => {
    it('Bogota está fijo en UTC-5 (offset -300 min)', () => {
      expect(offsetBogotaMinutos(new Date('2026-08-27T14:30:00Z'))).toBe(-300);
      expect(offsetBogotaMinutos(new Date('2026-01-15T00:00:00Z'))).toBe(-300);
    });
  });

  describe('fechaBogotaActual', () => {
    it('27/08/2026 09:25 UTC-5 corresponde a hoy 27/08 en Bogota', () => {
      // 14:25Z es 09:25 en Bogota (UTC-5)
      const hoy = fechaBogotaActual(new Date('2026-08-27T14:25:00Z'));
      expect(hoy).toEqual({ year: 2026, month: 8, day: 27 });
    });

    it('muy temprano en UTC aún es el día anterior en Bogota', () => {
      // 03:00Z = 22:00 del día anterior en Bogota
      const hoy = fechaBogotaActual(new Date('2026-08-27T03:00:00Z'));
      expect(hoy).toEqual({ year: 2026, month: 8, day: 26 });
    });
  });

  describe('rangoDiaBogotaUtc', () => {
    it('el día 27/08/2026 en Bogota cubre 05:00Z -> 28/08 04:59:59.999Z', () => {
      const rango = rangoDiaBogotaUtc({ year: 2026, month: 8, day: 27 });
      expect(rango.desde).toBe('2026-08-27T05:00:00.000Z');
      expect(rango.hasta).toBe('2026-08-28T04:59:59.999Z');
    });
  });

  describe('bogotaCivilAUtc', () => {
    it('convierte 00:00 civil bogotano del 27/08 a 05:00Z', () => {
      const ms = bogotaCivilAUtc({ year: 2026, month: 8, day: 27 }, 0, 0, 0, 0);
      expect(new Date(ms).toISOString()).toBe('2026-08-27T05:00:00.000Z');
    });

    it('convierte 23:59:59.999 civil bogotano del 27/08 a 28/08 04:59:59.999Z', () => {
      const ms = bogotaCivilAUtc({ year: 2026, month: 8, day: 27 }, 23, 59, 59, 999);
      expect(new Date(ms).toISOString()).toBe('2026-08-28T04:59:59.999Z');
    });
  });

  describe('restarDiasCivil', () => {
    it('el día anterior al 27/08/2026 es 26/08/2026', () => {
      expect(restarDiasCivil({ year: 2026, month: 8, day: 27 }, 1)).toEqual({
        year: 2026,
        month: 8,
        day: 26,
      });
    });

    it('cruza el límite de mes (1/03 -> 28/02)', () => {
      expect(restarDiasCivil({ year: 2024, month: 3, day: 1 }, 1)).toEqual({
        year: 2024,
        month: 2,
        day: 29,
      });
    });
  });
});
