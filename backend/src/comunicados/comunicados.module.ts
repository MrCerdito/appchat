import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';
import { Comunicado } from './entities/comunicado.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comunicado, ComunicadoEvento, Colegio]),
    AuthModule,
  ],
  controllers: [ComunicadosController],
  providers: [ComunicadosService],
  exports: [ComunicadosService],
})
export class ComunicadosModule {}