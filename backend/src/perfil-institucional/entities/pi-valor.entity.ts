import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PiCampo } from './pi-campo.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('pi_valores')
export class PiValor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'colegio_id', type: 'uuid' })
  colegioId: string;

  @ManyToOne(() => PiCampo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campo_id' })
  campo: PiCampo;

  @Column({ name: 'campo_id', type: 'uuid' })
  campoId: string;

  @Column({ type: 'text', nullable: true })
  valor: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
