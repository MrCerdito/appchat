import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { PiCategoria } from './entities/pi-categoria.entity';
import { PiCampo } from './entities/pi-campo.entity';
import { PiValor } from './entities/pi-valor.entity';
import { PiHistorial } from './entities/pi-historial.entity';
import { PerfilInstitucionalController } from './perfil-institucional.controller';
import { PerfilInstitucionalService } from './perfil-institucional.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PiCategoria,
      PiCampo,
      PiValor,
      PiHistorial,
      Colegio,
      User,
    ]),
    AuthModule,
  ],
  controllers: [PerfilInstitucionalController],
  providers: [PerfilInstitucionalService, RolesGuard],
})
export class PerfilInstitucionalModule {}
