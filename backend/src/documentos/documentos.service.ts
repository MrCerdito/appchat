import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Documento } from './entities/documento.entity';
import { ConfigService } from '@nestjs/config';
import { normalizarRolesCsv, normalizarCategoria } from './roles.util';
import * as fs from 'fs';

// Normaliza un nombre de colegio para comparaciones exactas sin importar
// mayúsculas, espacios o tildes ("Inst. San José" → "inst san jose").
export function normalizarColegio(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
      await this.dataSource.query(
        `ALTER TABLE documentos ADD COLUMN IF NOT EXISTS colegio_norm text`,
      );
      this.logger.log('[RAG] pgvector inicializado (extensión + columnas embedding_vec/colegio_norm)');
      await this.repararEmbeddingVec();
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
          colegioNorm: normalizarColegio(data.colegio) || null,
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
    categoriaPref?: string,
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
      `[RAG] rol="${rol}" → aliases=${JSON.stringify(aliases)} | colegio="${colegio}" | catPref="${categoriaPref}"`,
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

    // Filtro colegio: acepta NULL (documentos para todos los colegios).
    // Se compara con el valor normalizado (colegio_norm) para que no importen
    // mayúsculas, espacios ni tildes; fallback a texto limpio para registros
    // legacy todavía sin colegio_norm.
    if (colegio) {
      const norm = normalizarColegio(colegio);
      sql +=
        ` AND (colegio IS NULL OR colegio_norm = $${params.length + 1}` +
        ` OR (colegio_norm IS NULL AND LOWER(TRIM(colegio)) = LOWER(TRIM($${params.length + 2}))))`;
      params.push(norm, colegio);
    }

    // Filtro rol: acepta NULL (documentos públicos) y CSV vacío (público por
    // defecto). Solo roles cuyo token coincida EXACTAMENTE dentro del CSV
    // (evita matches parciales tipo "padre" dentro de "compadres" o
    // "estudiante" dentro de "estudiantil").
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
      sql += ` AND (roles_permitidos IS NULL OR roles_permitidos = '' OR (${orClauses.join(' OR ')}))`;
    }

    // Priorizar o dar boost (ORDER BY) si coincide con la categoría preferida mapeada
    if (categoriaPref) {
      const p = `$${params.length + 1}`;
      sql += ` ORDER BY CASE WHEN categoria = ${p} THEN 0 ELSE 1 END ASC, distancia ASC LIMIT ${topK}`;
      params.push(categoriaPref);
    } else {
      sql += ` ORDER BY distancia ASC LIMIT ${topK}`;
    }

    let rows: any[] = [];
    try {
      rows = await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.warn(
        '[RAG] pgvector no disponible, usando búsqueda por texto',
      );
      rows = await this.buscarPorTexto(query, colegio, rol, topK, categoriaPref);
    }

    // Fallback: si la búsqueda semántica no encontró nada (umbral muy estricto
    // o preguntas generales/cortas), se usa búsqueda por texto sobre el contenido.
    if (!rows.length) {
      this.logger.warn(
        `[RAG] 0 chunks semánticos para: "${query}" | colegio=${colegio} | rol=${rol} | aliases=${JSON.stringify(aliases)} → fallback por texto`,
      );
      rows = await this.buscarPorTexto(query, colegio, rol, topK, categoriaPref);
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
      const dist = r.distancia != null ? parseFloat(r.distancia) : 1;
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

    const distanciaDe = (row: any): number =>
      row.distancia != null ? parseFloat(row.distancia) : 1;

    // Tier 1: "matches fuertes" (distancia < DOC_MATCH_THRESHOLD). Tier 2:
    // si no hay ninguno fuerte, se usan los mejores chunks dentro del umbral
    // de recuperación marcados como "posiblemente relacionado". Esto evita
    // que la IA responda "no tengo información" cuando el documento del rol
    // existe pero la similitud quedó entre 0.45 y 0.60 (consultas cortas,
    // sinónimos, etc.).
    const strong = rows.filter((r) => distanciaDe(r) < this.DOC_MATCH_THRESHOLD);
    const weak = rows.filter((r) => distanciaDe(r) >= this.DOC_MATCH_THRESHOLD);

    const usarStrong = strong.length > 0;
    const rowsFiltrados: any[] = usarStrong
      ? strong
      : // Tier 2: mejor chunk de cada documento débil, máx. 2 para no ensuciar.
        Object.values(
          weak.reduce<Record<string, any>>((acc, r) => {
            if (!acc[r.nombre] || distanciaDe(r) < distanciaDe(acc[r.nombre])) {
              acc[r.nombre] = r;
            }
            return acc;
          }, {}),
        ).slice(0, 2);

    // Documentos que la IA usará (ordenados por relevancia)
    const documentos = [...docsUnicos.values()]
      .filter((d) => rowsFiltrados.some((r) => r.nombre === d.nombre))
      .sort((a, b) => a.mejorDistancia - b.mejorDistancia)
      .map(({ mejorDistancia, ...d }) => d);

    // Contexto con etiqueta por chunk. En tier 2 se advierte que la relación
    // es posible (la IA decide no inventar sobre ella).
    const MAX_CONTEXT_CHARS = 2500;
    const contexto = rowsFiltrados
      .map((r, i) => {
        const header = `[Documento ${i + 1}: ${r.nombre} — roles permitidos: ${
          r.roles_permitidos || 'todos'
        }${r.categoria ? ` — categoría: ${r.categoria}` : ''}`;
        const nota = usarStrong
          ? ']'
          : ' — POSIBLEMENTE RELACIONADO: verifica con cuidado antes de usarlo]';
        return `${header}${nota}\n${r.contenido}`;
      })
      .join('\n\n---\n\n');

    const contextoCortado =
      contexto.length > MAX_CONTEXT_CHARS
        ? `${contexto.slice(0, MAX_CONTEXT_CHARS).trim()}\n[...]`
        : contexto;

    const chunksDetalle = rowsFiltrados.map((r) => ({
      nombre: r.nombre,
      pdfUrl: r.pdf_url,
      categoria: r.categoria,
      chunkIndex: r.chunk_index,
      distancia: distanciaDe(r)
        ? parseFloat(distanciaDe(r).toFixed(4))
        : null,
      contenido: r.contenido,
    }));

    this.logger.log(
      `[RAG] ${rowsFiltrados.length}/${rows.length} chunks (tier=${usarStrong ? 'fuerte' : 'posible'}) para: "${query}"`,
    );

    return {
      contexto: contextoCortado,
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
      SET descripcion = $1, categoria = $2, colegio = $3, colegio_norm = $4,
          roles_permitidos = $5
      WHERE nombre = $6
    `,
      [
        data.descripcion || null,
        data.categoria,
        data.colegio || null,
        normalizarColegio(data.colegio) || null,
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
  // REPARAR METADATA — canonicaliza roles viejos, normaliza colegios y
  // asegura embedding_vec. Corrección masiva para datos previos al fix.
  // ─────────────────────────────────────────────────────────────────────────
  async repararMetadata(): Promise<{
    rolesCanonicalizados: number;
    colegiosNormalizados: number;
    embeddings: { reparados: number; errores: number };
  }> {
    const roles = await this.dataSource.query(
      `SELECT DISTINCT roles_permitidos FROM documentos WHERE roles_permitidos IS NOT NULL AND roles_permitidos <> ''`,
    );

    let rolesCanonicalizados = 0;
    for (const row of roles) {
      const canon = normalizarRolesCsv(row.roles_permitidos);
      if (canon !== row.roles_permitidos) {
        await this.dataSource.query(
          `UPDATE documentos SET roles_permitidos = $1 WHERE roles_permitidos = $2`,
          [canon, row.roles_permitidos],
        );
        rolesCanonicalizados++;
      }
    }

    const colegios = await this.dataSource.query(
      `SELECT DISTINCT colegio FROM documentos WHERE colegio IS NOT NULL`,
    );
    let colegiosNormalizados = 0;
    for (const row of colegios) {
      const norm = normalizarColegio(row.colegio);
      const upd = await this.dataSource.query(
        `UPDATE documentos SET colegio_norm = $1 WHERE colegio = $2 AND (colegio_norm IS NULL OR colegio_norm <> $1)`,
        [norm || null, row.colegio],
      );
      colegiosNormalizados += upd[1] ?? 0;
    }

    const embeddings = await this.repararEmbeddingVec();

    this.logger.log(
      `[RAG] repararMetadata: roles=${rolesCanonicalizados} colegios=${colegiosNormalizados} embeddings=${JSON.stringify(embeddings)}`,
    );
    return {
      rolesCanonicalizados,
      colegiosNormalizados,
      embeddings,
    };
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
    categoriaPref?: string,
  ): Promise<any[]> {
    const words = query
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 3);
    if (!words.length) return [];

    const aliases = resolverAliases(rol);

    let sql = `
      SELECT nombre, contenido, pdf_url, categoria, chunk_index, roles_permitidos,
             0 AS distancia
      FROM documentos
      WHERE activo = true
        AND (${words.map((_, i) => `LOWER(contenido) LIKE $${i + 1}`).join(' OR ')})
    `;
    const params = words.map((w) => `%${w}%`);

    if (colegio) {
      const norm = normalizarColegio(colegio);
      sql +=
        ` AND (colegio IS NULL OR colegio_norm = $${params.length + 1}` +
        ` OR (colegio_norm IS NULL AND LOWER(TRIM(colegio)) = LOWER(TRIM($${params.length + 2}))))`;
      params.push(norm, colegio);
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
      sql += ` AND (roles_permitidos IS NULL OR roles_permitidos = '' OR (${orClauses.join(' OR ')}))`;
    }

    if (categoriaPref) {
      const p = `$${params.length + 1}`;
      sql += ` ORDER BY CASE WHEN categoria = ${p} THEN 0 ELSE 1 END ASC LIMIT ${topK}`;
      params.push(categoriaPref);
    } else {
      sql += ` LIMIT ${topK}`;
    }
    return this.dataSource.query(sql, params);
  }
}
