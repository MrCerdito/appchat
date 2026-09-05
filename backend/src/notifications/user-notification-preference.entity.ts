import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

export interface NotificationPreferenceItem {
  inApp: boolean;
  desktop: boolean;
}

export interface NotificationPreferences {
  ticket_created: NotificationPreferenceItem;
  ticket_assigned: NotificationPreferenceItem;
  ticket_reassigned: NotificationPreferenceItem;
  ticket_updated: NotificationPreferenceItem;
  ticket_status_changed: NotificationPreferenceItem;
  ticket_priority_changed: NotificationPreferenceItem;
  ticket_closed: NotificationPreferenceItem;
  ticket_denied: NotificationPreferenceItem;
  ticket_note: NotificationPreferenceItem;
  ticket_deleted: NotificationPreferenceItem;
  ticket_sla_warning: NotificationPreferenceItem;
  ticket_sla_expired: NotificationPreferenceItem;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  ticket_created:        { inApp: true, desktop: true },
  ticket_assigned:       { inApp: true, desktop: true },
  ticket_reassigned:     { inApp: true, desktop: true },
  ticket_updated:        { inApp: true, desktop: true },
  ticket_status_changed: { inApp: true, desktop: true },
  ticket_priority_changed: { inApp: true, desktop: false },
  ticket_closed:         { inApp: true, desktop: true },
  ticket_denied:         { inApp: true, desktop: true },
  ticket_note:           { inApp: true, desktop: false },
  ticket_deleted:        { inApp: true, desktop: false },
  ticket_sla_warning:    { inApp: true, desktop: true },
  ticket_sla_expired:    { inApp: true, desktop: true },
};

@Entity('user_notification_preferences')
export class UserNotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)}'::jsonb`,
  })
  prefs: NotificationPreferences;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
