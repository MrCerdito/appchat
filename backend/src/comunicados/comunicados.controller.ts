import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ComunicadosService } from './comunicados.service';
import { IsString, IsArray } from 'class-validator';
import { Public } from '../auth/public.decorator';

export class ComunicadoDto {
  @IsString() asunto: string;
  @IsString() cuerpo: string;
  @IsArray() destinatarios: { email: string; nombre: string }[];
}

@Controller('comunicados')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComunicadosController {
  constructor(private readonly service: ComunicadosService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.id, req.user.role);
  }

  @Get('colegios')
  getColegios() {
    return this.service.getColegios();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('admin')
  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  saveDraft(@Body() dto: ComunicadoDto, @Request() req: any) {
    return this.service.saveDraft(
      dto.asunto,
      dto.cuerpo,
      dto.destinatarios,
      req.user,
    );
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: ComunicadoDto) {
    return this.service.updateDraft(
      id,
      dto.asunto,
      dto.cuerpo,
      dto.destinatarios,
    );
  }

  @Roles('admin')
  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(@Param('id') id: string) {
    const result = await this.service.send(id);
    if (result.status === 'failed') {
      throw new InternalServerErrorException(
        'Ningún correo pudo ser entregado',
      );
    }
    return result;
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.service.getStats(id);
  }
  @Public()
  @Post('webhook/resend')
  async resendWebhook(@Body() body: any, @Req() req: any) {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const isProd = process.env.NODE_ENV === 'production';
    if (!secret) {
      if (isProd) {
        throw new UnauthorizedException(
          'RESEND_WEBHOOK_SECRET no configurado',
        );
      }
      // Fail-open solo en development si el operador no configuró el secreto.
      // eslint-disable-next-line no-console
      console.warn(
        '[Comunicados] RESEND_WEBHOOK_SECRET no configurado: el webhook se acepta sin verificar firma.',
      );
    } else if (!this.isValidResendSignature(req, secret)) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    const { type, data } = body;

    // Bounce o fallo de entrega
    if (type === 'email.bounced' || type === 'email.delivery_delayed') {
      const email = data?.to?.[0];
      const reason = data?.bounce?.message ?? 'Rebote de correo';
      if (email) {
        await this.service.markBounced(email, reason);
      }
    }
    return { ok: true };
  }

  private isValidResendSignature(req: any, secret: string): boolean {
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body ?? {}));

    // Legacy: X-Resend-Signature = hex(HMAC-SHA256(rawBody, secret))
    const legacy = req.headers['x-resend-signature'];
    if (legacy) {
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      try {
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(String(legacy).trim(), 'utf8');
        if (a.length === b.length && timingSafeEqual(a, b)) return true;
      } catch {}
    }

    // Svix (Resend moderno): svix-id, svix-timestamp, svix-signature "v1,base64"
    const svixId = req.headers['svix-id'];
    const svixTs = req.headers['svix-timestamp'];
    const svixSig = req.headers['svix-signature'];
    if (svixId && svixTs && svixSig) {
      const signedContent = `${svixId}.${svixTs}.${rawBody.toString('utf8')}`;
      const expected = createHmac('sha256', secret).update(signedContent).digest('base64');
      const provided = String(svixSig).split(' ').map((p) => p.split(',')[1]);
      for (const sig of provided) {
        if (!sig) continue;
        try {
          const a = Buffer.from(expected, 'utf8');
          const b = Buffer.from(sig, 'utf8');
          if (a.length === b.length && timingSafeEqual(a, b)) return true;
        } catch {}
      }
    }

    return false;
  }
}
