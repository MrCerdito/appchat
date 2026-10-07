import { MeetingReminderService } from './meeting-reminder.service';

describe('MeetingReminderService', () => {
  const findMeetings = jest.fn();
  const findUsers = jest.fn();
  const createNotification = jest.fn();
  let service: MeetingReminderService;

  const meeting = (overrides: Record<string, unknown> = {}) => ({
    id: 'meeting-1',
    createdBy: 'creator-1',
    createdByName: 'Jean',
    subject: 'Reunión con Ana',
    startDateTime: new Date('2026-10-07T15:05:00.000Z'),
    endDateTime: new Date('2026-10-07T15:35:00.000Z'),
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/meeting-1',
    eventId: 'graph-event-1',
    categories: ['Yellow category'],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findMeetings.mockResolvedValue([]);
    findUsers.mockResolvedValue([{ id: 'advisor-1' }, { id: 'advisor-2' }]);
    createNotification.mockResolvedValue({ id: 'notification-1' });
    service = new MeetingReminderService(
      { find: findMeetings } as any,
      { find: findUsers } as any,
      { create: createNotification } as any,
      { query: jest.fn() } as any,
    );
  });

  it('envía una reunión personal solo a su creador cinco minutos antes', async () => {
    findMeetings.mockResolvedValueOnce([meeting()]);

    await service.procesarRecordatorios(new Date('2026-10-07T15:00:00.000Z'));

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'creator-1',
      type: 'reunion_recordatorio',
      title: 'Tu reunión empieza en 5 minutos',
      entityType: 'meeting',
      entityId: 'meeting-1',
      meta: expect.objectContaining({
        subject: 'Reunión con Ana',
        joinUrl: 'https://teams.microsoft.com/l/meetup-join/meeting-1',
        fecha: '2026-10-07',
      }),
    }));
  });

  it('avisa a todos los asesores activos para una reunión de equipo', async () => {
    findMeetings.mockResolvedValueOnce([meeting({ categories: ['Purple category'] })]);

    await service.procesarRecordatorios(new Date('2026-10-07T15:00:00.000Z'));

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification.mock.calls.map(([dto]) => dto.recipientId)).toEqual([
      'advisor-1',
      'advisor-2',
    ]);
    expect(createNotification.mock.calls[0][0].title).toBe('Reunión de equipo en 5 minutos');
  });

  it('no avisa si no hay creador ni enlace para unirse', async () => {
    findMeetings.mockResolvedValueOnce([
      meeting({ createdBy: null }),
      meeting({ id: 'without-link', joinUrl: '' }),
    ]);

    await service.procesarRecordatorios(new Date('2026-10-07T15:00:00.000Z'));

    expect(createNotification).not.toHaveBeenCalled();
  });
});
