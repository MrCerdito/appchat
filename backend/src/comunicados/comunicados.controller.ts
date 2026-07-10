import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComunicadosService } from './comunicados.service';
import { IsString, IsArray } from 'class-validator';

export class ComunicadoDto {
  @IsString() asunto: string;
  @IsString() cuerpo: string;
  @IsArray() destinatarios: { email: string; nombre: string }[];
}

@Controller('comunicados')
@UseGuards(JwtAuthGuard)
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

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: ComunicadoDto) {
    return this.service.updateDraft(
      id,
      dto.asunto,
      dto.cuerpo,
      dto.destinatarios,
    );
  }

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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.service.getStats(id);
  }
  @Post('webhook/resend')
  async resendWebhook(@Body() body: any) {
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
}
