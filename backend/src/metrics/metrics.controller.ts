import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { MetricsDashboardQueryDto } from './dto/metrics-dashboard-query.dto';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Dashboard por secciones (resumen, requerimientos, colegios, asesoría,
   * capacitaciones, errores, solicitudes, conexiones).
   * Filtros: marca (all|Sian365|ControlAcademic), desde/hasta (día Bogotá,
   * inclusivos) y asesorId opcional.
   */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @Permiso('metrics')
  getDashboard(@Query() query: MetricsDashboardQueryDto) {
    return this.metricsService.getDashboard(query);
  }

  /** Exportación multi-hoja del mismo dashboard, en Excel. */
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Permiso('metrics')
  async export(
    @Query() query: MetricsDashboardQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.metricsService.exportDashboard(query);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="metricas-${Date.now()}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }
}
