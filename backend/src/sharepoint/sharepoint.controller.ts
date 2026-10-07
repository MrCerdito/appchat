// src/sharepoint/sharepoint.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import {
  ListadoSharepoint,
  SesionSharepoint,
  SharepointService,
} from './sharepoint.service';

/**
 * Lectura de la biblioteca "Documentos compartidos" del sitio de Soporte.
 *
 * Solo GET: no se sube, edita ni borra nada en SharePoint. Cada respuesta es
 * metadatos o un stream en tránsito; el servidor no guarda copias locales.
 *
 * `@Permiso('sharepoint')` exige que el módulo esté habilitado en Accesos
 * (superadmin siempre pasa) y el guard global de JWT exige sesión.
 */
@Controller('sharepoint')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permiso('sharepoint')
@Roles('advisor', 'admin', 'superadmin', 'interno')
export class SharepointController {
  constructor(private readonly sharepoint: SharepointService) {}

  /** GET /sharepoint/info — sitio y biblioteca para el encabezado. */
  @Get('info')
  info(): Promise<SesionSharepoint> {
    return this.sharepoint.info();
  }

  /**
   * GET /sharepoint/items?parentId=&q=&nombre=
   *
   * `parentId` vacío = raíz de la biblioteca. `q` presente = búsqueda global.
   * `nombre` (opcional) es el nombre de la carpeta contenedora: el cliente ya
   * lo conoce, así se ahorra la segunda llamada a Graph.
   * Graf devuelve páginas de 200; aquí se concatenan (tope de 10 páginas).
   */
  @Get('items')
  listar(
    @Query('parentId') parentId?: string,
    @Query('q') q?: string,
    @Query('nombre') nombre?: string,
  ): Promise<ListadoSharepoint> {
    return this.sharepoint.listar(parentId, q, nombre);
  }

  /**
   * GET /sharepoint/items/:id/content — descarga el archivo como stream.
   * Graph devuelve una URL pre-autorizada que caduca en ~1 hora, por eso no se
   * cachea la respuesta ni se sirve desde disco.
   */
  @Get('items/:id/content')
  descargar(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.sharepoint.descarga(id).then((d) => {
      // nombre ASCII de respaldo + nombre UTF-8 real (SharePoint usa tildes).
      const ascii = d.filename
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\/]/g, '_');
      res.set({
        'Content-Type': d.contentType,
        'Content-Disposition':
          `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (d.contentLength) res.set('Content-Length', String(d.contentLength));
      return new StreamableFile(d.stream as Readable);
    });
  }
}
