import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Sobrescritura de acceso por usuario. Si no existe fila para un módulo,
 * se toma el acceso del perfil (rol) del usuario.
 */
@Entity('acceso_usuario')
@Index(['userId', 'moduloCodigo'], { unique: true })
export class AccesoUsuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'modulo_codigo', type: 'varchar', length: 60 })
  moduloCodigo: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}