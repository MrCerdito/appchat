jest.mock('sanitize-html', () => (value: string) => value);

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfiguracionService } from './configuracion.service';
import { Configuracion, HorarioSlot } from './entities/configuracion.entity';

function horario(
  dia: number,
  inicio: string,
  fin: string,
): HorarioSlot {
  return { dia, inicio, fin };
}

describe('ConfiguracionService (horario)', () => {
  let service: ConfiguracionService;
  let repoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    query: jest.Mock;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    repoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      query: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ConfiguracionService,
        {
          provide: getRepositoryToken(Configuracion),
          useValue: repoMock,
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ConfiguracionService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function loadConfig(horarios: HorarioSlot[], horariosActivos = true) {
    repoMock.findOne.mockResolvedValue({
      horarios,
      horariosActivos,
      horarioFueraMsg: 'Estamos fuera del horario de atención.',
    } as any);
  }

  // Lunes 2026-08-03 06:30 (hora local de la máquina de pruebas)
  function setNow(iso: string) {
    jest.setSystemTime(new Date(iso));
  }

  it('desactiva el control de horarios => siempre en jornada', async () => {
    loadConfig([], false);
    setNow('2026-08-03T06:30:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(true);
    expect(estado.proximaTipo).toBe('');
    expect(estado.proximaInicio).toBe('');
  });

  it('dentro de la jornada => enJornada true', async () => {
    loadConfig([horario(1, '08:00', '17:00')]);
    setNow('2026-08-03T12:00:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(true);
    expect(estado.diaHoy).toBe(1);
  });

  it('antes de abrir el mismo dia => proxima apertura hoy', async () => {
    loadConfig([horario(1, '08:00', '17:00')]);
    setNow('2026-08-03T06:30:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(false);
    expect(estado.proximaTipo).toBe('hoy');
    expect(estado.proximaInicio).toBe('08:00');
    expect(estado.proximaDia).toBe(1);
    expect(estado.proximaApertura).toBe('hoy a las 08:00');
  });

  it('despues del cierre => proxima apertura manana', async () => {
    loadConfig([horario(1, '08:00', '17:00'), horario(2, '08:00', '17:00')]);
    setNow('2026-08-03T20:00:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(false);
    expect(estado.proximaTipo).toBe('manana');
    expect(estado.proximaDia).toBe(2);
    expect(estado.proximaInicio).toBe('08:00');
  });

  it('sabado sin horario => proxima apertura el lunes (fecha)', async () => {
    loadConfig([horario(1, '08:00', '17:00')]);
    setNow('2026-08-01T12:00:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(false);
    expect(estado.proximaTipo).toBe('fecha');
    expect(estado.proximaDia).toBe(1);
    expect(estado.proximaApertura).toBe('el lunes a las 08:00');
  });

  it('multi-slot por dia => enJornada si cualquiera cubre la hora', async () => {
    loadConfig([horario(1, '08:00', '12:00'), horario(1, '14:00', '18:00')]);
    setNow('2026-08-03T15:00:00');

    const estado = await service.getHorarioEstado();
    expect(estado.enJornada).toBe(true);
  });

  it('devuelve los horarios ordenados por dia', async () => {
    loadConfig([horario(5, '08:00', '17:00'), horario(1, '08:00', '17:00')]);
    setNow('2026-08-03T20:00:00');

    const estado = await service.getHorarioEstado();
    expect(estado.horarios.map((h) => h.dia)).toEqual([1, 5]);
  });

  it('guardar: dedupe almuerzos por dia (gana el ultimo) y los ordena', async () => {
    const existing = { id: 'cfg', advisorId: null, almuerzos: [] };
    repoMock.findOne.mockResolvedValue(existing);
    repoMock.save.mockImplementation((e) => Promise.resolve(e));

    await service.guardar({
      almuerzos: [
        { dia: 3, inicio: '12:00', fin: '13:00' },
        { dia: 1, inicio: '13:00', fin: '14:00' },
        { dia: 3, inicio: '15:00', fin: '16:00' },
      ],
    }, undefined);

    expect(repoMock.save).toHaveBeenCalled();
    const arg = repoMock.save.mock.calls[0][0];
    expect(arg.almuerzos).toEqual([
      { dia: 1, inicio: '13:00', fin: '14:00' },
      { dia: 3, inicio: '15:00', fin: '16:00' },
    ]);
  });

  it('guardar: descarta almuerzos con horas vacias o rango invertido', async () => {
    const existing = { id: 'cfg', advisorId: null, almuerzos: [] };
    repoMock.findOne.mockResolvedValue(existing);
    repoMock.save.mockImplementation((e) => Promise.resolve(e));

    await service.guardar({
      almuerzos: [
        { dia: 1, inicio: '13:00', fin: '12:00' } as any,
        { dia: 2, inicio: '', fin: '14:00' } as any,
        { dia: 3, inicio: '12:00', fin: '13:00' },
      ],
    }, undefined);

    const arg = repoMock.save.mock.calls[0][0];
    expect(arg.almuerzos).toEqual([{ dia: 3, inicio: '12:00', fin: '13:00' }]);
  });
});
