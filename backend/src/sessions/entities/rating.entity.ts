import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Session } from './session.entity';

@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ type: 'int' })
  estrellas: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @Column({ type: 'jsonb', default: [] })
  etiquetas: string[]; // ['Rápido', 'Amable', 'Claro']

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}