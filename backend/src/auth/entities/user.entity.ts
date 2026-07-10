import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';

@Entity('users')
@Index('idx_users_role_active', ['role', 'active'])
@Index('idx_users_role_status', ['role', 'status'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 150, unique: true })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  password: string;

  @Column({ length: 20, default: 'advisor' })
  role: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ length: 20, default: 'offline' })
  status: string; // 'online' | 'busy' | 'offline'

  @Column({ name: 'active_chats', default: 0 })
  activeChats: number;

  @Column({
    name: 'profile_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  profilePhotoUrl: string | null;

  @OneToMany(() => Session, (session) => session.advisor)
  sessions: Session[];

  @Column({
    name: 'refresh_token',
    type: 'varchar',
    nullable: true,
    length: 500,
  })
  refreshToken: string | null;
}
