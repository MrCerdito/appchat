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

    expect(result).toBe(existente);
    expect(saveNotification).not.toHaveBeenCalled();
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
});
