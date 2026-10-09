import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TareasController } from './tareas.controller';
import { TareasService } from './tareas.service';
import { TareasGateway } from './tareas.gateway';
import { TareasRecordatoriosService } from './recordatorios.service';
import { Tarea } from './tarea.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskTimeEntry } from './entities/task-time-entry.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesosModule } from '../accesos/accesos.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tarea,
      TaskAssignee,
      TaskComment,
      TaskTimeEntry,
      User,
    ]),
    // NotificacionesModule y AccesosModule no importan TareasModule, asi que
    // no hace falta forwardRef en ninguna direccion.
    NotificationsModule,
    AccesosModule,
    // AuthModule aporta el JwtModule con el que el gateway autentica los sockets.
    AuthModule,
  ],
  controllers: [TareasController],
  providers: [TareasService, TareasGateway, TareasRecordatoriosService],
  exports: [TareasService],
})
export class TareasModule {}