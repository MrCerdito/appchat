import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('faqs')
export class Faq {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  pregunta: string;

  @Column({ type: 'text' })
  respuesta: string;

  @Index('idx_faqs_categoria')
  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria: string | null;

  @Column({ type: 'simple-array', nullable: true })
  keywords: string[] | null;

  @Index('idx_faqs_colegio_id')
  @Column({ name: 'colegio_id', type: 'int', nullable: true })
  colegioId: number | null;

  @Index('idx_faqs_orden')
  @Column({ type: 'int', default: 0 })
  orden: number;

  @Index('idx_faqs_activo')
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
