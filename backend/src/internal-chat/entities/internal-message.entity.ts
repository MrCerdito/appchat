import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { InternalConversation } from './internal-conversation.entity';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

export type InternalMessageType = 'text' | 'image' | 'audio' | 'file' | 'system';

@Entity('internal_messages')
@Index('idx_internal_messages_conversation_id_created_at', [
  'conversation',
  'createdAt',
])
@Index('idx_internal_messages_sender_id', ['sender'])
@Index('idx_internal_messages_reply_to_id', ['replyToMessageId'])
@Index('idx_internal_messages_reaction_to_id', ['reactionToMessageId'])
export class InternalMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  @ManyToOne(() => InternalConversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: InternalConversation;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender: User | null;

  @Column({ type: 'text', transformer: encryptedTextTransformer })
  body: string;

  @Column({ type: 'varchar', length: 10, default: 'text' })
  type: InternalMessageType;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string | null;

  @Column({ name: 'media_mime_type', type: 'varchar', length: 120, nullable: true })
  mediaMimeType: string | null;

  @Column({ name: 'media_name', type: 'varchar', length: 255, nullable: true })
  mediaName: string | null;

  @Column({ name: 'media_size', type: 'int', nullable: true })
  mediaSize: number | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'media_width', type: 'int', nullable: true })
  mediaWidth: number | null;

  @Column({ name: 'media_height', type: 'int', nullable: true })
  mediaHeight: number | null;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'reply_to_message_id', type: 'uuid', nullable: true })
  replyToMessageId: string | null;

  @Column({ name: 'is_forwarded', type: 'boolean', default: false })
  isForwarded: boolean;

  @Column({ name: 'reaction_to_message_id', type: 'uuid', nullable: true })
  reactionToMessageId: string | null;

  @Column({ name: 'reaction_emoji', type: 'varchar', length: 32, nullable: true })
  reactionEmoji: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
