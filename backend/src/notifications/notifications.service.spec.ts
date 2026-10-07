import { NotificationsService } from './notifications.service';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './user-notification-preference.entity';

describe('NotificationsService correo nuevo', () => {
  const sendToUser = jest.fn();
  const findOneNotification = jest.fn();
  const saveNotification = jest.fn();
  const updateNotification = jest.fn();
  const deleteNotifications = jest.fn();
  const findNotifications = jest.fn();
  const findOnePreference = jest.fn();
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    findOnePreference.mockResolvedValue(null);
    findOneNotification.mockResolvedValue(null);
    saveNotification.mockImplementation(async (row) => ({ id: 'notif-1', ...row }));
    updateNotification.mockResolvedValue({ affected: 1 });
    deleteNotifications.mockResolvedValue({ affected: 1 });
    findNotifications.mockResolvedValue([]);
    service = new NotificationsService(
      {
        findOne: findOneNotification,
        find: findNotifications,
        create: (row: any) => row,
        save: saveNotification,
        update: updateNotification,
        delete: deleteNotifications,
      } as any,
      { findOne: findOnePreference } as any,
      { sendToUser } as any,
    );
  });

  it('envía al socket la notificación de correo recién guardada', async () => {
    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'correo_nuevo',
      title: 'Llegó 1 correo nuevo',
      message: 'Nuevo correo en 10.Jean M.',
      entityType: 'correo',
      entityId: 'mail-local-1',
    });

    expect(result?.id).toBe('notif-1');
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith('advisor-1', expect.objectContaining({
      type: 'correo_nuevo',
      entityType: 'correo',
      entityId: 'mail-local-1',
      _desktop: true,
    }));
  });

  it('usa escritorio y campanita por defecto para avisos de cumpleaños', async () => {
    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'cumpleanos_recordatorio',
      title: 'Mañana cumple Ana Pérez',
      message: 'Cumpleaños en el calendario del equipo · 8 de octubre.',
      entityType: 'calendario',
      entityId: 'd8094b2d-4512-45e8-9253-fb76146acd31',
      meta: { fecha: '2026-10-08', tipoEvento: 'cumpleanos' },
    });

    expect(result?.type).toBe('cumpleanos_recordatorio');
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith('advisor-1', expect.objectContaining({
      type: 'cumpleanos_recordatorio',
      title: 'Mañana cumple Ana Pérez',
      _desktop: true,
    }));
  });

  it('no duplica un aviso de cumpleaños ya persistido al revisar el calendario otra vez', async () => {
    const existente = {
      id: 'notification-cumple',
      type: 'cumpleanos_recordatorio',
      recipientId: 'advisor-1',
      entityType: 'calendario',
      entityId: 'd8094b2d-4512-45e8-9253-fb76146acd31',
    };
    findOneNotification.mockResolvedValueOnce(existente);

    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'cumpleanos_recordatorio',
      title: 'Mañana cumple Ana Pérez',
      message: 'Cumpleaños en el calendario del equipo.',
      entityType: 'calendario',
      entityId: 'd8094b2d-4512-45e8-9253-fb76146acd31',
    });

    expect(result).toBe(existente);
    expect(saveNotification).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('guarda y emite recordatorios de reunión con aviso de escritorio activado', async () => {
    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'reunion_recordatorio',
      title: 'Tu reunión empieza en 5 minutos',
      message: 'Reunión con Ana · 10:30 a. m.',
      entityType: 'meeting',
      entityId: 'meeting-1',
      meta: { joinUrl: 'https://teams.microsoft.com/join/meeting-1' },
    });

    expect(result?.type).toBe('reunion_recordatorio');
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith('advisor-1', expect.objectContaining({
      type: 'reunion_recordatorio',
      entityId: 'meeting-1',
      _desktop: true,
    }));
  });

  it('no vuelve a emitir un recordatorio de reunión ya guardado', async () => {
    const existente = { id: 'meeting-reminder-existing', type: 'reunion_recordatorio' };
    findOneNotification.mockResolvedValueOnce(existente);

    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'reunion_recordatorio',
      title: 'Tu reunión empieza en 5 minutos',
      message: 'Reunión con Ana',
      entityType: 'meeting',
      entityId: 'meeting-1',
    });

    expect(result).toBe(existente);
    expect(saveNotification).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('reutiliza la notificación de correo existente al reintentar el outbox', async () => {
    const existente = { id: 'notif-existente', type: 'correo_nuevo', recipientId: 'advisor-1' };
    findOneNotification.mockResolvedValueOnce(existente);

    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'correo_nuevo',
      title: 'Llegó 1 correo nuevo',
      message: 'Nuevo correo en 10.Jean M.',
      entityType: 'correo',
      entityId: 'mail-local-1',
    });

    expect(result).toMatchObject({
      id: 'notif-existente',
      title: 'Llegó 1 correo nuevo',
      message: 'Nuevo correo en 10.Jean M.',
    });
    expect(saveNotification).not.toHaveBeenCalled();
    expect(updateNotification).toHaveBeenCalledWith(
      { id: 'notif-existente', recipientId: 'advisor-1' },
      expect.objectContaining({ title: 'Llegó 1 correo nuevo' }),
    );
    expect(sendToUser).toHaveBeenCalledWith('advisor-1', expect.objectContaining({
      id: 'notif-existente',
      _desktop: DEFAULT_NOTIFICATION_PREFERENCES.correo_nuevo.desktop,
    }));
  });

  it('no crea ni emite el correo si el usuario desactivó ambos canales', async () => {
    findOnePreference.mockResolvedValueOnce({
      prefs: { correo_nuevo: { inApp: false, desktop: false } },
    });

    const result = await service.create({
      recipientId: 'advisor-1',
      type: 'correo_nuevo',
      title: 'Nuevo correo',
      message: 'Nuevo correo en su carpeta',
      entityType: 'correo',
      entityId: 'mail-local-1',
    });

    expect(result).toBeNull();
    expect(saveNotification).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('marca como leídas solo las notificaciones de la sección Correos', async () => {
    await service.markAllAsRead('advisor-1', 'correos');
    const where = updateNotification.mock.calls[0][0];
    expect(where).toMatchObject({ recipientId: 'advisor-1', read: false });
    expect(where.type.type).toBe('in');
    expect(where.type.value).toEqual(['correo_nuevo']);
  });

  it('borra Otros sin borrar tickets ni correos', async () => {
    await service.removeMany('advisor-1', undefined, 'otros');
    const where = deleteNotifications.mock.calls[0][0];
    expect(where.recipientId).toBe('advisor-1');
    expect(where.type.type).toBe('not');
    expect(where.type.value).toContain('correo_nuevo');
    expect(where.type.value).toContain('ticket_created');
  });

  it('borra automáticamente los avisos de correo con más de 20 minutos', async () => {
    const antes = Date.now();

    await (service as any).eliminarAvisosCorreoVencidos();

    const where = deleteNotifications.mock.calls[0][0];
    expect(where.type).toBe('correo_nuevo');
    const cutoff = where.createdAt.value as Date;
    expect(Math.abs(cutoff.getTime() - (antes - 20 * 60 * 1000))).toBeLessThan(100);
  });

  it('conserva sin leer un aviso agrupado hasta abrir todos sus correos', async () => {
    findNotifications.mockResolvedValueOnce([{
      id: 'notif-batch',
      entityId: 'mail-1',
      recipientId: 'advisor-1',
      read: false,
      meta: { correoIds: ['mail-1', 'mail-2'], correoLeidos: [] },
    }]);

    await service.markCorreoAbierto('mail-1', 'advisor-1');

    expect(updateNotification).toHaveBeenCalledWith(
      { id: 'notif-batch', recipientId: 'advisor-1' },
      expect.objectContaining({
        read: false,
        meta: expect.objectContaining({ correoLeidos: ['mail-1'] }),
      }),
    );
  });

  it('marca como leído el aviso agrupado al abrir el último correo pendiente', async () => {
    findNotifications.mockResolvedValueOnce([{
      id: 'notif-batch',
      entityId: 'mail-2',
      recipientId: 'advisor-1',
      read: false,
      meta: { correoIds: ['mail-1', 'mail-2'], correoLeidos: ['mail-1'] },
    }]);

    await service.markCorreoAbierto('mail-2', 'advisor-1');

    expect(updateNotification).toHaveBeenCalledWith(
      { id: 'notif-batch', recipientId: 'advisor-1' },
      expect.objectContaining({
        read: true,
        readAt: expect.any(Date),
        meta: expect.objectContaining({ correoLeidos: ['mail-1', 'mail-2'] }),
      }),
    );
  });

  it('desagrupa los avisos antiguos y conserva leído individual por correo', async () => {
    const creado = new Date('2026-10-01T10:00:00Z');
    findNotifications.mockResolvedValueOnce([{
      id: 'notif-batch',
      type: 'correo_nuevo',
      title: '2 correos nuevos',
      message: 'Hay 2 correos nuevos en Bandeja.',
      entityType: 'correo',
      entityId: 'mail-2',
      entityCodigo: null,
      recipientId: 'advisor-1',
      senderId: null,
      read: false,
      readAt: null,
      createdAt: creado,
      meta: {
        correoIds: ['mail-1', 'mail-2'],
        correoLeidos: ['mail-1'],
        carpeta: 'Bandeja',
        asunto: 'Factura de octubre',
        remitenteNombre: 'Ana Pérez',
        remitenteEmail: 'ana@example.com',
      },
    }]);

    await (service as any).desagruparAvisosCorreoExistentes();

    expect(updateNotification).toHaveBeenCalledWith(
      { id: 'notif-batch' },
      expect.objectContaining({
        entityId: 'mail-2',
        title: 'Factura de octubre',
        message: 'De: Ana Pérez <ana@example.com>',
        read: false,
        meta: expect.objectContaining({ correoIds: ['mail-2'], nuevos: 1 }),
      }),
    );
    expect(saveNotification).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'mail-1',
      read: true,
      readAt: creado,
      createdAt: creado,
      title: 'Correo recibido',
      message: 'De: Ana Pérez <ana@example.com>',
      meta: expect.objectContaining({ correoIds: ['mail-1'], nuevos: 1 }),
    }));
  });
});
