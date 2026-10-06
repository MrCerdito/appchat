import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { CuboCorreo } from './categoria-correo.util';
import { CorreosAdminService } from './correos-admin.service';

type ReqConUsuario = Request & { user: any };

/** Los seis cubos de la tabla, para validar el parametro de filtro. */
const CUBOS: CuboCorreo[] = [
  'pendiente',
  'en_proceso',
  'gestionado',
  'escalado',
  'resuelto',
  'otros',
];

/**
 * Vista de correo para el admin: SLA por asesor y consulta de la bandeja de
 * cualquiera de ellos.
 *
 * Va en un controller APARTE y no como parametro en `CorreosController`, porque
 * ahi el asesor sale siempre del token y a proposito no se acepta su id desde el
 * cliente: es lo que impide que un asesor lea la carpeta de otro cambiando la URL.
 * Mezclar las dos cosas permitiria justo eso, asi que esta ruta exige rol de
 * admin y por separado el permiso del modulo.
 *
 * Es de solo lectura. No expone mover, copiar ni responder, para que el admin no
 * pueda cambiar el estado de una carpeta que despues se mide.
 */
@Controller('correos/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Permiso('correos')
export class CorreosAdminController {
  constructor(
    private readonly admin: CorreosAdminService,
    private readonly config: ConfigService,
  ) {}

  /**
   * La tabla completa: una fila por asesor con sus conteos por estado, su nivel
   * de SLA y la fecha de la ultima sincronizacion de su carpeta.
   */
  @Get('resumen')
  async resumen() {
    return this.admin.resumen();
  }

  /**
   * Bandeja de un asesor. `cubo` filtra por el estado del SLA y no por la
   * categoria cruda de Outlook, para que el listado cuadre con el conteo.
   */
  @Get('asesores/:id/mensajes')
  async mensajes(
    @Param('id') id: string,
    @Query('limite') limite?: string,
    @Query('offset') offset?: string,
    @Query('soloNoLeidos') soloNoLeidos?: string,
    @Query('buscar') buscar?: string,
    @Query('cubo') cubo?: string,
  ) {
    const cuboValido = CUBOS.find((c) => c === cubo);

    return this.admin.mensajesDeAsesor(id, {
      limite: limite ? Number(limite) : undefined,
      offset: offset ? Number(offset) : undefined,
      soloNoLeidos: soloNoLeidos === 'true',
      buscar: buscar?.trim() || undefined,
      // Un cubo desconocido se ignora en vez de fallar: es un parametro de
      // pantalla, no una peticion de negocio.
      cubo: cuboValido,
    });
  }

  /**
   * Cuerpo de un correo del asesor, ya sanitizado por el backend. El HTML crudo
   * de Graph no sale nunca; el frontend lo pinta dentro de un iframe `sandbox`.
   */
  @Get('asesores/:id/mensajes/:mensajeId/cuerpo')
  async cuerpo(
    @Param('id') id: string,
    @Param('mensajeId') mensajeId: string,
    @Req() req: ReqConUsuario,
  ) {
    return this.admin.cuerpoDeAsesor(id, mensajeId, this.urlBase(req));
  }

  /**
   * Origen publico de la API para armar URLs absolutas.
   *
   * El cuerpo viaja dentro de un iframe `data:`, que no tiene base resoluble, asi
   * que las imagenes tienen que venir con URL completa. Se respetan las cabeceras
   * del proxy inverso y, si no hay ninguna, se cae al host de la peticion o a
   * `CORREOS_PUBLIC_URL`.
   */
  private urlBase(req: Request): string {
    const cab = req.headers as Record<string, string | string[] | undefined>;
    const primero = (v: string | string[] | undefined): string | undefined =>
      Array.isArray(v) ? v[0] : v;

    const protocolo =
      primero(cab['x-forwarded-proto'])?.split(',')[0].trim() || req.protocol || 'http';
    const host = primero(cab['x-forwarded-host']) || req.headers.host;
    if (host) return `${protocolo}://${host}`;

    const configurado = this.config.get<string>('CORREOS_PUBLIC_URL');
    return (configurado ?? '').replace(/\/+$/, '');
  }
}