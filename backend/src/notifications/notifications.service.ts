import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
    return this.notifRepo.count({ where: { recipientId: userId, read: false } });
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await this.notifRepo.update(
      { id, recipientId: userId },
      { read: true, readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notifRepo.update(
      { recipientId: userId, read: false },
      { read: true, readAt: new Date() },
    );
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
