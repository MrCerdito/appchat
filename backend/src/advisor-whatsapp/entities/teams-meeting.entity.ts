import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('teams_meetings')
export class TeamsMeeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByName: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({
    name: 'categories',
    type: 'text',
    array: true,
    default: () => "'{}'::text[]",
  })
  categories: string[];

  @Column({ name: 'event_source', type: 'varchar', length: 20, nullable: true })
  eventSource: 'group' | 'shared-mailbox' | 'personal' | 'none' | null;

  @Index()
  @Column({ name: 'start_date_time', type: 'timestamptz' })
  startDateTime: Date;

  @Column({ name: 'end_date_time', type: 'timestamptz' })
  endDateTime: Date;

  @Column({ name: 'duration_minutes', type: 'int', default: 30 })
  durationMinutes: number;

  @Column({ name: 'join_url', type: 'text' })
  joinUrl: string;

  @Column({ name: 'meeting_id', type: 'varchar', length: 255, nullable: true })
  meetingId: string | null;

  @Column({ name: 'event_id', type: 'varchar', length: 255, nullable: true })
  eventId: string | null;

  @Column({
    name: 'calendar_target',
    type: 'varchar',
    length: 20,
    default: 'shared',
  })
  calendarTarget: 'personal' | 'shared' | 'none';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
