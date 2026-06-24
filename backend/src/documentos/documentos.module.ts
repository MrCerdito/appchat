import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentosService } from './documentos.service';
import { DocumentosController } from './documentos.controller';
import { Documento } from './entities/documento.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Documento]),
    MulterModule.register({ dest: './uploads/documentos' }),
  ],
  controllers: [DocumentosController],
  providers  : [DocumentosService],
  exports    : [DocumentosService], // exportado para que AiService lo use en el RAG
})
export class DocumentosModule {}