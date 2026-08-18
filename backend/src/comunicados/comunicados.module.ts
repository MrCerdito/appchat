import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';
import { Comunicado } from './entities/comunicado.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
import { ComunicadoTemplate } from './entities/comunicado-template.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comunicado,
      ComunicadoEvento,
      ComunicadoTemplate,
      Colegio,
    ]),
    AuthModule,
    ConfiguracionModule,
  ],
  controllers: [ComunicadosController],
  providers: [ComunicadosService],
  exports: [ComunicadosService],
})
export class ComunicadosModule {}
