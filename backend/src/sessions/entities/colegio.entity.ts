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

  @Column({ type: 'varchar', length: 50, nullable: true })
  tipoColegio: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'advisor_id' })
  advisor: User | null;

  @Column({ name: 'advisor_id', type: 'uuid', nullable: true })
  advisorId: string | null;
}
