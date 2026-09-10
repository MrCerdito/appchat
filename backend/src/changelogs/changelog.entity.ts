import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

export type ChangelogCategoria = 'nuevo' | 'mejora' | 'correccion';

@Entity('changelogs')
@Index('idx_changelogs_publicado', ['publicado', 'publicadoEl'])
export class Changelog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300 })
  titulo: string;

  @Column({ length: 40, default: 'mejora' })
  categoria: ChangelogCategoria;

@Column({ type: 'varchar', length: 50, nullable: true })
version: string | null;

  @Column({ type: 'text' })
  cuerpo: string;

  @Column({ name: 'design', type: 'jsonb', nullable: true })
  design: unknown[] | null;

  @Column({ default: false })
  publicado: boolean;

  @Column({ name: 'publicado_el', nullable: true, type: 'timestamptz' })
  publicadoEl: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'creado_por' })
  creadoPor: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}