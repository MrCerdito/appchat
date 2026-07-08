import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('comunicados')
export class Comunicado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300 })
  asunto: string;

  @Column({ type: 'text' })
  cuerpo: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_name', length: 100 })
  senderName: string;

  @Column({ length: 20, default: 'draft' })
  status: string; // 'draft' | 'sent'

  @Column({ type: 'jsonb', default: [] })
  destinatarios: { email: string; nombre: string }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'sent_at', nullable: true, type: 'timestamp' })
  sentAt: Date | null;
}