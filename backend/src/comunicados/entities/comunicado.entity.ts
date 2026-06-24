import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export interface Destinatario {
  email: string;
  nombre: string;
  sendStatus?: 'ok' | 'failed';
  sendError?: string;
}

@Entity('comunicados')
@Index('idx_comunicados_sender_id', ['sender'])
@Index('idx_comunicados_status', ['status'])
@Index('idx_comunicados_sender_id_status', ['sender', 'status'])
@Index('idx_comunicados_created_at', ['createdAt'])
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
  status: 'draft' | 'sent' | 'failed';

  @Column({ type: 'jsonb', default: [] })
  destinatarios: Destinatario[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'sent_at', nullable: true, type: 'timestamp' })
  sentAt: Date | null;

  @Column({ name: 'total_enviados', default: 0 })
  totalEnviados: number;

  @Column({ name: 'total_aperturas', default: 0 })
  totalAperturas: number;

  @Column({ name: 'total_clics', default: 0 })
  totalClics: number;
}