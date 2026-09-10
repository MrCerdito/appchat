import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('session_assignment_events')
@Index('idx_session_assignment_events_session', ['sessionId', 'createdAt'])
export class SessionAssignmentEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  /** asignado | reasignado | desconectado | ia | solicitud_asesor */
  @Column({ type: 'varchar', length: 50 })
  tipo: string;

  @Column({ name: 'advisor_id', type: 'varchar', length: 36, nullable: true })
  advisorId: string | null;

  @Column({ name: 'advisor_name', type: 'varchar', length: 120, nullable: true })
  advisorName: string | null;

  /** Detalle flexible: { desde, hasta }, { activaIA }, { causa } ... */
  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}