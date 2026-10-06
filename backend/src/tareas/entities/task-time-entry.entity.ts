import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Tarea } from '../tarea.entity';

/**
 * Registro de horas por tarea.
 *
 * Esta tabla es la fuente de verdad del tiempo. `Tarea.timeSpentMinutes` es un
 * acumulado que se mantiene al escribir aqui, para no agregar el historico en
 * cada listado.
 */
@Entity('task_time_entries')
@Index('idx_task_time_tarea', ['tareaId'])
@Index('idx_task_time_user', ['userId'])
export class TaskTimeEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tarea, (t) => t.tiempos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea: Tarea;

  @Column({ name: 'tarea_id', type: 'uuid' })
  tareaId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 255, nullable: true })
  userName: string | null;

  @Column({ type: 'int' })
  minutos: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  nota: string | null;

  @CreateDateColumn({ name: 'logged_at', type: 'timestamptz' })
  loggedAt: Date;
}