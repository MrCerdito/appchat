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
import { MetricsConexionQueryDto } from './dto/metrics-conexion-query.dto';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Dashboard por secciones (resumen, tickets/correos, colegios, asesoría,
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

  /**
   * Línea de tiempo de UN día (barras por asesor) de la pestaña Conexiones.
   * `fecha=YYYY-MM-DD` obligatoria; `asesorId` opcional.
   */
  @Get('conexiones/dia')
  @UseGuards(JwtAuthGuard)
  @Permiso('metrics')
  getConexionesDia(@Query() query: MetricsConexionQueryDto) {
    return this.metricsService.conexionesDia(query);
  }

  /**
   * Ficha de seguimiento de un asesor: historial de eventos (hora, duración y
   * causa), resumen por día y KPIs. Requiere `asesorId`.
   */
  @Get('conexiones/historial')
  @UseGuards(JwtAuthGuard)
  @Permiso('metrics')
  getConexionesHistorial(@Query() query: MetricsConexionQueryDto) {
    return this.metricsService.conexionesHistorial(query);
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
