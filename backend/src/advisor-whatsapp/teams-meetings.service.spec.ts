import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { TeamsMeetingsService } from './teams-meetings.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

describe('TeamsMeetingsService subject creator prefix', () => {
  let service: TeamsMeetingsService;

  beforeEach(() => {
    service = new TeamsMeetingsService({} as any, {} as any, {} as any);
  });

  it.each([
    ['Reunion presencial'],
    ['Reunion virtual'],
    ['Yellow category'],
    ['Blue category'],
  ])('adds the creator name to in-person/virtual category %s', (category) => {
    const result = (service as any).subjectConAsesor(
      'Reunion con tal persona',
      { name: 'Jean Munoz' },
      [category],
    );

    expect(result).toBe('(Jean Munoz) Reunion con tal persona');
  });

  it.each([
    ['Cumpleanos'],
    ['Green category'],
    ['Reunion equipo'],
    ['Purple category'],
  ])(
    'does not add the creator name to birthdays/team events in %s',
    (category) => {
      const result = (service as any).subjectConAsesor(
        'Cumpleaños de Ana',
        { name: 'Jean Munoz' },
        [category],
      );

      expect(result).toBe('Cumpleaños de Ana');
    },
  );

  it('removes a pre-existing creator prefix from birthdays and team events', () => {
    const result = (service as any).subjectConAsesor(
      '(Jean Munoz) Reunion de equipo',
      { name: 'Jean Munoz' },
      ['Purple category'],
    );

    expect(result).toBe('Reunion de equipo');
  });

  it('requests delegated Group.ReadWrite.All and uses the configured app tenant as OAuth fallback', () => {
    const config = {
      get: (key: string) =>
        (
          ({
            MICROSOFT_CLIENT_ID: 'korvix-client-id',
            MICROSOFT_APP_TENANT_ID: 'innovacloud-tenant-id',
            MICROSOFT_REDIRECT_URI:
              'https://api.example.com/advisors-whatsapp/teams/oauth/callback',
          }) as Record<string, string>
        )[key],
    };
    const authService = new TeamsMeetingsService(
      config as any,
      {} as any,
      {} as any,
    );

    const authUrl = new URL(authService.createAuthUrl('advisor-1').authUrl);

    expect(authUrl.pathname).toBe(
      '/innovacloud-tenant-id/oauth2/v2.0/authorize',
    );
    expect(authUrl.searchParams.get('client_id')).toBe('korvix-client-id');
    expect(authUrl.searchParams.get('scope')?.split(' ')).toContain(
      'Group.ReadWrite.All',
    );
  });
});

describe('TeamsMeetingsService gestion de reuniones creadas en la app', () => {
  const creador = { id: 'adv-1', name: 'Jean Munoz', email: 'jean@x.com' };

  function fila(overrides: Record<string, unknown> = {}) {
    return {
      id: 'm1',
      createdBy: creador.id,
      createdByName: creador.name,
      subject: '(Jean Munoz) Reunion con Ana',
      categories: ['Reunion virtual'],
      startDateTime: new Date('2026-10-10T15:00:00.000Z'),
      endDateTime: new Date('2026-10-10T15:30:00.000Z'),
      durationMinutes: 30,
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/x',
      meetingId: null,
      eventId: 'evt-1',
      calendarTarget: 'shared',
      eventSource: 'shared-mailbox',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      ...overrides,
    };
  }

  function buildService(reunion: Record<string, unknown> | null) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(reunion),
      save: jest.fn().mockImplementation((row: any) => Promise.resolve(row)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new TeamsMeetingsService(
      { get: () => undefined } as any,
      {} as any,
      repo as any,
    );
    return { service: service as any, repo };
  }

  const input = {
    subject: 'Reunion con Ana',
    startDateTime: '2026-10-10T16:00:00.000Z',
    durationMinutes: 45,
  };

  it('no deja que otro asesor edite la reunion', async () => {
    const { service } = buildService(fila());

    await expect(
      service.updateMeeting({ id: 'adv-2', role: 'advisor' }, 'm1', input),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no deja que otro asesor elimine la reunion', async () => {
    const { service, repo } = buildService(fila());

    await expect(
      service.deleteMeeting({ id: 'adv-2', role: 'advisor' }, 'm1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el registro local ya no existe', async () => {
    const { service } = buildService(null);

    await expect(
      service.updateMeeting({ ...creador, role: 'advisor' }, 'm1', input),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.deleteMeeting({ ...creador, role: 'advisor' }, 'm1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mueve el evento en Microsoft antes de guardar la fila', async () => {
    const { service, repo } = buildService(fila());
    const order: string[] = [];
    jest.spyOn(service, 'updateCalendarEvent').mockImplementation(async () => {
      order.push('graph');
      return undefined as any;
    });
    repo.save.mockImplementation(async (row: any) => {
      order.push('db');
      return row;
    });

    const dto = await service.updateMeeting(
      { ...creador, role: 'advisor' },
      'm1',
      input,
    );

    expect(order).toEqual(['graph', 'db']);
    expect(dto.subject).toBe('(Jean Munoz) Reunion con Ana');
    expect(dto.durationMinutes).toBe(45);
    expect(new Date(dto.startDateTime).toISOString()).toBe(
      '2026-10-10T16:00:00.000Z',
    );
    expect(new Date(dto.endDateTime).toISOString()).toBe(
      '2026-10-10T16:45:00.000Z',
    );
  });

  it('elimina el evento de Microsoft y despues la fila local', async () => {
    const { service, repo } = buildService(fila());
    const order: string[] = [];
    jest.spyOn(service, 'deleteCalendarEvent').mockImplementation(async () => {
      order.push('graph');
      return undefined as any;
    });
    repo.delete.mockImplementation(async () => {
      order.push('db');
      return { affected: 1 };
    });

    const result = await service.deleteMeeting(
      { ...creador, role: 'advisor' },
      'm1',
    );

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(['graph', 'db']);
    expect(repo.delete).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('un administrador puede editar lo que creo otro asesor', async () => {
    const { service } = buildService(fila());
    jest
      .spyOn(service, 'updateCalendarEvent')
      .mockResolvedValue(undefined as any);

    await expect(
      service.updateMeeting({ id: 'admin-1', role: 'admin' }, 'm1', input),
    ).resolves.toMatchObject({ durationMinutes: 45 });
  });

  it('rechaza ediciones sin nombre o con fecha invalida', async () => {
    const { service } = buildService(fila());

    await expect(
      service.updateMeeting({ ...creador, role: 'advisor' }, 'm1', {
        ...input,
        subject: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateMeeting({ ...creador, role: 'advisor' }, 'm1', {
        ...input,
        startDateTime: 'ayer',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si no sabe en que calendario quedo el evento, deduce el buzon compartido', () => {
    const { service } = buildService(fila());
    const sinFuente = fila({ eventSource: null });

    expect(service.eventSourceOf(sinFuente)).toBe('group');
    expect(service.puedeEstarEnBuzon(sinFuente)).toBe(true);
    expect(service.puedeEstarEnBuzon(fila({ eventSource: 'group' }))).toBe(
      false,
    );
    expect(service.eventSourceOf(fila({ eventSource: 'personal' }))).toBe(
      'personal',
    );
    expect(
      service.eventSourceOf(
        fila({ eventSource: null, calendarTarget: 'none' }),
      ),
    ).toBe('none');
    expect(
      service.eventSourceOf(
        fila({ eventSource: null, calendarTarget: 'personal' }),
      ),
    ).toBe('personal');
  });
});

describe('TeamsMeetingsService calendario compartido queda con un solo registro', () => {
  const asesor = { id: 'adv-1', name: 'Jean Munoz', email: 'jean@x.com' };
  const contacto = {
    name: 'Ana Torres',
    role: 'Directora',
    institution: 'Colegio Norte',
    phone: '3001112233',
    email: 'ana@x.com',
  };
  const inicio = new Date('2026-10-10T15:00:00.000Z');
  const fin = new Date('2026-10-10T15:30:00.000Z');
  const mockedPost = axios.post as jest.Mock;

  function servicio() {
    const config = {
      get: (key: string) =>
        (
          {
            TEAMS_GROUP_ID: '11111111-1111-1111-1111-111111111111',
            TEAMS_MEETINGS_ACCOUNT: 'soporte@innovacloud.co',
          } as Record<string, string>
        )[key],
    };
    return new TeamsMeetingsService(config as any, {} as any, {} as any);
  }

  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('crea el evento del grupo con el contacto pero sin invitar al asesor', async () => {
    const service = servicio();
    (service as any).getAccessToken = jest.fn().mockResolvedValue('token');
    mockedPost.mockResolvedValue({
      data: {
        id: 'evt-grupo',
        start: { dateTime: '2026-10-10T10:00:00' },
        end: { dateTime: '2026-10-10T10:30:00' },
        onlineMeeting: {
          id: 'mtg-1',
          joinUrl: 'https://teams.microsoft.com/l/meetup-join/x',
        },
      },
    });

    const result = await (service as any).createGroupMeeting(
      asesor.id,
      asesor,
      '(Jean Munoz) Reunion',
      inicio,
      fin,
      'shared',
      contacto,
    );

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][1].attendees).toEqual([
      { emailAddress: { address: 'ana@x.com' }, type: 'optional' },
    ]);
    expect(result.eventSource).toBe('group');
    expect(result.joinUrl).toBe('https://teams.microsoft.com/l/meetup-join/x');
  });

  it('crea el evento en el buzon compartido sin ningun invitado', async () => {
    const service = servicio();
    (service as any).getAppAccessToken = jest
      .fn()
      .mockResolvedValue('app-token');
    (service as any).resolveAccountId = jest
      .fn()
      .mockResolvedValue('soporte@innovacloud.co');
    mockedPost.mockResolvedValue({
      data: {
        id: 'evt-buzon',
        onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/y' },
      },
    });

    const result = await (service as any).createSharedMailboxMeeting(
      asesor,
      '(Jean Munoz) Reunion',
      inicio,
      fin,
      'shared',
      contacto,
    );

    expect(mockedPost.mock.calls[0][0]).toContain(
      '/users/soporte%40innovacloud.co/events',
    );
    expect(mockedPost.mock.calls[0][1].attendees).toEqual([]);
    expect(result.eventSource).toBe('shared-mailbox');
  });
});
