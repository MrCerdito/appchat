import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

@Entity('modulos')
export class Modulo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToMany(() => User, { eager: true })
  @JoinTable({
    name: 'modulo_desarrolladores',
    joinColumn: { name: 'modulo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  desarrolladores: User[];
}
