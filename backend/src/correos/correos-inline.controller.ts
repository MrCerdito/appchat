import { Controller, ForbiddenException, Get, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Stream } from 'stream';
import { Public } from '../auth/public.decorator';
import { CorreosService } from './correos.service';

/**
 * Imagenes embebidas de los correos (`cid:`).
 *
 * Va en un controller aparte y SIN `JwtAuthGuard` a proposito: la imagen se
 * carga con un `<img>` dentro de un iframe con `sandbox`, y ese `img` no puede
 * enviar la cabecera `Authorization`. Por eso la credencial es la URL firmada
 * que el backend emite al sanitizar el cuerpo, que ata mensaje, adjunto y
 * vencimiento. Alterar cualquiera de los tres, o dejar pasar el vencimiento,
 * devuelve 403.
 *
 * No lleva `@Permiso('correos')`: la peticion no tiene usuario y por eso el
 * permiso de modulo no aplica. El alcance real lo acota la firma, que solo se
 * emite a quien ya puede leer ese buzon.
 *
 * Los bytes van de Graph a la respuesta en streaming: no se escriben ni en disco
 * ni en la base de datos, y `no-store` evita que queden en la cache del
 * navegador.
 */
@Public()
@Controller('correos')
export class CorreosInlineController {
  constructor(private readonly correosService: CorreosService) {}

  @Get('mensajes/:id/inline/:attachmentId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async imagen(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Query('e') exp: string,
    @Query('f') firma: string,
    @Res() res: Response,
  ): Promise<void> {
    const vencido = Number(exp);
    if (!Number.isFinite(vencido)) {
      throw new ForbiddenException('Enlace de imagen no valido.');
    }

    let stream: Stream;
    let contentType: string;
    try {
      const salida = await this.correosService.imagenInline(id, attachmentId, vencido, firma);
      stream = salida.stream;
      contentType = salida.contentType;
    } catch (err) {
      // Si Graph esta saturado se avisa cuando reintentar en vez de castigar al
      // cliente con un error seco.
      const status = (err as { status?: number })?.status;
      if (status && status >= 500) res.setHeader('Retry-After', '5');
      throw err;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    stream.pipe(res);
  }
}