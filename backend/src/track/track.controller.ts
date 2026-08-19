import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ComunicadosService } from '../comunicados/comunicados.service';
import { TrackDedupService } from './track-dedup.service';

@Controller('track')
export class TrackController {
  constructor(
    private readonly comunicadosService: ComunicadosService,
    private readonly dedup: TrackDedupService,
  ) {}

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

    const esNuevo = await this.dedup.registrarSiNuevo('open', id, email);
    if (esNuevo) {
      await this.comunicadosService
        .registrarApertura(id, decodeURIComponent(email), ua, ip)
        .catch(() => {});
    }

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

    const decodedUrl = decodeURIComponent(url);

    const esNuevo = await this.dedup.registrarSiNuevo('click', id, email);
    if (esNuevo) {
      await this.comunicadosService
        .registrarClic(id, decodeURIComponent(email), decodedUrl, ua, ip)
        .catch(() => {});
    }

    const safeUrl =
      decodedUrl?.startsWith('http://') || decodedUrl?.startsWith('https://')
        ? decodedUrl
        : '/';
    // Validate redirect stays on same domain or is a relative path
    try {
      const parsed = new URL(safeUrl);
      const host = req.hostname || 'localhost';
      if (!parsed.hostname.endsWith(host) && parsed.hostname !== host) {
        return res.redirect('/');
      }
    } catch {
      // Not a valid URL — treat as relative path, safe
    }
    res.redirect(safeUrl);
  }
}
