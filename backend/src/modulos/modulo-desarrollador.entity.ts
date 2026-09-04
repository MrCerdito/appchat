import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

@Entity('modulo_desarrolladores')
export class ModuloDesarrollador {
  @PrimaryColumn({ name: 'modulo_id', type: 'uuid' })
  moduloId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
