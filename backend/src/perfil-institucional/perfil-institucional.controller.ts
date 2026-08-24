import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { PerfilInstitucionalService } from './perfil-institucional.service';
import {
  CreatePiCampoDto,
  CreatePiCategoriaDto,
  UpdatePiCampoDto,
  UpdatePiCategoriaDto,
  UpsertPiValoresDto,
} from './dto/perfil-institucional.dto';

@Controller('perfil-institucional')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PerfilInstitucionalController {
  constructor(private readonly svc: PerfilInstitucionalService) {}

  // ── Instituciones ────────────────────────────────────────────────────────

  @Get('instituciones')
  listarInstituciones(@Query() query: Record<string, string>) {
    return this.svc.listarInstituciones(query);
  }

  @Get('instituciones/:id')
  obtenerFicha(@Param('id') id: string) {
    return this.svc.obtenerFicha(id);
  }

  @Post('instituciones/:id/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'perfil');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) =>
          cb(null, `tmp-${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Solo se permiten JPEG, PNG, WebP o GIF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async subirLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) throw new BadRequestException('Archivo no recibido');
    const urlPublica = this.svc.moverArchivoLogo(file, id);
    return this.svc.subirLogo(id, file.path, urlPublica, req.user.id);
  }

  @Put('instituciones/:id/valores')
  guardarValores(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpsertPiValoresDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.svc.guardarValores(id, dto, req.user.id);
  }

  @Patch('instituciones/:id/estado')
  @Roles('admin')
  cambiarEstado(
    @Param('id') id: string,
    @Body('activo', ParseBoolPipe) activo: boolean,
    @Request() req: { user: { id: string } },
  ) {
    return this.svc.cambiarEstado(id, activo, req.user.id);
  }

  // ── Campos ───────────────────────────────────────────────────────────────

  @Get('campos')
  listarCampos() {
    return this.svc.listarCampos();
  }

  @Post('campos')
  @Roles('admin')
  crearCampo(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreatePiCampoDto,
  ) {
    return this.svc.crearCampo(dto);
  }

  @Patch('campos/:id')
  @Roles('admin')
  actualizarCampo(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdatePiCampoDto,
  ) {
    return this.svc.actualizarCampo(id, dto);
  }

  @Post('campos/:id/duplicar')
  @Roles('admin')
  duplicarCampo(@Param('id') id: string) {
    return this.svc.duplicarCampo(id);
  }

  @Delete('campos/:id')
  @Roles('admin')
  eliminarCampo(@Param('id') id: string) {
    return this.svc.eliminarCampo(id);
  }

  // ── Categorías ───────────────────────────────────────────────────────────

  @Get('categorias')
  listarCategorias() {
    return this.svc.listarCategorias();
  }

  @Post('categorias')
  @Roles('admin')
  crearCategoria(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreatePiCategoriaDto,
  ) {
    return this.svc.crearCategoria(dto);
  }

  @Patch('categorias/:id')
  @Roles('admin')
  actualizarCategoria(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdatePiCategoriaDto,
  ) {
    return this.svc.actualizarCategoria(id, dto);
  }

  @Delete('categorias/:id')
  @Roles('admin')
  eliminarCategoria(@Param('id') id: string) {
    return this.svc.eliminarCategoria(id);
  }

  // ── Historial ────────────────────────────────────────────────────────────

  @Get('historial')
  listarHistorial(
    @Query('colegioId') colegioId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listarHistorial(colegioId || undefined, page, limit);
  }
}
