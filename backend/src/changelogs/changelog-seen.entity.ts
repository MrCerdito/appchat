import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Changelog } from './changelog.entity';
import { User } from '../auth/entities/user.entity';

@Entity('changelog_seen')
@Index('idx_changelog_seen_user', ['user'])
export class ChangelogSeen {
  @PrimaryColumn({ name: 'changelog_id', type: 'uuid' })
  changelogId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => Changelog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'changelog_id' })
  changelog: Changelog;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'seen_at', type: 'timestamptz', default: () => 'now()' })
  seenAt: Date;
}