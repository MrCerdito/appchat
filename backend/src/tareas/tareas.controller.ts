import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { TareasService, TareaActor } from './tareas.service';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';
import {
  AddTaskCommentDto,
  AddTaskTimeDto,
  SetTaskAssigneesDto,
  ReorderTareasDto,
} from './dto/task-ops.dto';

/**
 * Workspace de tareas internas. Solo `desarrollador` y `admin`; el catalogo de
 * accesos lo refuerza con el permiso `tareas`, de modo que el asesor ni siquiera
 * ve la ruta aunque manipule la URL.
 */
@Controller('tareas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permiso('tareas')
@Roles('admin', 'desarrollador')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  /** `req.user` lo inyecta JwtStrategy como { id, email, role }. */
  private actor(req: any): TareaActor {
    return { id: String(req?.user?.id ?? ''), role: String(req?.user?.role ?? '') };
  }

  @Get()
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: QueryTareasDto,
    @Request() req: any,
  ) {
    return this.tareasService.findAll(query, this.actor(req));
  }

  /**
   * Progreso de las tareas de un ticket. Va antes que `:id` para que la ruta no
   * se coma el segmento `progreso`.
   */
  @Get('progreso/:ticketId')
  progreso(@Param('ticketId') ticketId: string, @Request() req: any) {
    return this.tareasService.progresoTicket(ticketId, this.actor(req));
  }

  /** Agregados del panel. Se declara antes de `:id` por la misma razon. */
  @Get('estadisticas')
  estadisticas(@Request() req: any, @Query('dias') dias?: string) {
    // Ventana del grafico. Se acota a 7/14/30 para que un valor raro no dispare
    // una serie enorme sin que el usuario lo haya pedido.
    const permitidos = [7, 14, 30];
    const n = Number(dias);
    return this.tareasService.estadisticas(
      this.actor(req),
      permitidos.includes(n) ? n : 7,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tareasService.findOne(id, this.actor(req));
  }

  /**
   * `POST /tareas` crea una tarea o, si viene `parentTaskId`, una subtarea.
   * El mismo endpoint cubre los dos casos porque son la misma entidad.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateTareaDto,
    @Request() req: any,
  ) {
    return this.tareasService.create(dto, this.actor(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateTareaDto,
    @Request() req: any,
  ) {
    return this.tareasService.update(id, dto, this.actor(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tareasService.remove(id, this.actor(req));
  }

  @Post(':id/asignados')
  setAssignees(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: SetTaskAssigneesDto,
    @Request() req: any,
  ) {
    return this.tareasService.setAssignees(id, dto, this.actor(req));
  }

  @Post(':id/comentarios')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: AddTaskCommentDto,
    @Request() req: any,
  ) {
    return this.tareasService.addComment(id, dto, this.actor(req));
  }

  @Post(':id/tiempo')
  addTime(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: AddTaskTimeDto,
    @Request() req: any,
  ) {
    return this.tareasService.addTime(id, dto, this.actor(req));
  }

  @Delete(':id/tiempo/:entryId')
  removeTime(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Request() req: any,
  ) {
    return this.tareasService.removeTime(id, entryId, this.actor(req));
  }

  @Post('reordenar')
  @HttpCode(HttpStatus.OK)
  reorder(
    @Body(new ValidationPipe({ whitelist: true })) dto: ReorderTareasDto,
    @Request() req: any,
  ) {
    return this.tareasService.reorder(dto, this.actor(req));
  }
}