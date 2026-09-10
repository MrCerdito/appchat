import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Registro del catálogo de módulos visibles en la aplicación. */
@Entity('modulo_acceso')
export class ModuloAcceso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo', type: 'varchar', length: 60, unique: true })
  codigo: string;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  nombre: string;

  @Column({ name: 'grupo', type: 'varchar', length: 80 })
  grupo: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 300, nullable: true })
  descripcion: string | null;

  /** Perfiles a los que aplica: admin | advisor | desarrollador. */
  @Column({ name: 'aplica_a', type: 'simple-array' })
  aplicaA: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}