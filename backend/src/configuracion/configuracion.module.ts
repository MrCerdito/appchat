import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionService } from './configuracion.service';
import { ConfiguracionController } from './configuracion.controller';
import { Configuracion } from './entities/configuracion.entity';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Configuracion]), AuthModule],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService, RolesGuard],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
