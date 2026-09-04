import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

@Entity('tickets')
@Index('idx_tickets_status', ['status'])
@Index('idx_tickets_priority', ['priority'])
@Index('idx_tickets_source', ['sourceType', 'sourceId'])
@Index('idx_tickets_assigned', ['assignedTo'])
@Index('idx_tickets_created_by', ['createdBy'])
@Index('idx_tickets_status_created_at', ['status', 'createdAt'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: string;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  priority: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'varchar', length: 64, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  institucion: string | null;

  @Column({ type: 'varchar', length: 20, default: 'web' })
  canal: string;

  @Column({ type: 'jsonb', nullable: true })
  conversation: any[] | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User | null;

  @Column({
    name: 'assigned_to_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  assignedToName: string | null;

  @Column({ name: 'client_name', type: 'varchar', length: 255 })
  clientName: string;

  @Column({ type: 'jsonb', nullable: true })
  clientInfo: Record<string, any> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'closed_at', nullable: true, type: 'timestamptz' })
  closedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'closed_by_id' })
  closedBy: User | null;

  // ── SLA ────────────────────────────────────────────────────────────────────
  @Column({ name: 'sla_deadline', type: 'timestamptz', nullable: true })
  slaDeadline: Date | null;

  @Column({ name: 'sla_alerted_at', type: 'timestamptz', nullable: true })
  slaAlertedAt: Date | null;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ name: 'total_paused_ms', type: 'int', default: 0 })
  totalPausedMs: number;

  @Column({ type: 'jsonb', nullable: true })
  notes: any[] | null;
}
