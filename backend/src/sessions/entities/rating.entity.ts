import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Session } from './session.entity';
import { Min, Max } from 'class-validator';

@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ type: 'int' })
  @Min(1)
  @Max(5)
  estrellas: number;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @Column({ type: 'jsonb', default: [] })
  etiquetas: string[]; // ['Rápido', 'Amable', 'Claro']

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}