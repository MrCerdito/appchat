import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import {
  ConectividadEventosQueryDto,
  ConectividadIncidentesQueryDto,
  ConectividadMapaQueryDto,
  ConectividadQueryDto,
  ConectividadRevisionDto,
} from './dto/conectividad-query.dto';
import { ConectividadService } from './conectividad.service';

/**
 * Historial de Conectividad: monitoreo, análisis y trazabilidad de las
 * conexiones de los asesores sobre `advisor_activity_log`.
 * Mismo permiso `metrics` que el módulo de Métricas.
 */
@Controller('conectividad')
@UseGuards(JwtAuthGuard)
@Permiso('metrics')
export class ConectividadController {
  constructor(private readonly conectividad: ConectividadService) {}

  /** Vista ejeciva: KPIs, comparación con el periodo anterior, tendencia
   *  diaria, distribución por hora y ranking de estabilidad. */
  @Get('resumen')
  getResumen(@Query() query: ConectividadQueryDto) {
    return this.conectividad.resumen(query);
  }

  /** Mapa de calor día-semana × franja horaria (métrica configurable). */
  @Get('mapa-calor')
  getMapaCalor(@Query() query: ConectividadMapaQueryDto) {
    return this.conectividad.mapaCalor(query, query.metrica ?? 'desconexiones');
  }

  /** Incidentes detectados (reglas configurables) con su revisión humana. */
  @Get('incidentes')
  getIncidentes(@Query() query: ConectividadIncidentesQueryDto) {
    return this.conectividad.incidentes(query);
  }

  /** Guarda la revisión (estado/comentario) de un incidente. El responsable
   *  es el usuario autenticado (JWT), no un valor del body. */
  @Patch('incidentes/:userId/:clave')
  @HttpCode(200)
  revisar(
    @Request() req: any,
    @Param('userId') userId: string,
    @Param('clave') clave: string,
    @Body() dto: ConectividadRevisionDto,
  ) {
    return this.conectividad.revisarIncidente(
      userId,
      clave,
      dto,
      String(req?.user?.id ?? ''),
    );
  }

  /** Historial cronológico paginado (el total corresponde a la consulta filtrada). */
  @Get('eventos')
  getEventos(@Query() query: ConectividadEventosQueryDto) {
    return this.conectividad.eventos(query);
  }

  /** Exportación CSV del historial filtrado. */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query() query: ConectividadEventosQueryDto,
    @Res() res: Response,
  ) {
    const { csv, nombre } = await this.conectividad.exportCsv(query);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(csv);
  }
}
