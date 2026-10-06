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
import { User } from '../auth/entities/user.entity';
import { Modulo } from '../modulos/modulo.entity';
import { Ticket } from '../tickets/ticket.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskTimeEntry } from './entities/task-time-entry.entity';

/**
 * Estados de una tarea. Son distintos a los de un ticket a proposito: una
 * tarea no tiene `denied` (a nadie se le deniega trabajo) ni `closed` (el
 * cierre es un concepto de atencion al cliente, no de ingenieria).
 */
export const TAREA_STATUSES = [
  'pendiente',
  'en_progreso',
  'bloqueada',
  'revision',
  'completada',
  'cancelada',
] as const;

export type TareaStatus = (typeof TAREA_STATUSES)[number];

/** Escala de prioridad heredada de tickets, para no duplicar el catalogo. */
export const TAREA_PRIORIDADES = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type TareaPrioridad = (typeof TAREA_PRIORIDADES)[number];

@Entity('tasks')
// Parcial a proposito: el kanban solo consulta raices, asi que indexar tambien
// las subtareas desperdicia entradas. El `where` tiene que coincidir con el de
// `020-add-tareas.sql`, si no `synchronize` en dev crearia un indice distinto.
// Ojo: aqui van NOMBRES DE PROPIEDAD (`orderIndex`), no de columna (`order_index`).
@Index('idx_tasks_raiz', ['status', 'orderIndex'], {
  where: '"parent_task_id" IS NULL',
})
export class Tarea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  status: TareaStatus;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  prioridad: TareaPrioridad;

  // ── Subarbol ──────────────────────────────────────────────────────────
  // NULL = tarea raiz. La autorreferencia con CASCADE hace que borrar una
  // tarea arrastre su subarbol completo.
  @ManyToOne(() => Tarea, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask: Tarea | null;

  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId: string | null;

  @OneToMany(() => Tarea, (t) => t.parentTask)
  subtareas: Tarea[];

  // ── Ticket origen (opcional) ─────────────────────────────────────────
  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket | null;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  // ── Modulo / equipo ──────────────────────────────────────────────────
  @ManyToOne(() => Modulo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'modulo_id' })
  modulo: Modulo | null;

  @Column({ name: 'modulo_id', type: 'uuid', nullable: true })
  moduloId: string | null;

  // ── Autoria ──────────────────────────────────────────────────────────
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'created_by_name', type: 'varchar', length: 255, nullable: true })
  createdByName: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags: string[];

  // ── Planificacion ────────────────────────────────────────────────────
  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  // Antirrebote del recordatorio: guarda cuando se aviso por ultima vez.
  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  // ── Ejecucion ────────────────────────────────────────────────────────
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completed_by_id' })
  completedBy: User | null;

  @Column({ name: 'completed_by_id', type: 'uuid', nullable: true })
  completedById: string | null;

  /**
   * Total de horas registradas. Desnormalizado a proposito: el listado del
   * kanban lo lee en cada tarjeta y sumar `task_time_entries` ahi seria una
   * agregacion por fila. La tabla de horas es la fuente de verdad.
   */
  @Column({ name: 'time_spent_minutes', type: 'int', default: 0 })
  timeSpentMinutes: number;

  /** Orden entre hermanos: dentro de la columna (raices) o del padre. */
  @Column({ name: 'order_index', type: 'double precision', default: 0 })
  orderIndex: number;

  @OneToMany(() => TaskAssignee, (a) => a.tarea)
  asignees: TaskAssignee[];

  @OneToMany(() => TaskComment, (c) => c.tarea)
  comentarios: TaskComment[];

  @OneToMany(() => TaskTimeEntry, (t) => t.tarea)
  tiempos: TaskTimeEntry[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
