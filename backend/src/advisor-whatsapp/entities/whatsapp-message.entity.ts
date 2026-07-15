import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { WhatsappChat } from './whatsapp-chat.entity';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

export type WhatsappMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

@Entity('whatsapp_messages')
@Index('idx_whatsapp_messages_chat_id', ['chat'])
@Index('idx_whatsapp_messages_chat_id_created_at', ['chat', 'createdAt'])
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({
    name: 'meta_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  metaMessageId: string | null;

  @ManyToOne(() => WhatsappChat, (chat) => chat.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chat_id' })
  chat: WhatsappChat;

  @Column({ type: 'text', transformer: encryptedTextTransformer })
  body: string;

  @Column({ name: 'from_me', type: 'boolean', default: false })
  fromMe: boolean;

  @Column({ name: 'sender_name', type: 'varchar', length: 120 })
  senderName: string;

  @Column({
    name: 'participant_jid',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  participantJid: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'advisor_id' })
  advisor: User | null;

  @Column({ type: 'varchar', length: 20, default: 'delivered' })
  status: WhatsappMessageStatus;

  @Column({ name: 'is_auto', type: 'boolean', default: false })
  isAuto: boolean;

  @Column({ type: 'varchar', length: 30, default: 'text' })
  type: string;

  @Column({ name: 'media_id', type: 'varchar', length: 255, nullable: true })
  mediaId: string | null;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ name: 'edited_at', type: 'timestamp', nullable: true })
  editedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
