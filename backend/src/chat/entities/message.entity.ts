import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

@Entity('messages')
@Index('idx_messages_session_id', ['session'])
@Index('idx_messages_session_id_created_at', ['session', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', transformer: encryptedTextTransformer })
  content: string;

  @Column({ name: 'sender_type', length: 10 })
  senderType: string;

  @Column({ name: 'sender_name', type: 'text', transformer: encryptedTextTransformer })
  senderName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'read_at', nullable: true, type: 'timestamp' })
  readAt: Date | null;

  @ManyToOne(() => Session, (session) => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;
}
