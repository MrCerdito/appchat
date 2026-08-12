import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'; // Añadir unlinkSync
import { DocumentosService } from './documentos.service';
import { MAPA_ROLES, ROLES_DEFAULT } from './roles.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'advisor')
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
    @Body()
    body: {
      nombre: string;
      descripcion: string;
      categoria: string;
      colegio?: string;
      rolesPermitidos?: string; // string separado por comas
    },
  ) {
    if (!file) throw new BadRequestException('Archivo PDF requerido');
    if (!body.nombre?.trim())
      throw new BadRequestException('El nombre es requerido');

    // Leer el buffer del archivo guardado en disco
    const pdfBuffer = readFileSync(file.path);

    // URL pública absoluta — debe apuntar al backend, no al frontend
    const backendUrl = process.env.APP_URL ?? 'http://localhost:3001';
    const pdfUrl = `${backendUrl}/uploads/documentos/${file.filename}`;

    // Parsear roles — vienen como string separado por comas
    // Normalización de roles (sinónimos) → siempre valores canónicos
    const rolesPermitidos = body.rolesPermitidos
      ? body.rolesPermitidos
          .split(',')
          .map(
            (r: string) =>
              MAPA_ROLES[r.trim().toLowerCase()] ?? r.trim().toLowerCase(),
          )
          .filter(Boolean)
      : ROLES_DEFAULT;

    try {
      return await this.docService.procesarPdf({
        nombre: body.nombre.trim(),
        descripcion: body.descripcion?.trim() ?? '',
        categoria: body.categoria?.trim() ?? 'general',
        colegio: body.colegio?.trim() || undefined,
        rolesPermitidos,
        pdfBuffer,
        pdfPath: file.path,
        pdfUrl,
      });
    } catch (error) {
      // Si el procesamiento falla, eliminar el archivo físico
      unlinkSync(file.path);
      throw error; // Re-lanzar el error para que Nest lo maneje
    }
  }

  // ── Actualizar roles y metadatos de un documento ─────────────────────────
  @Patch(':nombre/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'advisor')
  @HttpCode(HttpStatus.OK)
  actualizarRoles(
    @Param('nombre') nombre: string,
    @Body()
    body: {
      descripcion: string;
      categoria: string;
      colegio: string | null;
      rolesPermitidos: string;
    },
  ) {
    return this.docService.actualizarRoles(decodeURIComponent(nombre), body);
  }

  // ── Eliminar documento ────────────────────────────────────────────────────
  @Delete(':nombre')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'advisor')
  @HttpCode(HttpStatus.OK)
  eliminar(@Param('nombre') nombre: string) {
    return this.docService.eliminar(decodeURIComponent(nombre));
  }

  // ── Reparar embedding_vec desde el JSON guardado (admin) ──────────────────
  @Post('reparar-embeddings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  repararEmbeddings() {
    return this.docService.repararEmbeddingVec();
  }

  // ── Reparar roles canónicos, colegio_norm y embeddings (admin) ─────────────
  @Post('reparar-metadata')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  repararMetadata() {
    return this.docService.repararMetadata();
  }

  // ── Buscar documentos relevantes (para testing) ───────────────────────────
  @Post('search')
  @UseGuards(JwtAuthGuard)
  buscar(
    @Body()
    body: { query: string; colegio?: string; rol?: string; topK?: number },
  ) {
    return this.docService.buscarRelevantes(
      body.query,
      body.colegio,
      body.rol || undefined,
      body.topK ? Number(body.topK) : 4,
    );
  }
}
