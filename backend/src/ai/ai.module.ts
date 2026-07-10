import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiLogsService } from './ai-logs.service';
import { AiLog } from './entitites/ai-log.entity';
import { DocumentosModule } from '../documentos/documentos.module';

@Module({
  imports: [DocumentosModule, TypeOrmModule.forFeature([AiLog])],
  controllers: [AiController],
  providers: [AiService, AiLogsService],
  exports: [AiService, AiLogsService],
})
export class AiModule {}
