import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { WidgetConfigService } from './widget-config.service';
import { WidgetConfig } from './entities/widget-config.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { SaveWidgetConfigDto } from './dto/save-widget-config.dto';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('widget-config')
export class WidgetConfigController {
  constructor(private readonly svc: WidgetConfigService) {}

  // ── GET /widget-config — público ─────────────────────────────────────────
  // Sin guard: el widget.js embebido en páginas externas llama este endpoint
  // para obtener la config al momento de renderizarse.
  // ACAO:* : el widget debe funcionar en CUALQUIER página externa (colegios,
  // portales, etc.). La config es pública (solo apariencia/textos), sin
  // credenciales, por lo que abrir el origen es seguro y evita editar
  // CORS_ORIGINS por cada sitio donde se incruste.
  @Header('Cache-Control', 'public, max-age=60')
  @Header('Access-Control-Allow-Origin', '*')
  @SkipThrottle()
  @Get()
  get(): Promise<WidgetConfig> {
    return this.svc.get();
  }

  // ── POST /widget-config — solo admin ─────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  save(@Body() body: SaveWidgetConfigDto): Promise<WidgetConfig> {
    return this.svc.save(body);
  }

  // ── DELETE /widget-config — reset a defaults ──────────────────────────────
  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  reset(): Promise<WidgetConfig> {
    return this.svc.reset();
  }
}
