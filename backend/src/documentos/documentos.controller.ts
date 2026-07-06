import {
  Controller, Post, Get, Delete, Patch, Param, Body,
  UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { DocumentosService } from './documentos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';


// Directorio donde se guardan los PDFs subidos
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'documentos');

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly docService: DocumentosService) {}

  // ── Listar todos los documentos (admin) ───────────────────────────────────
  @Get()
  @UseGuards(JwtAuthGuard)
  listar() {
    return this.docService.listar();
  }

  // ── Subir y procesar PDF ──────────────────────────────────────────────────
  // POST /documentos/upload
  // Form-data: file (PDF), nombre, descripcion, categoria, colegio (opcional)
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // Crear el directorio si no existe
          if (!existsSync(UPLOADS_DIR)) {
            mkdirSync(UPLOADS_DIR, { recursive: true });
          }
          cb(null, UPLOADS_DIR);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
          cb(null, unique + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se aceptan archivos PDF'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB máximo
    }),
  )
  async upload(
    @UploadedFile() file: any,
    @Body() body: {
      nombre          : string;
      descripcion     : string;
      categoria       : string;
      colegio?        : string;
      rolesPermitidos?: string; // string separado por comas
    },
  ) {
    if (!file) throw new BadRequestException('Archivo PDF requerido');
    if (!body.nombre?.trim()) throw new BadRequestException('El nombre es requerido');

    // Leer el buffer del archivo guardado en disco
    const { readFileSync } = require('fs');
    const pdfBuffer = readFileSync(file.path);

    // URL pública absoluta — debe apuntar al backend, no al frontend
    const backendUrl = process.env.APP_URL ?? 'http://localhost:3001';
    const pdfUrl     = `${backendUrl}/uploads/documentos/${file.filename}`;

    // Parsear roles — vienen como string separado por comas
    // Normalización de roles (sinónimos)
const mapaRoles: Record<string, string> = {
  'admin'        : 'administrador',
  'administrador': 'administrador',
  'docente'      : 'docente',
  'profesor'     : 'docente',
  'estudiante'   : 'estudiante',
  'alumno'       : 'estudiante',
  'padre'        : 'padre',
  'madre'        : 'padre',
  'acudiente'    : 'padre',
};

const rolesPermitidos = body.rolesPermitidos
  ? body.rolesPermitidos
      .split(',')
      .map((r: string) => mapaRoles[r.trim().toLowerCase()] ?? r.trim().toLowerCase())
      .filter(Boolean)
  : ['administrador', 'docente', 'estudiante', 'padre'];

    return this.docService.procesarPdf({
      nombre         : body.nombre.trim(),
      descripcion    : body.descripcion?.trim() ?? '',
      categoria      : body.categoria?.trim() ?? 'general',
      colegio        : body.colegio?.trim() || undefined,
      rolesPermitidos,
      pdfBuffer,
      pdfPath        : file.path,
      pdfUrl,
    });
  }

  // ── Actualizar roles y metadatos de un documento ─────────────────────────
  @Patch(':nombre/roles')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  actualizarRoles(
    @Param('nombre') nombre: string,
    @Body() body: {
      descripcion    : string;
      categoria      : string;
      colegio        : string | null;
      rolesPermitidos: string;
    },
  ) {
    return this.docService.actualizarRoles(decodeURIComponent(nombre), body);
  }

  // ── Eliminar documento ────────────────────────────────────────────────────
  @Delete(':nombre')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  eliminar(@Param('nombre') nombre: string) {
    return this.docService.eliminar(decodeURIComponent(nombre));
  }

  // ── Buscar documentos relevantes (para testing) ───────────────────────────
  @Post('search')
  @UseGuards(JwtAuthGuard)
  buscar(@Body() body: { query: string; colegio?: string; topK?: number }) {
    return this.docService.buscarRelevantes(
      body.query,
      body.colegio,
      undefined,
      body.topK ? Number(body.topK) : 4,
    );
  }
}