import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Catalogo de categorias de gestion de correos (Requerimiento, Error,
 * Solicitud, Cambios, ...). Las puede crear cualquier asesor con permiso de
 * correos; el nombre es unico sin distinguir mayusculas via el indice
 * `uq_correo_categorias_nombre` sobre `lower(nombre)` (migracion 023 /
 * sync service), NO via decorador para que synchronize no lo recree distinto.
 */
@Entity('correo_categorias')
export class CorreoCategoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
