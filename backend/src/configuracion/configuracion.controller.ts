import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { ConfiguracionService } from './configuracion.service';
import { Configuracion } from './entities/configuracion.entity';

@Controller('configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly svc: ConfiguracionService) {}

  @Public()
  @Get('horario-hoy')
  horarioHoy() {
    return this.svc.getHorarioEstado();
  }

  @Get()
  getEfectiva(@Request() req: any) {
    return this.svc.getEfectiva(req.user.id);
  }

  @Get('global')
  getGlobal() {
    return this.svc.getGlobal();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  guardar(
    @Body() body: Partial<Configuracion>,
    @Request() req: any,
  ) {
    return this.svc.guardar(body, req.user.id);
  }

  @Post('global')
  @HttpCode(HttpStatus.OK)
  guardarGlobal(@Body() body: Partial<Configuracion>) {
    return this.svc.guardar(body, undefined);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  resetear(@Request() req: any) {
    return this.svc.resetearOverride(req.user.id);
  }

  @Get('ticket-categories')
  getTicketCategories() {
    return this.svc.getGlobal().then(c => c.ticketCategories ?? []);
  }
}
