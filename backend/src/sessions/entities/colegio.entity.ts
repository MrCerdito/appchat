import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('colegios')
export class Colegio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200, unique: true })
  nombre: string;

  @Column({ length: 500 })
  link: string;

  @Column({ length: 200, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  calendario: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'tipo_colegio' })
  tipoColegio: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'advisor_id' })
  advisor: User | null;

  @Column({ name: 'advisor_id', type: 'uuid', nullable: true })
  advisorId: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  links: string[];

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
