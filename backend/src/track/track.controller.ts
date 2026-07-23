import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ComunicadosService } from '../comunicados/comunicados.service';

@Controller('track')
export class TrackController {
  constructor(private readonly comunicadosService: ComunicadosService) {}

  @Get('open/:id/:email')
  async trackOpen(
    @Param('id') id: string,
    @Param('email') email: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const ua = req.headers['user-agent'] ?? '';

    await this.comunicadosService
      .registrarApertura(id, decodeURIComponent(email), ua, ip)
      .catch(() => {});

    // Devolver pixel 1x1 transparente
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    );
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(pixel);
  }

  @Get('click/:id/:email')
  async trackClick(
    @Param('id') id: string,
    @Param('email') email: string,
    @Query('url') url: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const ua = req.headers['user-agent'] ?? '';

    const destino = await this.comunicadosService
      .registrarClic(
        id,
        decodeURIComponent(email),
        decodeURIComponent(url),
        ua,
        ip,
      )
      .catch(() => decodeURIComponent(url));

    const safeUrl =
      destino?.startsWith('http://') || destino?.startsWith('https://')
        ? destino
        : '/';
    res.redirect(safeUrl);
  }
}
