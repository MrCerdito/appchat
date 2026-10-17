import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Tarea } from '../tarea.entity';

/**
 * Responsables de una tarea (N:M).
 *
 * Se eligio tabla puente y no un array de ids en jsonb porque "mis tareas" es
 * la consulta mas caliente del workspace y necesita indice propio por persona.
 */
@Entity('task_assignees')
@Index('idx_task_assignees_user', ['userId'])
export class TaskAssignee {
  @PrimaryColumn({ name: 'tarea_id', type: 'uuid' })
  tareaId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => Tarea, (t) => t.asignees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea: Tarea;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Quien asigno. SET NULL para no perder la trazabilidad si se da de baja. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asignado_por_id' })
  asignadoPor: User | null;

  @Column({ name: 'asignado_por_id', type: 'uuid', nullable: true })
  asignadoPorId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}