import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Registro de auditoría de cambios hechos vía import sobre colegios.
 *
 * Nota producción (synchronize: false): crear la tabla manualmente:
 *   CREATE TABLE colegio_logs (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     colegio_id uuid NULL REFERENCES colegios(id) ON DELETE SET NULL,
 *     usuario_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
 *     accion varchar(50) NOT NULL,
 *     campo varchar(50) NOT NULL,
 *     valor_anterior text NULL,
 *     valor_nuevo text NULL,
 *     created_at timestamptz NOT NULL DEFAULT now()
 *   );
 */
@Entity('colegio_logs')
export class ColegioLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'colegio_id', type: 'uuid', nullable: true })
  colegioId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;

  @Column({ length: 50 })
  accion: string;

  @Column({ length: 50 })
  campo: string;

  @Column({ name: 'valor_anterior', type: 'text', nullable: true })
  valorAnterior: string | null;

  @Column({ name: 'valor_nuevo', type: 'text', nullable: true })
  valorNuevo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}