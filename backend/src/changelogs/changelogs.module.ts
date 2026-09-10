import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Changelog } from './changelog.entity';
import { ChangelogSeen } from './changelog-seen.entity';
import { ChangelogsController } from './changelogs.controller';
import { ChangelogsService } from './changelogs.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Changelog, ChangelogSeen]),
    NotificationsModule,
  ],
  controllers: [ChangelogsController],
  providers: [ChangelogsService],
  exports: [ChangelogsService],
})
export class ChangelogsModule {}