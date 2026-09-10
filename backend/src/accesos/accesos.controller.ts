import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Permiso } from './permiso-modulo.guard';
import { ChatGateway } from '../chat/chat.gateway';
import { AccesosService } from './accesos.service';
import { UpdateAccesosDto } from './dto/update-accesos.dto';

@Controller('accesos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccesosController {
  constructor(
    private readonly accesosService: AccesosService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('modulos')
  @Roles('admin')
  @Permiso('accesos')
  getModulos() {
    return this.accesosService.getModulos();
  }

  @Get('rol')
  @Roles('admin')
  @Permiso('accesos')
  getRolAccesos() {
    return this.accesosService.getAccesosTodosLosRoles();
  }

  @Put('rol/:role')
  @Roles('admin')
  @Permiso('accesos')
  async setRolAccesos(
    @Param('role') role: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    body: UpdateAccesosDto,
  ): Promise<{ ok: boolean }> {
    await this.accesosService.setAccesosRol(role, body.modulos);
    this.chatGateway.broadcastPermisosActualizados();
    return { ok: true };
  }

  @Get('usuario/:id')
  @Roles('admin')
  @Permiso('accesos')
  getUsuarioAccesos(@Param('id') id: string) {
    return this.accesosService.getAccesosUsuario(id);
  }

  @Put('usuario/:id')
  @Roles('admin')
  @Permiso('accesos')
  async setUsuarioAccesos(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    body: UpdateAccesosDto,
  ): Promise<{ ok: boolean }> {
    await this.accesosService.setAccesosUsuario(id, body.modulos);
    this.chatGateway.broadcastPermisosActualizados();
    return { ok: true };
  }

  @Get('mis-permisos')
  misPermisos(@Request() req: any) {
    return this.accesosService.misPermisos({
      id: req.user.id,
      role: req.user.role,
    });
  }
}