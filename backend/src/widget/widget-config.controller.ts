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
import { SaveWidgetConfigDto } from './dto/save-widget-config.dto';

@Controller('widget-config')
export class WidgetConfigController {
  constructor(private readonly svc: WidgetConfigService) {}

  // ── GET /widget-config — público ─────────────────────────────────────────
  // Sin guard: el widget.js embebido en páginas externas llama este endpoint
  // para obtener la config al momento de renderizarse.
  @Header('Cache-Control', 'public, max-age=60')
  @Get()
  get(): Promise<WidgetConfig> {
    return this.svc.get();
  }

  // ── POST /widget-config — solo admin ─────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  save(@Body() body: SaveWidgetConfigDto): Promise<WidgetConfig> {
    return this.svc.save(body);
  }

  // ── DELETE /widget-config — reset a defaults ──────────────────────────────
  @Delete()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  reset(): Promise<WidgetConfig> {
    return this.svc.reset();
  }
}
