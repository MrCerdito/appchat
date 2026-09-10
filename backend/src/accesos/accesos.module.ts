import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuloAcceso } from './entities/modulo-acceso.entity';
import { AccesoRol } from './entities/acceso-rol.entity';
import { AccesoUsuario } from './entities/acceso-usuario.entity';
import { User } from '../auth/entities/user.entity';
import { AccesosService } from './accesos.service';
import { AccesosController } from './accesos.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModuloAcceso, AccesoRol, AccesoUsuario, User]),
    ChatModule,
  ],
  controllers: [AccesosController],
  providers: [AccesosService],
  exports: [AccesosService],
})
export class AccesosModule {}