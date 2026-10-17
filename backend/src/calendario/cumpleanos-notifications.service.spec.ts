import { CumpleanosNotificationsService } from './cumpleanos-notifications.service';

describe('CumpleanosNotificationsService', () => {
  const obtenerCalendario = jest.fn();
  const buscarAsesores = jest.fn();
  const crearNotificacion = jest.fn();
  let service: CumpleanosNotificationsService;

  const evento = (
    fecha: string,
    subject: string,
    categorias: string[],
    eventId = `event-${fecha}-${subject}`,
    isCancelled = false,
  ) => ({
    eventId,
    subject,
    startDateTime: `${fecha}T05:00:00.000Z`,
    endDateTime: `${fecha}T06:00:00.000Z`,
    categorias,
    isAllDay: true,
    isCancelled,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    obtenerCalendario.mockResolvedValue({ eventos: [] });
    buscarAsesores.mockResolvedValue([{ id: 'advisor-1' }, { id: 'advisor-2' }]);
    crearNotificacion.mockResolvedValue({ id: 'notification-id' });
    service = new CumpleanosNotificationsService(
      { obtener: obtenerCalendario } as any,
      { create: crearNotificacion } as any,
      { find: buscarAsesores } as any,
    );
  });

  it('avisa en campanita a los asesores el día hábil anterior al cumpleaños', async () => {
    obtenerCalendario.mockResolvedValueOnce({
      eventos: [
        evento('2026-10-08', 'Cumpleaños de Ana Pérez', ['Green category'], 'birthday-ana'),
        evento('2026-10-08', 'Reunión virtual', ['Blue category'], 'virtual-meeting'),
        evento('2026-10-08', 'Cumpleaños cancelado', ['Green category'], 'cancelled', true),
      ],
    });

    await service.procesarCumpleanos(new Date('2026-10-07T09:00:00.000Z'));

    expect(obtenerCalendario).toHaveBeenCalledWith(
      '2026-10-08T05:00:00.000Z',
      '2026-10-11T05:00:00.000Z',
    );
    expect(crearNotificacion).toHaveBeenCalledTimes(2);
    expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cumpleanos_recordatorio',
      title: 'Mañana cumple Ana Pérez',
      entityType: 'calendario',
      recipientId: 'advisor-1',
      message: expect.stringContaining('8 de octubre'),
    }));
  });

  it('adelanta al viernes el aviso de cumpleaños del domingo y lo identifica por nombre', async () => {
    obtenerCalendario.mockResolvedValueOnce({
      eventos: [evento('2026-10-11', 'Birthday of Diego Ruiz', ['Green category'], 'birthday-diego')],
    });
    buscarAsesores.mockResolvedValueOnce([{ id: 'advisor-1' }]);

    await service.procesarCumpleanos(new Date('2026-10-09T09:00:00.000Z'));

    expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
      title: 'El domingo cumple Diego Ruiz',
    }));
  });

  it('no revisa el calendario durante fines de semana ni antes de la jornada', async () => {
    await (service as any).revisar(new Date('2026-10-10T14:00:00.000Z')); // sábado, 9 a. m. Bogotá
    await (service as any).revisar(new Date('2026-10-09T12:00:00.000Z')); // viernes, 7 a. m. Bogotá

    expect(obtenerCalendario).not.toHaveBeenCalled();
    expect(crearNotificacion).not.toHaveBeenCalled();
  });
});
