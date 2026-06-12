import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

@Entity('teams_tokens')
export class TeamsToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'advisor_id', type: 'uuid', unique: true })
  advisorId: string;

  @Column({
    name: 'access_token',
    type: 'text',
    transformer: encryptedTextTransformer,
  })
  accessToken: string;

  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    transformer: encryptedTextTransformer,
  })
  refreshToken: string | null;

  @Column({ name: 'expires_at', type: 'bigint' })
  expiresAt: number;

  @Column({ name: 'account_name', type: 'varchar', length: 255, nullable: true })
  accountName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
