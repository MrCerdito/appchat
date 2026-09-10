import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ChangelogCategoria } from './changelog.entity';
import { ChangelogsService } from './changelogs.service';

export class ChangelogDto {
  @IsString()
  @MaxLength(300)
  titulo: string;

  @IsOptional()
  @IsIn(['nuevo', 'mejora', 'correccion'])
  categoria?: ChangelogCategoria;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string | null;

  @IsString()
  cuerpo: string;

  @IsOptional()
  @IsArray()
  design?: unknown[] | null;

  @IsOptional()
  @IsBoolean()
  publicar?: boolean;

  @IsOptional()
  @IsString()
  publicadoEl?: string | null;
}

@Controller('changelogs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChangelogsController {
  constructor(private readonly service: ChangelogsService) {}

  @Get('pendientes')
  pendientes(@Request() req: any) {
    return this.service.pendientes(req.user.id, req.user.role);
  }

  @Post(':id/visto')
  @HttpCode(HttpStatus.OK)
  marcarVisto(@Param('id') id: string, @Request() req: any) {
    return this.service.marcarVisto(id, req.user.id);
  }

  @Roles('superadmin')
  @Get('admin')
  listarAdmin() {
    return this.service.listarAdmin();
  }

  @Roles('superadmin')
  @Post('admin')
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: ChangelogDto, @Request() req: any) {
    return this.service.crear(dto, req.user.id);
  }

  @Roles('superadmin')
  @Put('admin/:id')
  editar(@Param('id') id: string, @Body() dto: ChangelogDto) {
    return this.service.editar(id, dto);
  }

  @Roles('superadmin')
  @Delete('admin/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param('id') id: string) {
    return this.service.eliminar(id);
  }
}