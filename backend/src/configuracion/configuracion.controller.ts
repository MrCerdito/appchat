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
import { GuardarConfigGlobalDto } from './dto/guardar-config-global.dto';
import { GuardarConfigAdvisorDto } from './dto/guardar-config-advisor.dto';

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
    @Body() body: GuardarConfigAdvisorDto,
    @Request() req: any,
  ) {
    return this.svc.guardar(body, req.user.id);
  }

  @Post('global')
  @HttpCode(HttpStatus.OK)
  guardarGlobal(@Body() body: GuardarConfigGlobalDto) {
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
