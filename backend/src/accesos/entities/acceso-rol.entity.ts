import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Acceso por perfil (rol): indica qué módulos ve un rol. */
@Entity('acceso_rol')
@Index(['role', 'moduloCodigo'], { unique: true })
export class AccesoRol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'role', type: 'varchar', length: 20 })
  role: string;

  @Column({ name: 'modulo_codigo', type: 'varchar', length: 60 })
  moduloCodigo: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}