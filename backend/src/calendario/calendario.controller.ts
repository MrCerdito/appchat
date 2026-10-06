// src/calendario/calendario.controller.ts

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { CalendarioGrupoService } from './calendario-grupo.service';
import { CalendarioGrupoDto } from './dto/calendario-grupo.dto';

/**
 * Lectura del calendario compartido del grupo M365 'Soporte'.
 *
 * `@Permiso('whatsapp')` a proposito: la agenda se muestra dentro del modulo de
 * advisors-whatsapp y es el mismo permiso que ya exige la pagina. No se invento
 * un codigo 'calendario' porque `permisoActivo()` devuelve false para codigos sin
 * fila en la tabla de modulos y eso le daria 403 a todo el mundo.
 */
@Controller('calendario')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permiso('whatsapp')
@Roles('advisor', 'admin', 'superadmin')
export class CalendarioController {
  constructor(private readonly calendario: CalendarioGrupoService) {}

/**
 * GET /calendario/grupo?desde=2026-10-01&hasta=2026-11-12
 *
 * Devuelve TODOS los eventos del calendario del grupo en ese rango, sin
 * filtrar: reuniones, cumpleaños, recordatorios, series y cancelados.
 */
  @Get('grupo')
  listar(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('refrescar') refrescar?: string,
  ): Promise<CalendarioGrupoDto> {
    // `?refrescar=1` ignora la cache de eventos para ir a Graph. Lo usa el
    // refresco periodico del frontend: sin esto, una reunion creada desde Teams
    // por otro asesor tardaba hasta el TTL (5 min por defecto) en aparecer, y
    // con el TTL en 0 se iria a Graph en cada navegacion sin cachear nada.
    return this.calendario.obtener(desde, hasta, {
      refrescar: refrescar === '1' || refrescar === 'true',
    });
  }
}