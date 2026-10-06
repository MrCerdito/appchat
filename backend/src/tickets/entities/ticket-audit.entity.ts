import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Registro de auditoría de los tickets: quién hizo qué y cuándo.
 *
 * Solo de append. Nunca se actualiza ni se borra (la purga la hace el proceso
 * de retención, no la aplicación), porque justamente sirve para reconstruir el
 * histórico cuando hay una queja o una investigación.
 *
 * `before`/`after` guardan el jsonb del campo cambiado, no el ticket entero:
 * así una línea de auditoría no duplica la ficha del cliente con sus PII.
 */
@Entity('ticket_audit')
@Index('idx_ticket_audit_ticket', ['ticketId', 'createdAt'])
@Index('idx_ticket_audit_usuario', ['actorId'])
export class TicketAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ticketId: string;

  /** Código legible del ticket, para auditar sin hacer JOIN. */
  @Column({ type: 'varchar', length: 20 })
  ticketCodigo: string;

  @Column({ type: 'varchar', length: 40 })
  accion: string;

  /** Campo afectado: status, priority, assignedTo, note, delete... */
  @Column({ type: 'varchar', length: 60, nullable: true })
  campo: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  /** `system` cuando la acción no viene de un usuario (SLA,_jobs, WhatsApp). */
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  actorName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  actorRole: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}