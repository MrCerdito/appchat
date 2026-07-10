import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Documento } from './entities/documento.entity';
import { ConfigService } from '@nestjs/config';
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
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);
  private readonly apiKey: string;
  private readonly embedUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

  private readonly CHUNK_SIZE = 1500;
  private readonly CHUNK_OVERLAP = 200;

  constructor(
    @InjectRepository(Documento)
    private readonly docRepo: Repository<Documento>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
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

    await this.docRepo.delete({ nombre: data.nombre });

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.generarEmbedding(chunks[i]);

      const doc = this.docRepo.create({
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

      const saved = await this.docRepo.save(doc);

      await this.dataSource
        .query(
          `UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`,
          [`[${embedding.join(',')}]`, saved.id],
        )
        .catch((err) => {
          this.logger.error(
            `[RAG] Error guardando embedding_vec para chunk ${i}:`,
            err?.message,
          );
        });

      this.logger.log(`[RAG] Chunk ${i + 1}/${chunks.length} guardado`);
    }

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
        id, nombre, contenido, pdf_url, categoria, chunk_index,
        embedding_vec <=> $1::vector AS distancia
      FROM documentos
      WHERE activo = true
        AND embedding_vec IS NOT NULL
        AND embedding_vec <=> $1::vector < 0.60
    `;
    const params: any[] = [vectorStr];

    // Filtro colegio: acepta NULL (documentos para todos los colegios)
    if (colegio) {
      sql += ` AND (colegio IS NULL OR LOWER(colegio) = LOWER($${params.length + 1}))`;
      params.push(colegio);
    }

    // Filtro rol: acepta NULL y todos los aliases del rol recibido
    if (aliases.length > 0) {
      const orClauses = aliases
        .map((_, i) => `LOWER(roles_permitidos) LIKE $${params.length + 1 + i}`)
        .join(' OR ');
      sql += ` AND (roles_permitidos IS NULL OR ${orClauses})`;
      aliases.forEach((a) => params.push(`%${a}%`));
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

    const contexto = rows
      .map((r, i) => `[Documento ${i + 1}: ${r.nombre}]\n${r.contenido}`)
      .join('\n\n---\n\n');

    // REEMPLAZAR el bloque docsUnicos actual por este:
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

    // Ordenar por relevancia y solo devolver docs con distancia < 0.45
    const documentos = [...docsUnicos.values()]
      .filter((d) => d.mejorDistancia < 0.45)
      .sort((a, b) => a.mejorDistancia - b.mejorDistancia)
      .map(({ mejorDistancia, ...d }) => d);

    const chunksDetalle = rows.map((r) => ({
      nombre: r.nombre,
      pdfUrl: r.pdf_url,
      categoria: r.categoria,
      chunkIndex: r.chunk_index,
      distancia: r.distancia
        ? parseFloat(parseFloat(r.distancia).toFixed(4))
        : null,
      contenido: r.contenido,
    }));

    this.logger.log(`[RAG] ${rows.length} chunks encontrados para: "${query}"`);

    return {
      contexto,
      documentos: [...docsUnicos.values()],
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
        data.rolesPermitidos,
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
    const chunks: string[] = [];
    let inicio = 0;
    while (inicio < texto.length) {
      const fin = Math.min(inicio + this.CHUNK_SIZE, texto.length);
      const chunk = texto.slice(inicio, fin).trim();
      if (chunk.length > 50) chunks.push(chunk);
      inicio += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
    }
    return chunks;
  }

  private async generarEmbedding(texto: string): Promise<number[]> {
    const response = await fetch(`${this.embedUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: texto.slice(0, 2000) }] },
        outputDimensionality: 768,
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
      SELECT nombre, contenido, pdf_url, categoria, chunk_index
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
      const orClauses = aliases
        .map((_, i) => `LOWER(roles_permitidos) LIKE $${params.length + 1 + i}`)
        .join(' OR ');
      sql += ` AND (roles_permitidos IS NULL OR ${orClauses})`;
      aliases.forEach((a) => params.push(`%${a}%`));
    }

    sql += ` LIMIT ${topK}`;
    return this.dataSource.query(sql, params);
  }
}
