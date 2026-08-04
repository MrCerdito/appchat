import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiLogsService } from './ai-logs.service';
import { AiLog } from './entities/ai-log.entity';
import { DocumentosModule } from '../documentos/documentos.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    DocumentosModule,
    ConfiguracionModule,
    TypeOrmModule.forFeature([AiLog]),
    forwardRef(() => ChatModule),
  ],
  controllers: [AiController],
  providers: [AiService, AiLogsService],
  exports: [AiService, AiLogsService],
})
export class AiModule {}
