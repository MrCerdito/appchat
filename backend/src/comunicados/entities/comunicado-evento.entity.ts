import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Comunicado } from './comunicado.entity';

@Entity('comunicado_eventos')
export class ComunicadoEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Comunicado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comunicado_id' })
  comunicado: Comunicado;

  @Column({ length: 200 })
  email: string;

  @Column({ length: 20 })
  tipo: string; // 'apertura' | 'clic'

  @Column({ name: 'url_destino', type: 'varchar', length: 500, nullable: true })
  urlDestino: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
