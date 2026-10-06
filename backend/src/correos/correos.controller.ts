import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { CorreosService, PresetFechaCorreo } from './correos.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { CorreosSyncService } from './correos-sync.service';

type ReqConUsuario = Request & { user: any };

/**
 * Bandeja de correo del asesor (buzon compartido > ASIGNADOS > <nombre>).
 *
 * El asesor SIEMPRE se toma del token: ningun endpoint acepta un id de asesor
 * desde el cliente, asi que nadie puede leer la carpeta de otro cambiando la URL.
 */
@Controller('correos')
@UseGuards(JwtAuthGuard)
@Permiso('correos')
export class CorreosController {
  constructor(
    private readonly correosService: CorreosService,
    private readonly carpetasService: CorreosCarpetaService,
    private readonly syncService: CorreosSyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Diagnostico del modulo. Si falta el permiso en Entra lo dice con el nombre
   * exacto del permiso, en vez de devolver una bandeja vacia sin explicacion.
   */
  @Get('estado')
  async estado(@Req() req: ReqConUsuario) {
    return this.correosService.estado(req.user.id, req.user.name);
  }

  /**
   * Bandeja del asesor. `folderId` es opcional: si no se envia se resuelve la
   * carpeta por nombre contra el buzon. La paginacion es por offset sobre el
   * espejo local, que ya esta ordenado por fecha de recepcion.
   */
  @Get('mensajes')
  async listar(
    @Req() req: ReqConUsuario,
    @Query('folderId') folderId?: string,
    @Query('limite') limite?: string,
    @Query('offset') offset?: string,
    @Query('soloNoLeidos') soloNoLeidos?: string,
    @Query('buscar') buscar?: string,
    @Query('categoria') categoria?: string,
    @Query('sinCategoria') sinCategoria?: string,
    @Query('preset') preset?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const presetValido: PresetFechaCorreo | undefined =
      preset === 'hoy' || preset === 'ayer' || preset === '7d' ? preset : undefined;

    return this.correosService.listar(req.user.id, req.user.name, {
      folderId: folderId || undefined,
      limite: limite ? Number(limite) : undefined,
      offset: offset ? Number(offset) : undefined,
      soloNoLeidos: soloNoLeidos === 'true',
      buscar: buscar?.trim() || undefined,
      categoria: categoria || undefined,
      sinCategoria: sinCategoria === 'true',
      // Un preset manda sobre el rango manual: son excluyentes en el lateral y
      // aqui solo se acepta uno para no cruzar dos limites de fecha.
      preset: presetValido,
      desde: desde || undefined,
      hasta: hasta || undefined,
    });
  }

  /** Cuerpo del correo, ya sanitizado. Nunca se devuelve HTML crudo. */
  @Get('mensajes/:id/cuerpo')
  async cuerpo(@Req() req: ReqConUsuario, @Param('id') id: string) {
    return this.correosService.cuerpo(id, req.user.id, this.urlBase(req));
  }

  /**
   * Origen publico de la API para armar URLs absolutas.
   *
   * El cuerpo del correo viaja dentro de un iframe `data:`, que no tiene base
   * resoluble, asi que las imagenes tienen que venir con URL completa. Se
   * respetan las cabeceras que envie el proxy inverso y, si no hay ninguna, se
   * cae al host de la peticion o a `CORREOS_PUBLIC_URL`.
   */
private urlBase(req: Request): string {
    const cab = req.headers as Record<string, string | string[] | undefined>;
    const primero = (v: string | string[] | undefined): string | undefined =>
      Array.isArray(v) ? v[0] : v;

    const protocolo =
      primero(cab['x-forwarded-proto'])?.split(',')[0].trim() || req.protocol || 'http';
    const host = primero(cab['x-forwarded-host'])?.split(',')[0].trim() || req.headers.host;
    if (host) return `${protocolo}://${host}`;

    const configurado = this.config.get<string>('CORREOS_PUBLIC_URL');
    return (configurado ?? '').replace(/\/+$/, '');
  }

  /** Metadata de adjuntos (nombre, tipo, tamano). El binario va aparte. */
  @Get('mensajes/:id/adjuntos')
  async adjuntos(@Req() req: ReqConUsuario, @Param('id') id: string) {
    return this.correosService.listarAdjuntos(id, req.user.id);
  }

  /**
   * Descarga un adjunto. Se transmite en streaming desde Graph hasta la respuesta
   * HTTP, sin escribir el archivo en disco.
   */
  @Get('mensajes/:id/adjuntos/:attachmentId')
  async descargar(
    @Req() req: ReqConUsuario,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, nombre, contentType } = await this.correosService.descargarAdjunto(
      id,
      attachmentId,
      req.user.id,
    );
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombre.replace(/["\\]/g, '_')}"`,
    );
    stream.pipe(res);
  }

  /** Carpetas que hay dentro de ASIGNADOS: util para corregir el mapeo. */
  @Get('carpetas-disponibles')
  async carpetas() {
    return this.carpetasService.listarCarpetasAsignadas();
  }

  /**
   * Mueve un correo dentro del buzon compartido. Requiere el permiso
   * Application "Mail.ReadWrite"; mientras no este concedido devuelve 403 con
   * el nombre exacto del permiso que falta.
   *
   * Solo se expone el destino "ASIGNADOS": mover entre carpetas de otros asesores
   * permitiria sacar correos del ambito de un asesor, que es justo lo que este
   * modulo debe evitar.
   */
  @Post('mensajes/:id/mover')
  async mover(
    @Req() req: ReqConUsuario,
    @Param('id') id: string,
    @Body() body: { destino?: string },
  ) {
    const destino = body?.destino === 'asignados' ? await this.carpetasService.carpetaPadreId() : null;
    if (!destino) {
      throw new BadRequestException(
        'Destino no valido. Solo se admite { "destino": "asignados" }.',
      );
    }
    const { graphMessageId } = await this.correosService.obtenerMensajePropio(id, req.user.id);
    return this.correosService.moverCorreo(graphMessageId, destino, req.user.id);
  }

  /** Copia un correo en ASIGNADOS conservando el original. */
  @Post('mensajes/:id/copiar')
  async copiar(
    @Req() req: ReqConUsuario,
    @Param('id') id: string,
  ) {
    const destino = await this.carpetasService.carpetaPadreId();
    const { graphMessageId } = await this.correosService.obtenerMensajePropio(id, req.user.id);
    return this.correosService.copiarCorreo(graphMessageId, destino, req.user.id);
  }

  /**
   * Fuerza una pasada de sincronizacion ahora, sin esperar el intervalo.
   *
   * @param manual `true` solo cuando lo pide el asesor con el boton. El frontend
   * tambien llama a este endpoint al abrir la bandeja y cada 60 s como red de
   * seguridad del socket, y esas llamadas NO deben saltarse el cooldown por 403:
   * si lo hicieran, la ausencia del permiso Mail.Read se convertiria en 60
   * peticiones por asesor y minuto a una API que esta respondiendo con error.
   */
  @Post('sincronizar')
  async sincronizar(@Req() req: ReqConUsuario, @Query('manual') manual?: string) {
    // Si el job estaba en cooldown por falta de permiso, el clic en "Buscar
    // nuevos" debe reintentar ya: puede que el permiso se acaba de conceder.
    if (manual === 'true') this.syncService.reiniciarPermisos();
    return this.syncService.sincronizarAsesor(req.user.id, req.user.name);
  }
}
