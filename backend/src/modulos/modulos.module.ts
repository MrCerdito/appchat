import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Modulo } from './modulo.entity';
import { ModulosService } from './modulos.service';
import { ModulosController } from './modulos.controller';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Modulo, User])],
  controllers: [ModulosController],
  providers: [ModulosService],
  exports: [ModulosService],
})
export class ModulosModule {}
