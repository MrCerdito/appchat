import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { InternalConversationMember } from './internal-conversation-member.entity';
import { InternalMessage } from './internal-message.entity';

export type InternalConversationType = 'direct' | 'group';

@Entity('internal_conversations')
@Index('idx_internal_conversations_type', ['type'])
@Index('idx_internal_conversations_last_message_at', ['lastMessageAt'])
export class InternalConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, default: 'group' })
  type: InternalConversationType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @OneToMany(
    () => InternalConversationMember,
    (member) => member.conversation,
  )
  members: InternalConversationMember[];

  @OneToMany(() => InternalMessage, (message) => message.conversation)
  messages: InternalMessage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
