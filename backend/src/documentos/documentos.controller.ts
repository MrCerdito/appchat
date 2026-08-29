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
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { MAPA_ROLES, ROLES_DEFAULT } from './roles.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Throttle } from '@nestjs/throttler';

// Directorio donde se guardan los PDFs subidos
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'documentos');

@Controller('documentos')
export class DocumentosController {
  constructor(
    private readonly docService: DocumentosService,
    private readonly configuracionService: ConfiguracionService,
  ) {}

  // Normaliza el texto igual que la IA (minúsculas, sin tildes) para comparar temas.
  private normalizarTexto(texto: string): string {
    return (texto ?? '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // Coincidencia de tema con límites de palabra (mismo criterio que la IA).
  private coincideTema(mensaje: string, tema: string): boolean {
    const msg = this.normalizarTexto(mensaje);
    const t = this.normalizarTexto(tema);
    if (!t) return false;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i').test(msg);
  }

  private normalizarRol(rol: string): string {
    const r = this.normalizarTexto(rol ?? '');
    if (r.includes('admin') || r.includes('administrador')) return 'administrador';
    if (r.includes('docente') || r.includes('profesor')) return 'docente';
    if (r.includes('padre') || r.includes('madre') || r.includes('acudiente')) return 'padre';
    return 'estudiante';
  }

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
      instructivo?: string; // 'true' | 'false' desde FormData
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
        instructivo:
          body.instructivo === 'true' || body.instructivo === '1' || body.instructivo === 'on',
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
      nombre?: string; // nuevo nombre (para renombrar)
      descripcion: string;
      categoria?: string;
      colegio: string | null;
      rolesPermitidos: string;
      instructivo?: boolean;
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
    body: { query: string; rol?: string; topK?: number },
  ) {
    return this.docService.buscarRelevantes(
      body.query,
      body.rol || undefined,
      body.topK ? Number(body.topK) : 8,
    );
  }

  // ── Buscar documentos públicos (widget cliente — FAQ) ─────────────────────
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public-search')
  async buscarPublico(
    @Body()
    body: { query: string; rol?: string; topK?: number },
  ) {
    // Los temas restringidos del rol también aplican a la búsqueda pública (FAQ):
    // si la consulta coincide con un tema restringido, NO se entrega documento alguno
    // (mismo comportamiento que cuando el cliente escribe la solicitud a la IA).
    try {
      const rolNorm = this.normalizarRol(body.rol || 'estudiante');
      const global = (await this.configuracionService.getGlobal()) as any;
      const rolCfg = global?.aiPromptConfig?.roles?.[rolNorm];
      const temasRestringidos: string[] = Array.isArray(rolCfg?.temasRestringidos)
        ? rolCfg.temasRestringidos
        : [];
      if (temasRestringidos.length > 0) {
        const q = body.query || '';
        const esRestringido = temasRestringidos.some((t) => this.coincideTema(q, t));
        if (esRestringido) return { documentos: [] };
      }
    } catch {
      // Si no se puede leer la config, se continúa con la búsqueda normal.
    }

    const result = await this.docService.buscarRelevantes(
      body.query,
      body.rol || undefined,
      body.topK ? Number(body.topK) : 3,
    );
    return { documentos: result.documentos ?? [] };
  }
}
