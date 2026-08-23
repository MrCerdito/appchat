import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPinnedMessageFields1724330000000 implements MigrationInterface {
  name = 'AddPinnedMessageFields1724330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_chats
      ADD COLUMN IF NOT EXISTS pinned_message_id varchar(100),
      ADD COLUMN IF NOT EXISTS pinned_message_body text,
      ADD COLUMN IF NOT EXISTS pinned_message_from varchar(120),
      ADD COLUMN IF NOT EXISTS pinned_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_chats
      DROP COLUMN IF EXISTS pinned_message_id,
      DROP COLUMN IF EXISTS pinned_message_body,
      DROP COLUMN IF EXISTS pinned_message_from,
      DROP COLUMN IF EXISTS pinned_at
    `);
  }
}
