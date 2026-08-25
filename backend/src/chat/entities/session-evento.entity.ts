import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('session_events')
@Index('idx_session_events_session', ['sessionId', 'createdAt'])
export class SessionEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  /** solicitud_asesor | faq_clic | ... */
  @Column({ type: 'varchar', length: 50 })
  tipo: string;

  /** Detalle flexible según el tipo de evento. */
  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
