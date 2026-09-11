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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { ComunicadosService } from './comunicados.service';
import { BounceService } from './bounce.service';
import { IsString, IsArray, IsOptional, MaxLength } from 'class-validator';

export class ComunicadoDto {
  @IsString() asunto: string;
  @IsString() cuerpo: string;
  @IsArray() destinatarios: { email: string; nombre: string }[];
  @IsOptional() @IsArray() design?: unknown[] | null;
}

export class ComunicadoTemplateDto {
  @IsString() @MaxLength(150) name: string;
  @IsString() @MaxLength(300) asunto: string;
  @IsString() cuerpo: string;
  @IsOptional() @IsArray() design?: unknown[] | null;
}

@Controller('comunicados')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permiso('comunicados')
export class ComunicadosController {
  constructor(
    private readonly service: ComunicadosService,
    private readonly bounce: BounceService,
  ) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.id, req.user.role);
  }

  @Get('colegios')
  getColegios() {
    return this.service.getColegios();
  }

  @Get('templates')
  getTemplates() {
    return this.service.findTemplates();
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  saveTemplate(@Body() dto: ComunicadoTemplateDto, @Request() req: any) {
    return this.service.createTemplate(
      {
        name: dto.name,
        asunto: dto.asunto,
        cuerpo: dto.cuerpo,
        design: dto.design ?? null,
      },
      req.user,
    );
  }

  @Put('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: ComunicadoTemplateDto) {
    return this.service.updateTemplate(id, {
      name: dto.name,
      asunto: dto.asunto,
      cuerpo: dto.cuerpo,
      design: dto.design ?? null,
    });
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @Get('smtp-cuota')
  getSmtpCuota() {
    return this.service.obtenerCuota();
  }

  @Post('check-bounces')
  checkBounces() {
    return this.bounce.revisarRebotesAhora();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('advisor', 'interno')
  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  saveDraft(@Body() dto: ComunicadoDto, @Request() req: any) {
    return this.service.saveDraft(
      dto.asunto,
      dto.cuerpo,
      dto.destinatarios,
      req.user,
      dto.design ?? null,
    );
  }

  @Roles('advisor', 'interno')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ComunicadoDto,
    @Request() req: any,
  ) {
    return this.service.updateDraft(
      id,
      dto.asunto,
      dto.cuerpo,
      dto.destinatarios,
      dto.design ?? null,
      req.user,
    );
  }

  @Roles('advisor', 'interno')
  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  async send(@Param('id') id: string, @Request() req: any) {
    return this.service.send(id, req.user);
  }

  @Roles('advisor', 'interno')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.service.getStats(id);
  }
}
