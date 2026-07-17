import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { User } from '../auth/entities/user.entity';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { WidgetConfig } from '../widget/entities/widget-config.entity';
import { Faq } from '../faq/entities/faq.entity';
import { Colegio } from '../sessions/entities/colegio.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Configuracion, WidgetConfig, Faq, Colegio]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
