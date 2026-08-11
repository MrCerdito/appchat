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

  it('getEfectiva: el override de asesor solo aporta almuerzos, el resto es global', async () => {
    const global = {
      id: 'global',
      advisorId: null,
      mensajeBienvenida: 'Bienvenido global',
      asesorInactividadSeg: 120,
      asesorInactividadMsg: 'mensaje asesor global',
      clienteInactividadSeg: 180,
      clienteInactividadIters: 2,
      clienteInactividadMsg: 'aviso global',
      clienteCierreMsg: 'cierre global',
      horarios: [],
      horariosActivos: true,
      horarioFueraMsg: '',
      almuerzos: [],
      whatsappAssignmentMsg: '',
      whatsappQueueMsg: '',
      whatsappOutOfHoursMsg: '',
      whatsappCallUnavailableMsg: '',
      whatsappQuickReplies: [],
      whatsappMaxActiveChatsPerAdvisor: 3,
      sonidoActivado: true,
      sonidoWhatsapp: 'whatsapp1',
      sonidoAsesor: 'asesor1',
      sonidoCliente: 'cliente1',
      sonidoAsignacion: 'asignacion1',
      aiPromptConfig: null,
      asesorReconexionSeg: 120,
      asesorReconexionMsg: '',
      ticketCategories: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const override = {
      ...global,
      id: 'override-id',
      advisorId: 'advisor-1',
      mensajeBienvenida: 'Bienvenida vieja del asesor',
      asesorInactividadSeg: 999,
      clienteInactividadSeg: 999,
      almuerzos: [{ dia: 3, inicio: '12:00', fin: '13:00' }],
    } as any;

    repoMock.findOne.mockImplementation((opts: any) => {
      if (opts?.where?.advisorId === 'advisor-1') return Promise.resolve(override);
      return Promise.resolve(global);
    });

    const efectiva = await service.getEfectiva('advisor-1');

    expect(efectiva.mensajeBienvenida).toBe('Bienvenido global');
    expect(efectiva.asesorInactividadSeg).toBe(120);
    expect(efectiva.clienteInactividadSeg).toBe(180);
    expect(efectiva.clienteInactividadIters).toBe(2);
    expect(efectiva.almuerzos).toEqual([
      { dia: 3, inicio: '12:00', fin: '13:00' },
    ]);
    expect(efectiva.advisorId).toBe('advisor-1');
  });

  it('getEfectiva: sin override devuelve la configuracion global', async () => {
    const global = {
      id: 'global',
      advisorId: null,
      mensajeBienvenida: 'Bienvenido global',
      asesorInactividadSeg: 120,
      clienteInactividadSeg: 180,
      almuerzos: [],
    } as any;

    repoMock.findOne.mockImplementation((opts: any) => {
      if (opts?.where?.advisorId) return Promise.resolve(null);
      return Promise.resolve(global);
    });

    const efectiva = await service.getEfectiva('advisor-sin-override');

    expect(efectiva.mensajeBienvenida).toBe('Bienvenido global');
    expect(efectiva.almuerzos).toEqual([]);
  });
});
