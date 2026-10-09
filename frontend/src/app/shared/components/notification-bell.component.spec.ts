import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBellComponent } from './notification-bell.component';

describe('NotificationBellComponent meeting reminders', () => {
  let component: NotificationBellComponent;
  let notifications: any[];
  let navigate: ReturnType<typeof vi.fn>;
  let markAsRead: ReturnType<typeof vi.fn>;
  let sound: { playMeetingReminder: ReturnType<typeof vi.fn>; playMeetingReminderUrgent: ReturnType<typeof vi.fn> };

  const reminder = (startDateTime: string) => ({
    id: 'reminder-1',
    type: 'reunion_recordatorio',
    title: 'Tu reunión empieza en 5 minutos',
    message: 'Reunión con Ana · 10:30 a. m.',
    entityType: 'meeting',
    entityId: 'meeting-1',
    entityCodigo: null,
    recipientId: 'advisor-1',
    senderId: null,
    read: false,
    readAt: null,
    meta: {
      fecha: '2026-10-07',
      subject: 'Reunión con Ana',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/meeting-1',
      startDateTime,
    },
    createdAt: '2026-10-07T14:55:00.000Z',
  });

  beforeEach(() => {
    vi.useRealTimers();
    notifications = [];
    navigate = vi.fn();
    markAsRead = vi.fn(() => of(undefined));
    sound = { playMeetingReminder: vi.fn(), playMeetingReminderUrgent: vi.fn() };

    // Estos métodos no necesitan el render de Angular para comprobar las
    // acciones que descartan y navegan desde la tarjeta del recordatorio.
    component = Object.create(NotificationBellComponent.prototype);
    Object.assign(component as any, {
      svc: { notifications: () => notifications, markAsRead },
      router: { navigate },
      cdr: { markForCheck: vi.fn() },
      sound,
      userRole: 'advisor',
      panelOpen: true,
      selectedIds: new Set<string>(),
      offsets: new Map<string, number>(),
      meetingRemindersDismissed: new Set<string>(),
      activeMeetingReminderId: null,
      nextMeetingReminderSoundAt: 0,
      meetingReminderAlarmUrgent: false,
    });
  });

  it('muestra un contador descendente y cambia a alarma urgente al llegar a cero', () => {
    vi.useFakeTimers();
    const ahora = new Date('2026-10-07T15:00:00.000Z');
    vi.setSystemTime(ahora);
    const aviso = reminder(new Date(ahora.getTime() + 5 * 60_000).toISOString());
    notifications = [aviso];

    expect(component.meetingReminderCountdown(aviso)).toBe('Faltan 05:00');
    (component as any).tickMeetingReminder();
    expect(sound.playMeetingReminder).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(ahora.getTime() + 5 * 60_000));
    (component as any).tickMeetingReminder();
    expect(sound.playMeetingReminderUrgent).toHaveBeenCalledTimes(1);
  });

  it('al abrir el calendario marca leído, cierra el aviso y selecciona el día de la reunión', () => {
    const aviso = reminder('2026-10-07T15:05:00.000Z');
    component.openMeetingCalendar(aviso as any);

    expect(markAsRead).toHaveBeenCalledWith(aviso.id);
    expect(navigate).toHaveBeenCalledWith(['/dashboard/calendario'], {
      queryParams: { fecha: '2026-10-07' },
    });
    expect(component.panelOpen).toBe(false);
    expect((component as any).meetingRemindersDismissed.has(aviso.id)).toBe(true);
  });

  it('al entrar a Teams abre el enlace y descarta el recordatorio', () => {
    const aviso = reminder('2026-10-07T15:05:00.000Z');
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);

    component.joinMeeting(aviso as any);

    expect(abrir).toHaveBeenCalledWith(
      'https://teams.microsoft.com/l/meetup-join/meeting-1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(markAsRead).toHaveBeenCalledWith(aviso.id);
    expect((component as any).meetingRemindersDismissed.has(aviso.id)).toBe(true);
    abrir.mockRestore();
  });
});
