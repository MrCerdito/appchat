import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pqrs')
@Index('idx_pqrs_status', ['status'])
@Index('idx_pqrs_tipo', ['tipo'])
@Index('idx_pqrs_created_at', ['createdAt'])
export class Pqrs {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 50 })
  tipo: string;

  @Column({ type: 'varchar', length: 255 })
  asunto: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  identificacion: string | null;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  apellido: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  colegio: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  adjuntos: any[] | null;

  @Column({ type: 'text', nullable: true })
  respuesta: string | null;

  @Column({ name: 'respondido_at', nullable: true, type: 'timestamptz' })
  respondidoAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
