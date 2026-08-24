import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PiCategoria } from './pi-categoria.entity';

@Entity('pi_campos')
export class PiCampo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nombre: string;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoriaId: string;

  @ManyToOne(() => PiCategoria, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoria_id' })
  categoria: PiCategoria;

  @Column({ length: 20 })
  tipo: string;

  @Column({ type: 'jsonb', default: '[]' })
  opciones: { valor: string; orden: number }[];

  @Column({ type: 'boolean', default: false })
  requerido: boolean;

  @Column({ name: 'mostrar_listado', type: 'boolean', default: false })
  mostrarListado: boolean;

  @Column({ name: 'mostrar_perfil', type: 'boolean', default: true })
  mostrarPerfil: boolean;

  @Column({ type: 'boolean', default: false })
  buscar: boolean;

  @Column({ type: 'boolean', default: false })
  filtrable: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'es_sistema', type: 'boolean', default: false })
  esSistema: boolean;

  @Column({ type: 'int', default: 0 })
  orden: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
