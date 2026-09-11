import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';
import { BounceService } from './bounce.service';
import { Comunicado } from './entities/comunicado.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
import { ComunicadoTemplate } from './entities/comunicado-template.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { PiCampo } from '../perfil-institucional/entities/pi-campo.entity';
import { PiValor } from '../perfil-institucional/entities/pi-valor.entity';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comunicado,
      ComunicadoEvento,
      ComunicadoTemplate,
      Colegio,
      PiCampo,
      PiValor,
    ]),
    AuthModule,
    ConfiguracionModule,
  ],
  controllers: [ComunicadosController],
  providers: [ComunicadosService, BounceService],
  exports: [ComunicadosService],
})
export class ComunicadosModule {}
