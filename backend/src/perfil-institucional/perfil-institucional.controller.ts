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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
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
  ReorderCategoriasDto,
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

  @Patch('instituciones/:id/email')
  actualizarEmail(
    @Param('id') id: string,
    @Body('email') email: string | null,
    @Request() req: { user: { id: string } },
  ) {
    return this.svc.actualizarEmailInstitucion(id, email?.trim() || null, req.user.id);
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
  crearCampo(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreatePiCampoDto,
  ) {
    return this.svc.crearCampo(dto);
  }

  @Patch('campos/:id')
  actualizarCampo(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdatePiCampoDto,
  ) {
    return this.svc.actualizarCampo(id, dto);
  }

  @Post('campos/:id/duplicar')
  duplicarCampo(@Param('id') id: string) {
    return this.svc.duplicarCampo(id);
  }

  @Delete('campos/:id')
  eliminarCampo(@Param('id') id: string) {
    return this.svc.eliminarCampo(id);
  }

  // ── Categorías ───────────────────────────────────────────────────────────

  @Get('categorias')
  listarCategorias() {
    return this.svc.listarCategorias();
  }

  @Post('categorias')
  crearCategoria(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreatePiCategoriaDto,
  ) {
    return this.svc.crearCategoria(dto);
  }

  @Patch('categorias/:id')
  actualizarCategoria(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdatePiCategoriaDto,
  ) {
    return this.svc.actualizarCategoria(id, dto);
  }

  @Delete('categorias/:id')
  eliminarCategoria(@Param('id') id: string) {
    return this.svc.eliminarCategoria(id);
  }

  @Put('categorias/reordenar')
  reordenarCategorias(
    @Body(new ValidationPipe({ whitelist: true })) dto: ReorderCategoriasDto,
  ) {
    return this.svc.reordenarCategorias(dto.items);
  }

  // ── Exportar / Importar ─────────────────────────────────────────────────

  @Get('exportar')
  async exportar(@Res() res: Response) {
    const buffer = await this.svc.exportarExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=instituciones.xlsx');
    res.send(buffer);
  }

  @Get('exportar/:id')
  async exportarFicha(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.svc.exportarFichaExcel(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ficha-${id.substring(0, 8)}.xlsx`);
    res.send(buffer);
  }

  @Post('importar')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'perfil');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) =>
          cb(null, `import-${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ];
        if (!allowed.includes(file.mimetype) && !file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
          return cb(new BadRequestException('Solo se permiten archivos Excel o CSV'), false);
        }
        cb(null, true);
      },
    }),
  )
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) throw new BadRequestException('Archivo no recibido');
    return this.svc.importarExcel(file.path, req.user.id);
  }

  // ── Historial ────────────────────────────────────────────────────────────

  @Get('historial')
  listarHistorial(
    @Query('colegioId') colegioId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.listarHistorial(colegioId || undefined, page, limit, desde, hasta);
  }
}
