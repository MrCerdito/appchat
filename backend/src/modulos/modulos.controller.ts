import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { ModulosService } from './modulos.service';

class CreateModuloDto {
  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

class UpdateModuloDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

class AddDesarrolladorDto {
  @IsString()
  userId: string;
}

@Controller('modulos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'advisor', 'desarrollador')
export class ModulosController {
  constructor(private readonly svc: ModulosService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get('desarrolladores')
  findDesarrolladores() {
    return this.svc.findDesarrolladores();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles('admin', 'advisor')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ValidationPipe({ whitelist: true })) dto: CreateModuloDto) {
    return this.svc.create(dto);
  }

  @Roles('admin', 'advisor')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateModuloDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Roles('admin', 'advisor')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Roles('admin', 'advisor')
  @Post(':id/desarrolladores')
  @HttpCode(HttpStatus.CREATED)
  addDesarrollador(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: AddDesarrolladorDto,
  ) {
    return this.svc.addDesarrollador(id, dto.userId);
  }

  @Roles('admin', 'advisor')
  @Delete(':id/desarrolladores/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDesarrollador(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.svc.removeDesarrollador(id, userId);
  }
}
