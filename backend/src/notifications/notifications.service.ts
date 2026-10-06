import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Notification } from './notification.entity';
import {
  UserNotificationPreference,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
} from './user-notification-preference.entity';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationDto {
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId: string;
  entityCodigo?: string;
  recipientId: string;
  senderId?: string;
  meta?: Record<string, any>;
}

export type NotificationSection = 'tickets' | 'correos' | 'otros';

const TIPOS_TICKETS = [
  'ticket_created', 'ticket_assigned', 'ticket_reassigned', 'ticket_updated',
  'ticket_status_changed', 'ticket_priority_changed', 'ticket_closed',
  'ticket_denied', 'ticket_note', 'ticket_deleted', 'ticket_sla_warning',
  'ticket_sla_expired',
];
const TIPOS_CORREO = ['correo_nuevo'];
const TIPOS_PRINCIPALES = [...TIPOS_TICKETS, ...TIPOS_CORREO];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(UserNotificationPreference)
    private readonly prefRepo: Repository<UserNotificationPreference>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification | null> {
    const prefs = await this.getPreferences(dto.recipientId);
    const eventPrefs = prefs[dto.type as keyof NotificationPreferences];

    if (!eventPrefs) {
      this.logger.warn(`Unknown notification type: ${dto.type}`);
      return null;
    }

    if (!eventPrefs.inApp && !eventPrefs.desktop) return null;

    // A correo outbox may retry after the notification row was saved but before
    // its delivery checkpoint was updated. Reuse and re-emit the saved row so a
    // transient gateway/database error cannot create duplicate bell entries.
    if (dto.type === 'correo_nuevo' && dto.entityId) {
      const existing = await this.notifRepo.findOne({
        where: {
          recipientId: dto.recipientId,
          type: dto.type,
          entityType: dto.entityType ?? 'ticket',
          entityId: dto.entityId,
        },
      });
      if (existing) {
        this.gateway.sendToUser(dto.recipientId, {
          ...existing,
          _desktop: eventPrefs.desktop,
        });
        return existing;
      }
    }

    const notif = this.notifRepo.create({
      type: dto.type,
      title: dto.title,
      message: dto.message,
      entityType: dto.entityType ?? 'ticket',
      entityId: dto.entityId,
      entityCodigo: dto.entityCodigo ?? null,
      recipientId: dto.recipientId,
      senderId: dto.senderId ?? null,
      meta: dto.meta ?? null,
    });

    const saved = await this.notifRepo.save(notif);

    this.gateway.sendToUser(dto.recipientId, {
      ...saved,
      _desktop: eventPrefs.desktop,
    });

    return saved;
  }

  async createMany(dtos: CreateNotificationDto[]): Promise<void> {
    for (const dto of dtos) {
      await this.create(dto);
    }
  }

  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const [data, total] = await this.notifRepo.findAndCount({
      where: { recipientId: userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notifRepo.count({
      where: { recipientId: userId, read: false },
    });

    return { data, total, unreadCount };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({
      where: { recipientId: userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await this.notifRepo.update(
      { id, recipientId: userId },
      { read: true, readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string, section?: NotificationSection): Promise<void> {
    const where: any = { recipientId: userId, read: false };
    this.aplicarSeccion(where, section);
    await this.notifRepo.update(where, { read: true, readAt: new Date() });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.notifRepo.delete({ id, recipientId: userId });
  }

  async removeMany(
    userId: string,
    ids?: string[],
    section?: NotificationSection,
  ): Promise<{ removed: number }> {
    const where: any = { recipientId: userId };
    if (ids && ids.length) where.id = In(ids);
    this.aplicarSeccion(where, section);
    const result = await this.notifRepo.delete(where);
    return { removed: result.affected ?? 0 };
  }

  /**
   * Un aviso agrupado de correo solo se lee desde la bandeja, al abrir mensajes
   * que pertenecen a esa tanda. Si incluye varios, permanece sin leer hasta que
   * se hayan abierto todos desde la aplicación.
   */
  async markCorreoAbierto(correoId: string, userId: string): Promise<void> {
    const pendientes = await this.notifRepo.find({
      where: { recipientId: userId, type: 'correo_nuevo', entityType: 'correo', read: false },
    });
    const ahora = new Date();
    for (const notif of pendientes) {
      const idsMeta = notif.meta?.['correoIds'];
      const ids = Array.isArray(idsMeta) && idsMeta.length
        ? idsMeta.filter((id): id is string => typeof id === 'string')
        : [notif.entityId];
      if (!ids.includes(correoId)) continue;
      const abiertosMeta = notif.meta?.['correoLeidos'];
      const abiertos = new Set<string>(
        Array.isArray(abiertosMeta) ? abiertosMeta.filter((id): id is string => typeof id === 'string') : [],
      );
      abiertos.add(correoId);
      const todosAbiertos = ids.every((id) => abiertos.has(id));
      await this.notifRepo.update(
        { id: notif.id, recipientId: userId },
        {
          read: todosAbiertos,
          readAt: todosAbiertos ? ahora : null,
          meta: { ...(notif.meta ?? {}), correoLeidos: [...abiertos] },
        },
      );
    }
  }

  /** Añade el filtro de sección a un criterio TypeORM sin perder compatibilidad con acciones globales. */
  private aplicarSeccion(where: Record<string, unknown>, section?: NotificationSection): void {
    if (!section) return;
    if (section === 'tickets') where['type'] = In(TIPOS_TICKETS);
    else if (section === 'correos') where['type'] = In(TIPOS_CORREO);
    else where['type'] = Not(In(TIPOS_PRINCIPALES));
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const pref = await this.prefRepo.findOne({ where: { userId } });
    if (!pref?.prefs) return DEFAULT_NOTIFICATION_PREFERENCES;
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...pref.prefs };
  }

  async updatePreferences(
    userId: string,
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    let existing = await this.prefRepo.findOne({ where: { userId } });
    if (existing) {
      existing.prefs = prefs;
      await this.prefRepo.save(existing);
    } else {
      existing = this.prefRepo.create({ userId, prefs });
      await this.prefRepo.save(existing);
    }
    return prefs;
  }

  async shouldNotify(
    userId: string,
    eventType: string,
  ): Promise<{ inApp: boolean; desktop: boolean }> {
    const prefs = await this.getPreferences(userId);
    const eventPrefs = prefs[eventType as keyof NotificationPreferences];
    return eventPrefs ?? { inApp: false, desktop: false };
  }
}
