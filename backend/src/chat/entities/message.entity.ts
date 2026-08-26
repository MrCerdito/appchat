import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

export interface Attachment {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

@Entity('messages')
@Index('idx_messages_session_id', ['session'])
@Index('idx_messages_session_id_created_at', ['session', 'createdAt'])
@Index('idx_messages_sender_type', ['senderType'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', transformer: encryptedTextTransformer })
  content: string;

  @Column({ name: 'sender_type', length: 10 })
  senderType: string;

  @Column({
    name: 'sender_name',
    type: 'text',
    transformer: encryptedTextTransformer,
  })
  senderName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'read_at', nullable: true, type: 'timestamptz' })
  readAt: Date | null;

  @Column({ name: 'delivered_at', nullable: true, type: 'timestamptz' })
  deliveredAt: Date | null;

  @Column({ name: 'edited_at', nullable: true, type: 'timestamptz' })
  editedAt: Date | null;

  @Column({ name: 'reply_to_message_id', nullable: true, type: 'uuid' })
  replyToMessageId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Attachment[] | null;

  /** Documentos entregados por la IA junto a esta respuesta. */
  @Column({ type: 'jsonb', nullable: true })
  documentos:
    | {
        nombre: string;
        pdfUrl: string | null;
        categoria: string | null;
        descripcion?: string | null;
        instructivo?: boolean | null;
      }[]
    | null;

  @ManyToOne(() => Session, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: Session;
}
