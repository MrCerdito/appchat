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

/** Hilo de discusion de una tarea, independiente del historial de cambios. */
@Entity('task_comments')
@Index('idx_task_comments_tarea', ['tareaId', 'createdAt'])
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tarea, (t) => t.comentarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea: Tarea;

  @Column({ name: 'tarea_id', type: 'uuid' })
  tareaId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User | null;

  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  authorId: string | null;

  @Column({ name: 'author_name', type: 'varchar', length: 255, nullable: true })
  authorName: string | null;

  @Column({ type: 'text' })
  contenido: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}