import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

@Entity('notifications')
@Index('idx_notifications_recipient', ['recipientId'])
@Index('idx_notifications_recipient_read', ['recipientId', 'read'])
@Index('idx_notifications_created', ['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50, default: 'ticket' })
  entityType: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 36 })
  entityId: string;

  @Column({ name: 'entity_codigo', type: 'varchar', length: 20, nullable: true })
  entityCodigo: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender: User | null;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
