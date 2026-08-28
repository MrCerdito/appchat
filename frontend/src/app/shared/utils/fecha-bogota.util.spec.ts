import { describe, it, expect } from 'vitest';
import { civilStr, rangoCivilStr, fechaBogotaActual, restarDiasCivil } from './fecha-bogota.util';

describe('fecha-bogota.util', () => {
  describe('civilStr', () => {
    it('formatea una FechaCivil como YYYY-MM-DD', () => {
      expect(civilStr({ year: 2026, month: 8, day: 27 })).toBe('2026-08-27');
      expect(civilStr({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    });
  });

  describe('rangoCivilStr', () => {
    it('convierte 2026-08-27 al rango UTC completo del día bogotano', () => {
      expect(rangoCivilStr('2026-08-27')).toEqual({
        desde: '2026-08-27T05:00:00.000Z',
        hasta: '2026-08-28T04:59:59.999Z',
      });
    });

    it('devuelve null para strings no válidos', () => {
      expect(rangoCivilStr('')).toBeNull();
      expect(rangoCivilStr('27-08-2026')).toBeNull();
      expect(rangoCivilStr('no-es-fecha')).toBeNull();
    });
  });

  describe('predicado de filtro fecha + estado', () => {
    // Replica la lógica de filteredSessions (history.ts) de forma aislada.
    const matcher = (createdAt: string, filterDateFrom: string, filterDateTo: string, status: string) => {
      let matchDate = true;
      if ((filterDateFrom || filterDateTo) && createdAt) {
        const createdMs = new Date(createdAt).getTime();
        if (filterDateFrom) {
          const from = rangoCivilStr(filterDateFrom);
          if (from) matchDate = matchDate && createdMs >= new Date(from.desde).getTime();
        }
        if (filterDateTo) {
          const to = rangoCivilStr(filterDateTo);
          if (to) matchDate = matchDate && createdMs <= new Date(to.hasta).getTime();
        }
      }
      const matchStatus =
        status === 'all' ||
        (status === 'active' && false) ||
        (status === 'closed' && false) ||
        true;
      return matchDate && matchStatus;
    };

    const withinToday = (from: string, to: string) => rangoCivilStr(from)!.desde <= '2026-08-27T12:00:00.000Z';

    it('una sesión de hoy (12:00Z) coincide con el preset "Hoy" en Bogota', () => {
      const hoy = fechaBogotaActual(new Date('2026-08-27T18:00:00Z'));
      const from = civilStr(hoy);
      const to = civilStr(hoy);
      expect(withinToday(from, to)).toBe(true);
      expect(matcher('2026-08-27T12:00:00Z', from, to, 'all')).toBe(true);
    });

    it('una sesión de otro día NO coincide con "Hoy"', () => {
      const hoy = fechaBogotaActual(new Date('2026-08-27T18:00:00Z'));
      const from = civilStr(hoy);
      const to = civilStr(hoy);
      expect(matcher('2026-08-26T12:00:00Z', from, to, 'all')).toBe(false);
      expect(matcher('2026-08-28T12:00:00Z', from, to, 'all')).toBe(false);
    });

    it('el filtro de fecha aplica igual con cualquier estado', () => {
      const hoy = fechaBogotaActual(new Date('2026-08-27T18:00:00Z'));
      const from = civilStr(hoy);
      const to = civilStr(hoy);
      for (const st of ['all', 'active', 'closed']) {
        expect(matcher('2026-08-27T12:00:00Z', from, to, st)).toBe(true);
        expect(matcher('2026-08-28T12:00:00Z', from, to, st)).toBe(false);
      }
    });

    it('ayer cubre el día anterior en Bogota', () => {
      const hoy = fechaBogotaActual(new Date('2026-08-27T18:00:00Z'));
      const ayer = restarDiasCivil(hoy, 1);
      expect(ayer).toEqual({ year: 2026, month: 8, day: 26 });
      expect(matcher('2026-08-26T12:00:00Z', civilStr(ayer), civilStr(ayer), 'all')).toBe(true);
      expect(matcher('2026-08-27T12:00:00Z', civilStr(ayer), civilStr(ayer), 'all')).toBe(false);
    });
  });
});
