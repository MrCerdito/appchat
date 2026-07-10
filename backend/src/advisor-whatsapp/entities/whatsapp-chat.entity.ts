import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { WhatsappMessage } from './whatsapp-message.entity';

export type WhatsappChatStatus = 'waiting' | 'active' | 'closed';
export type WhatsappOperationalStatus =
  | 'new'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_technical'
  | 'resolved'
  | 'closed';

export type WhatsappAssignmentMode =
  | 'auto'
  | 'manual'
  | 'admin'
  | 'fixed'
  | 'temporary';

@Entity('whatsapp_chats')
@Index('idx_whatsapp_chats_assigned_advisor_id', ['assignedAdvisor'])
@Index('idx_whatsapp_chats_fixed_advisor_id', ['fixedAdvisor'])
@Index('idx_whatsapp_chats_status', ['status'])
@Index('idx_whatsapp_chats_operational_status', ['operationalStatus'])
@Index('idx_whatsapp_chats_assigned_advisor_id_status', [
  'assignedAdvisor',
  'status',
])
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  phone: string;

  @Index('idx_whatsapp_chats_jid_unique', {
    unique: true,
    where: '"jid" IS NOT NULL',
  })
  @Column({ type: 'varchar', length: 100, nullable: true })
  jid: string | null;

  @Column({ name: 'is_group', type: 'boolean', default: false })
  isGroup: boolean;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'profile_picture_url', type: 'text', nullable: true })
  profilePictureUrl: string | null;

  @Column({ type: 'varchar', length: 120, default: 'Cliente WhatsApp' })
  role: string;

  @Column({ type: 'varchar', length: 160, default: 'WhatsApp' })
  institution: string;

  @Column({
    name: 'institution_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  institutionUrl: string | null;

  @Column({ type: 'varchar', length: 120, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 120, default: 'WhatsApp' })
  plan: string;

  @Column({ type: 'jsonb', default: () => '\'["Atencion"]\'::jsonb' })
  modules: string[];

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status: WhatsappChatStatus;

  @Column({
    name: 'operational_status',
    type: 'varchar',
    length: 30,
    default: 'new',
  })
  operationalStatus: WhatsappOperationalStatus;

  @Column({
    name: 'operational_status_updated_at',
    nullable: true,
    type: 'timestamp',
  })
  operationalStatusUpdatedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_advisor_id' })
  assignedAdvisor: User | null;

  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  notes: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ name: 'last_message_at', nullable: true, type: 'timestamp' })
  lastMessageAt: Date | null;

  @Column({ name: 'last_client_message_at', nullable: true, type: 'timestamp' })
  lastClientMessageAt: Date | null;

  @Column({ name: 'assigned_at', nullable: true, type: 'timestamp' })
  assignedAt: Date | null;

  @Column({
    name: 'assignment_mode',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  assignmentMode: WhatsappAssignmentMode | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fixed_advisor_id' })
  fixedAdvisor: User | null;

  @Column({ name: 'queue_notice_sent', type: 'boolean', default: false })
  queueNoticeSent: boolean;

  @Column({ name: 'out_of_hours_notice_sent', type: 'boolean', default: false })
  outOfHoursNoticeSent: boolean;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: 'low' | 'normal' | 'high' | 'critical';

  @OneToMany(() => WhatsappMessage, (message) => message.chat)
  messages: WhatsappMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
