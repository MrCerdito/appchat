jest.mock('sanitize-html', () => (value: string) => value);

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdvisorActivityService, PeriodoActividad } from './advisor-activity.service';
import { AdvisorActivityLog } from './entities/advisor-activity.entity';
import { User } from '../auth/entities/user.entity';
import { RedisStateService } from '../common/redis/redis-state.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';

/** 2026-09-29 00:00 hora Bogotá = 05:00 UTC del mismo día. */
const DIA = Date.UTC(2026, 8, 29, 5, 0, 0);
const at = (hhmm: string): Date =>
  new Date(DIA + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60000);

const LUNCH = { ini: at('12:00'), fin: at('14:00') };

function per(
  desde: string,
  hasta: string | null,
  estado: PeriodoActividad['estado'] = 'offline',
  extra: Partial<PeriodoActividad> = {},
): PeriodoActividad {
  return {
    desde: at(desde).toISOString(),
    hasta: hasta ? at(hasta).toISOString() : null,
    duracionMs: (hasta ? at(hasta).getTime() - at(desde).getTime() : 0),
    estado,
    almuerzo: false,
    tipo: estado === 'online' ? 'conexion' : 'desconexion',
    causa: 'sistema',
    ...extra,
  };
}

describe('AdvisorActivityService (overlay de almuerzo)', () => {
  let service: AdvisorActivityService;
  const isLunchSkipped = jest.fn().mockResolvedValue(false);

  beforeEach(async () => {
    isLunchSkipped.mockResolvedValue(false);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvisorActivityService,
        { provide: getRepositoryToken(AdvisorActivityLog), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: RedisStateService,
          useValue: { isLunchSkipped },
        },
        { provide: ConfiguracionService, useValue: {} },
      ],
    }).compile();
    service = module.get(AdvisorActivityService);
  });

  const overlay = (
    periodos: PeriodoActividad[],
    franjas = [LUNCH],
    esHoy = false,
    ahora = at('18:00'),
  ): PeriodoActividad[] =>
    (service as any).overlayAlmuerzo(periodos, franjas, esHoy, ahora);

  it('marca la franja de almuerzo aunque el asesor estuviera desconectado', () => {
    const res = overlay([per('08:00', '18:00')]);
    expect(res).toHaveLength(3);
    expect(res.map((p) => p.almuerzo)).toEqual([false, true, false]);
    expect(res[1].desde).toBe(at('12:00').toISOString());
    expect(res[1].hasta).toBe(at('14:00').toISOString());
    expect(res[1].estado).toBe('offline');
    expect(res[1].duracionMs).toBe(120 * 60000);
  });

  it('parte el periodo en los limites exactos de la franja', () => {
    const res = overlay([per('09:00', '16:00')]);
    expect(res.map((p) => [p.desde, p.hasta])).toEqual([
      [at('09:00').toISOString(), at('12:00').toISOString()],
      [at('12:00').toISOString(), at('14:00').toISOString()],
      [at('14:00').toISOString(), at('16:00').toISOString()],
    ]);
    expect(res.reduce((s, p) => s + p.duracionMs, 0)).toBe(7 * 3600000);
  });

  it('conserva el estado original fuera del almuerzo y lo tipifica dentro', () => {
    const res = overlay([per('08:00', '18:00', 'online')]);
    expect(res[0].estado).toBe('online');
    expect(res[0].tipo).toBe('conexion');
    expect(res[1].tipo).toBe('almuerzo');
    expect(res[2].tipo).toBe('conexion');
  });

  it('deja abierto el tramo final cuando hoy el periodo sigue vigente', () => {
    const res = overlay([per('08:00', null, 'online')], [LUNCH], true, at('16:30'));
    expect(res).toHaveLength(3);
    expect(res[2].hasta).toBeNull();
  });

  it('hoy, si el tramo abierto cae dentro del almuerzo, queda abierto en almuerzo', () => {
    const res = overlay([per('08:00', null, 'online')], [LUNCH], true, at('13:00'));
    expect(res).toHaveLength(2);
    expect(res[1].almuerzo).toBe(true);
    expect(res[1].hasta).toBeNull();
    expect(res[1].desde).toBe(at('12:00').toISOString());
  });

  it('no duplica periodos que ya son de almuerzo', () => {
    const ya = per('12:30', '13:30', 'busy', { almuerzo: true, tipo: 'almuerzo_inicio' });
    const res = overlay([per('12:30', '13:30', 'busy', { almuerzo: true, tipo: 'almuerzo_inicio' })]);
    expect(res).toEqual([ya]);
  });

  it('sin franja configurada devuelve los periodos intactos', () => {
    const original = [per('08:00', '18:00')];
    expect(overlay(original, [])).toBe(original);
  });

  it('el almuerzo cuenta como almuerzo y no como inactivo', () => {
    const lunchPeriods = (service as any).periodosFranjaAlmuerzo([LUNCH], false, at('18:00'));
    expect(lunchPeriods).toHaveLength(1);
    expect(lunchPeriods[0].almuerzo).toBe(true);
    expect(lunchPeriods[0].estado).toBe('offline');
    expect(lunchPeriods[0].tipo).toBe('almuerzo');
    expect(lunchPeriods[0].duracionMs).toBe(120 * 60000);
  });

  it('franja futura de hoy no cuenta, y la pasada sí', () => {
    const futuro = (service as any).periodosFranjaAlmuerzo([LUNCH], true, at('10:00'));
    expect(futuro).toHaveLength(0);
    const enCurso = (service as any).periodosFranjaAlmuerzo([LUNCH], true, at('13:00'));
    expect(enCurso[0].hasta).toBeNull();
    const ayer = (service as any).periodosFranjaAlmuerzo([LUNCH], false, at('18:00'));
    expect(ayer[0].hasta).toBe(at('14:00').toISOString());
  });

  it('devuelve la franja solo para el dia de la semana que corresponde', async () => {
    const config = { almuerzos: [{ dia: 1, inicio: '12:00', fin: '14:00' }] };
    // 2026-09-29 es lunes.
    const ok = await (service as any).franjasAlmuerzoDelDia('u1', config, 1, at('00:00'), '2026-09-29', false);
    expect(ok).toEqual([{ ini: at('12:00'), fin: at('14:00') }]);
    const otro = await (service as any).franjasAlmuerzoDelDia('u1', config, 3, at('00:00'), '2026-09-29', false);
    expect(otro).toEqual([]);
    expect(await (service as any).franjasAlmuerzoDelDia('u1', undefined, 1, at('00:00'), '2026-09-29', false)).toEqual([]);
  });

  it('hoy respeta el salto de almuerzo del asesor', async () => {
    const config = { almuerzos: [{ dia: 1, inicio: '12:00', fin: '14:00' }] };
    isLunchSkipped.mockResolvedValue(true);
    const saltado = await (service as any).franjasAlmuerzoDelDia('u1', config, 1, at('00:00'), '2026-09-29', true);
    expect(saltado).toEqual([]);
    expect(isLunchSkipped).toHaveBeenCalledWith('u1', '2026-09-29');
  });

  it('unirRangos fusiona la jornada con la franja de almuerzo', () => {
    const unidos = (service as any).unirRangos([
      { ini: at('14:00'), fin: at('18:00') },
      { ini: at('08:00'), fin: at('12:00') },
      { ini: at('12:00'), fin: at('14:00') },
    ]);
    expect(unidos).toEqual([{ ini: at('08:00'), fin: at('18:00') }]);
  });
});
