import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Documento } from './entities/documento.entity';
import { ConfigService } from '@nestjs/config';
import { normalizarRolesCsv } from './roles.util';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de alias de roles — normaliza cualquier variante al buscar en la BD.
// "admin", "Administrador", "administrador" → matchean todos.
// ─────────────────────────────────────────────────────────────────────────────
const ROL_ALIASES: Record<string, string[]> = {
  administrador: ['administrador', 'admin'],
  docente: ['docente', 'profesor'],
  estudiante: ['estudiante', 'alumno'],
  padre: ['padre', 'madre', 'acudiente'],
};

function resolverAliases(rol?: string): string[] {
  if (!rol) return [];
  const r = rol
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (ROL_ALIASES[r]) return ROL_ALIASES[r];
  const entrada = Object.values(ROL_ALIASES).find((arr) => arr.includes(r));
  return entrada ?? [r];
}

@Injectable()
export class DocumentosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentosService.name);
  private readonly apiKey: string;
  private readonly embedUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

  private readonly CHUNK_SIZE = 1200;
  private readonly CHUNK_OVERLAP = 150;
  private readonly EMBEDDING_DIM = 768;
  // Umbral de recuperación: por debajo de 0.60 el chunk se trae de la BD.
  private readonly RETRIEVAL_THRESHOLD = 0.60;
  // Umbral de "match fuerte": solo documentos con distancia menor a este valor
  // se adjuntan a la respuesta / contexto de la IA (evita ruido de matches débiles).
  private readonly DOC_MATCH_THRESHOLD = 0.45;

  constructor(
    @InjectRepository(Documento)
    private readonly docRepo: Repository<Documento>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
      await this.dataSource.query(
        `ALTER TABLE documentos ADD COLUMN IF NOT EXISTS embedding_vec vector(${this.EMBEDDING_DIM})`,
      );
      this.logger.log('[RAG] pgvector inicializado (extensión + columna embedding_vec)');
    } catch (error) {
      this.logger.error(
        '[RAG] No se pudo inicializar pgvector:',
        (error as Error).message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBIR Y PROCESAR PDF
  // ─────────────────────────────────────────────────────────────────────────
  async procesarPdf(data: {
    nombre: string;
    descripcion: string;
    categoria: string;
    colegio?: string;
    rolesPermitidos: string[];
    pdfBuffer: Buffer;
    pdfPath: string;
    pdfUrl: string;
  }): Promise<{ ok: boolean; chunks: number; nombre: string }> {
    const texto = await this.extraerTextoPdf(data.pdfBuffer);
    if (!texto.trim()) throw new Error('El PDF no contiene texto extraíble');

    const chunks = this.dividirEnChunks(texto);
    this.logger.log(
      `[RAG] "${data.nombre}": ${chunks.length} chunks generados`,
    );

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      // Eliminar documentos existentes con el mismo nombre (parte de la transacción)
      await transactionalEntityManager.delete(Documento, { nombre: data.nombre });

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.generarEmbedding(chunks[i]);

        const doc = transactionalEntityManager.create(Documento, {
          nombre: data.nombre,
          descripcion: data.descripcion,
          contenido: chunks[i],
          chunkIndex: i,
          totalChunks: chunks.length,
          embedding: JSON.stringify(embedding),
          pdfPath: data.pdfPath,
          pdfUrl: data.pdfUrl,
          colegio: data.colegio ?? null,
          categoria: data.categoria,
          rolesPermitidos: data.rolesPermitidos.join(','),
          activo: true,
        });

        const saved = await transactionalEntityManager.save(Documento, doc);

        await transactionalEntityManager
          .query(
            `UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`,
            [`[${embedding.join(',')}]`, saved.id],
          )
          .catch((err) => {
            this.logger.error(
              `[RAG] Error guardando embedding_vec para chunk ${i}:`,
              err?.message,
            );
            // Esto no debería lanzar, pero si ocurre, loguear y seguir o relanzar
            throw new Error(`Error al guardar embedding para chunk ${i}`);
          });

        this.logger.log(`[RAG] Chunk ${i + 1}/${chunks.length} guardado`);
      }
    }); // Fin de la transacción

    return { ok: true, chunks: chunks.length, nombre: data.nombre };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUSCAR DOCUMENTOS RELEVANTES
  // ─────────────────────────────────────────────────────────────────────────
  async buscarRelevantes(
    query: string,
    colegio?: string,
    rol?: string,
    topK = 3,
  ): Promise<{
    contexto: string;
    documentos: {
      nombre: string;
      pdfUrl: string | null;
      categoria: string | null;
    }[];
    chunks: {
      nombre: string;
      pdfUrl: string | null;
      categoria: string | null;
      chunkIndex: number;
      distancia: number | null;
      contenido: string;
    }[];
  }> {
    if (!query.trim()) return { contexto: '', documentos: [], chunks: [] };

    const queryEmbedding = await this.generarEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const aliases = resolverAliases(rol);
    this.logger.log(
      `[RAG] rol="${rol}" → aliases=${JSON.stringify(aliases)} | colegio="${colegio}"`,
    );

    let sql = `
      SELECT
        id, nombre, contenido, pdf_url, categoria, chunk_index, roles_permitidos,
        embedding_vec <=> $1::vector AS distancia
      FROM documentos
      WHERE activo = true
        AND embedding_vec IS NOT NULL
        AND embedding_vec <=> $1::vector < ${this.RETRIEVAL_THRESHOLD}
    `;
    const params: any[] = [vectorStr];

    // Filtro colegio: acepta NULL (documentos para todos los colegios)
    if (colegio) {
      sql += ` AND (colegio IS NULL OR LOWER(colegio) = LOWER($${params.length + 1}))`;
      params.push(colegio);
    }

    // Filtro rol: acepta NULL (documentos públicos) y solo roles cuyo token
    // coincida EXACTAMENTE dentro del CSV (evita matches parciales tipo
    // "padre" dentro de "compadres" o "estudiante" dentro de "estudiantil").
    if (aliases.length > 0) {
      const orClauses: string[] = [];
      for (const alias of aliases) {
        const p = (n: number) => `$${params.length + n}`;
        orClauses.push(
          `roles_permitidos = ${p(1)}` +
            ` OR roles_permitidos LIKE ${p(2)} || ',%'` +
            ` OR roles_permitidos LIKE '%,' || ${p(3)} || ',%'` +
            ` OR roles_permitidos LIKE '%,' || ${p(4)}`,
        );
        params.push(alias, `${alias},%`, `%,${alias},%`, `%,${alias}`);
      }
      sql += ` AND (roles_permitidos IS NULL OR (${orClauses.join(' OR ')}))`;
    }

    sql += ` ORDER BY distancia ASC LIMIT ${topK}`;

    let rows: any[] = [];
    try {
      rows = await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.warn(
        '[RAG] pgvector no disponible, usando búsqueda por texto',
      );
      rows = await this.buscarPorTexto(query, colegio, rol, topK);
    }

    if (!rows.length) {
      this.logger.warn(
        `[RAG] 0 chunks para: "${query}" | colegio=${colegio} | rol=${rol} | aliases=${JSON.stringify(aliases)}`,
      );
      return { contexto: '', documentos: [], chunks: [] };
    }

    // Agrupar por documento conservando la mejor (menor) distancia
    const docsUnicos = new Map<
      string,
      {
        nombre: string;
        pdfUrl: string | null;
        categoria: string | null;
        mejorDistancia: number;
      }
    >();

    rows.forEach((r) => {
      const dist = r.distancia ? parseFloat(r.distancia) : 1;
      if (
        !docsUnicos.has(r.nombre) ||
        dist < docsUnicos.get(r.nombre)!.mejorDistancia
      ) {
        docsUnicos.set(r.nombre, {
          nombre: r.nombre,
          pdfUrl: r.pdf_url,
          categoria: r.categoria,
          mejorDistancia: dist,
        });
      }
    });

    // Solo "matches fuertes" se adjuntan: distancia < DOC_MATCH_THRESHOLD.
    // Ordenados de más a menos relevante.
    const documentos = [...docsUnicos.values()]
      .filter((d) => d.mejorDistancia < this.DOC_MATCH_THRESHOLD)
      .sort((a, b) => a.mejorDistancia - b.mejorDistancia)
      .map(({ mejorDistancia, ...d }) => d);

    // El contexto (lo que ve la IA) incluye únicamente chunks de documentos
    // que pasaron el umbral fuerte, para no contaminar la respuesta con ruido.
    const nombresPermitidos = new Set(
      [...docsUnicos.values()]
        .filter((d) => d.mejorDistancia < this.DOC_MATCH_THRESHOLD)
        .map((d) => d.nombre),
    );

    const rowsFiltrados = rows.filter((r) => nombresPermitidos.has(r.nombre));

    const contexto = rowsFiltrados
      .map(
        (r, i) =>
          `[Documento ${i + 1}: ${r.nombre} — roles permitidos: ${
            r.roles_permitidos || 'todos'
          }${r.categoria ? ` — categoría: ${r.categoria}` : ''}]\n${r.contenido}`,
      )
      .join('\n\n---\n\n');

    const chunksDetalle = rowsFiltrados.map((r) => ({
      nombre: r.nombre,
      pdfUrl: r.pdf_url,
      categoria: r.categoria,
      chunkIndex: r.chunk_index,
      distancia: r.distancia
        ? parseFloat(parseFloat(r.distancia).toFixed(4))
        : null,
      contenido: r.contenido,
    }));

    this.logger.log(
      `[RAG] ${rowsFiltrados.length}/${rows.length} chunks con match fuerte (< ${this.DOC_MATCH_THRESHOLD}) para: "${query}"`,
    );

    return {
      contexto,
      documentos,
      chunks: chunksDetalle,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LISTAR
  // ─────────────────────────────────────────────────────────────────────────
  async listar(): Promise<any[]> {
    const rows = await this.dataSource.query(`
      SELECT
        nombre, descripcion, categoria, colegio, pdf_url, activo,
        MAX(total_chunks)     as total_chunks,
        MIN(created_at)       as created_at,
        MAX(roles_permitidos) as roles_permitidos
      FROM documentos
      GROUP BY nombre, descripcion, categoria, colegio, pdf_url, activo
      ORDER BY MIN(created_at) DESC
    `);
    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR ROLES
  // ─────────────────────────────────────────────────────────────────────────
  async actualizarRoles(
    nombre: string,
    data: {
      descripcion: string;
      categoria: string;
      colegio: string | null;
      rolesPermitidos: string;
    },
  ): Promise<{ ok: boolean }> {
    await this.dataSource.query(
      `
      UPDATE documentos
      SET descripcion = $1, categoria = $2, colegio = $3, roles_permitidos = $4
      WHERE nombre = $5
    `,
      [
        data.descripcion || null,
        data.categoria,
        data.colegio || null,
        normalizarRolesCsv(data.rolesPermitidos),
        nombre,
      ],
    );
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ELIMINAR
  // ─────────────────────────────────────────────────────────────────────────
  async eliminar(nombre: string): Promise<{ ok: boolean }> {
    const doc = await this.docRepo.findOne({ where: { nombre } });
    if (doc?.pdfPath && fs.existsSync(doc.pdfPath)) fs.unlinkSync(doc.pdfPath);
    await this.docRepo.delete({ nombre });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPARAR embedding_vec — registros con embedding JSON pero embedding_vec NULL
  // Llamar una sola vez desde un endpoint admin.
  // ─────────────────────────────────────────────────────────────────────────
  async repararEmbeddingVec(): Promise<{ reparados: number; errores: number }> {
    const rows = await this.dataSource.query(`
      SELECT id, embedding
      FROM documentos
      WHERE activo = true
        AND embedding IS NOT NULL
        AND embedding_vec IS NULL
    `);

    let reparados = 0;
    let errores = 0;

    for (const row of rows) {
      try {
        const vec = JSON.parse(row.embedding) as number[];
        await this.dataSource.query(
          `UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`,
          [`[${vec.join(',')}]`, row.id],
        );
        reparados++;
      } catch {
        errores++;
      }
    }

    this.logger.log(
      `[RAG] repararEmbeddingVec: ${reparados} reparados, ${errores} errores`,
    );
    return { reparados, errores };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVADOS
  // ─────────────────────────────────────────────────────────────────────────
  private async extraerTextoPdf(buffer: Buffer): Promise<string> {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text ?? '';
    } catch (err) {
      this.logger.error(
        '[RAG] Error extrayendo texto:',
        (err as Error).message,
      );
      throw new Error(
        'No se pudo extraer texto del PDF: ' + (err as Error).message,
      );
    }
  }

  private dividirEnChunks(texto: string): string[] {
    // Normalizar: saltos de línea Windows → Unix, guiones suaves, espacios
    // múltiples y párrafos seguidos excesivos.
    const limpio = texto
      .replace(/\r\n/g, '\n')
      .replace(/\u00ad/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const chunks: string[] = [];
    let inicio = 0;
    while (inicio < limpio.length) {
      const fin = Math.min(inicio + this.CHUNK_SIZE, limpio.length);

      // Cortar en límite de oración cuando sea posible (a menos que el chunk
      // sea casi todo el texto restante).
      let corte = fin;
      if (fin < limpio.length) {
        const ultimoPunto = Math.max(
          limpio.lastIndexOf('. ', fin),
          limpio.lastIndexOf('.\n', fin),
          limpio.lastIndexOf('; ', fin),
          limpio.lastIndexOf(';\n', fin),
          limpio.lastIndexOf(':\n', fin),
        );
        if (ultimoPunto > inicio + 200) corte = ultimoPunto + 1;
      }

      const chunk = limpio.slice(inicio, corte).trim();
      if (chunk.length > 50) chunks.push(chunk);

      if (corte <= inicio) break;
      inicio = Math.max(corte - this.CHUNK_OVERLAP, inicio + 1);
    }
    return chunks;
  }

  private async generarEmbedding(texto: string): Promise<number[]> {
    const response = await fetch(this.embedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: texto.slice(0, 2000) }] },
        outputDimensionality: this.EMBEDDING_DIM,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini embedding error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.embedding?.values ?? [];
  }

  private async buscarPorTexto(
    query: string,
    colegio?: string,
    rol?: string,
    topK = 4,
  ): Promise<any[]> {
    const words = query
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 3);
    if (!words.length) return [];

    const aliases = resolverAliases(rol);

    let sql = `
      SELECT nombre, contenido, pdf_url, categoria, chunk_index, roles_permitidos
      FROM documentos
      WHERE activo = true
        AND (${words.map((_, i) => `LOWER(contenido) LIKE $${i + 1}`).join(' OR ')})
    `;
    const params = words.map((w) => `%${w}%`);

    if (colegio) {
      sql += ` AND (colegio IS NULL OR LOWER(colegio) = LOWER($${params.length + 1}))`;
      params.push(colegio);
    }

    if (aliases.length > 0) {
      const orClauses: string[] = [];
      for (const alias of aliases) {
        const p = (n: number) => `$${params.length + n}`;
        orClauses.push(
          `roles_permitidos = ${p(1)}` +
            ` OR roles_permitidos LIKE ${p(2)} || ',%'` +
            ` OR roles_permitidos LIKE '%,' || ${p(3)} || ',%'` +
            ` OR roles_permitidos LIKE '%,' || ${p(4)}`,
        );
        params.push(alias, `${alias},%`, `%,${alias},%`, `%,${alias}`);
      }
      sql += ` AND (roles_permitidos IS NULL OR (${orClauses.join(' OR ')}))`;
    }

    sql += ` LIMIT ${topK}`;
    return this.dataSource.query(sql, params);
  }
}
