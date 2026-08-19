import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  BadRequestException,
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

// Palabras genéricas sin carga informativa (saludos, muletillas, verbos vacíos).
// Si una consulta solo contiene estas, no hay tema que buscar en la base.
const STOPWORDS = new Set([
  'hola', 'buenas', 'buenos', 'buen', 'dias', 'tardes', 'noches', 'saludos',
  'hello', 'hey', 'hi', 'oye', 'mira', 'que', 'como', 'para', 'por', 'con',
  'los', 'las', 'un', 'una', 'unos', 'unas', 'el', 'la', 'lo', 'del', 'al',
  'quiero', 'quieres', 'necesito', 'necesita', 'puedes', 'puedo', 'puede',
  'podrias', 'podria', 'ayudar', 'ayudame', 'ayuda', 'preguntar', 'pregunta',
  'saber', 'sabe', 'sabes', 'decir', 'dime', 'dame', 'cuentame', 'cuenta',
  'tengo', 'tienes', 'tiene', 'hacer', 'haces', 'hago', 'estoy', 'estas',
  'esta', 'estas', 'mucho', 'mucha', 'muchas', 'muchos', 'gracias', 'favor',
  'porfavor', 'pues', 'entonces', 'asi', 'tambien', 'también', 'pero', 'ser',
  'sea', 'sido', 'podria', 'pueden', 'pasame', 'envia', 'enviar', 'mandar',
  'manda', 'revisa', 'revisar', 'buscar', 'busca', 'informacion',
]);

// Extrae los tokens con carga informativa de una consulta: normaliza
// (minúsculas, sin tildes), divide y descarta stopwords y palabras cortas.
function tokensInformativos(query: string): string[] {
  const limpio = (query ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return limpio
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 8);
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
  if (entrada) return entrada;
  // Reject unrecognized roles to prevent SQL injection
  return [];
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
  // Umbral de recuperación semántica (0.66: balancea recall y precisión; los
  // matches por palabras/título garantizan los instructivos sin depender de él).
  private readonly RETRIEVAL_THRESHOLD = 0.55;
  // Umbral de "match fuerte" (0.52): los keyword matches por título/descripción
  // usan distancia sintética 0.05/0.40, así que caen en este tier.
  private readonly DOC_MATCH_THRESHOLD = 0.52;

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
      await this.dataSource.query(
        `ALTER TABLE documentos ADD COLUMN IF NOT EXISTS instructivo boolean NOT NULL DEFAULT false`,
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
    instructivo?: boolean;
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
          instructivo: data.instructivo ?? false,
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
    rol?: string,
    topK = 8,
  ): Promise<{
    contexto: string;
    documentos: {
      nombre: string;
      pdfUrl: string | null;
      categoria: string | null;
      descripcion: string | null;
      instructivo: boolean | null;
      distancia: number;
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

    const aliases = resolverAliases(rol);
    const tokens = tokensInformativos(query);

    // Gate de informatividad: sin tokens con carga informativa ("hola", "que
    // tal", "gracias"...) no hay tema que buscar → nada que recuperar.
    if (!tokens.length) {
      this.logger.log(
        `[RAG] consulta no informativa ("${query}") → sin documentos | rol=${rol}`,
      );
      return { contexto: '', documentos: [], chunks: [] };
    }

    this.logger.log(
      `[RAG] rol="${rol}" → aliases=${JSON.stringify(aliases)} | tokens=${JSON.stringify(tokens)}`,
    );

    // ── FAST PATH: búsqueda por palabras (sin llamadas externas). Si encuentra
    // un match FUERTE (título/descripción 0.05 o contenido con ≥2 tokens 0.40),
    // se usa directamente y se omite la API de embeddings → respuesta inmediata
    // e inmune a fallas de la API de embeddings.
    const porTexto = await this.buscarPorTexto(tokens, rol, topK);
    const fuerte = porTexto.filter(
      (r) => parseFloat(r.distancia ?? 1) < this.DOC_MATCH_THRESHOLD,
    );

    let rows: any[];
    if (fuerte.length > 0) {
      rows = porTexto;
    } else {
      // Solo se recurre a la semántica si el fast path no dio match fuerte.
      // El ÚNICO filtro es el rol (ni categoría ni colegio condicionan).
      let semanticos: any[] = [];
      try {
        const queryEmbedding = await this.generarEmbedding(query);
        const vectorStr = `[${queryEmbedding.join(',')}]`;
        const { sql: rolSql, params: rolParams } = this.sqlFiltroRol(
          aliases,
          2,
        );
        semanticos = await this.dataSource.query(
          `
          SELECT
            id, nombre, contenido, pdf_url, categoria, chunk_index, roles_permitidos,
            instructivo, descripcion,
            embedding_vec <=> $1::vector AS distancia
          FROM documentos
          WHERE activo = true
            AND embedding_vec IS NOT NULL
            AND embedding_vec <=> $1::vector < ${this.RETRIEVAL_THRESHOLD}
            ${rolSql}
          ORDER BY distancia ASC
          LIMIT ${topK}
          `,
          [vectorStr, ...rolParams],
        );
      } catch (err) {
        this.logger.warn(
          `[RAG] embeddings no disponible (${(err as Error)?.message}) → solo búsqueda por palabras`,
        );
      }
      rows = this.fusionarResultados(semanticos, porTexto);
    }

    if (!rows.length) {
      this.logger.warn(
        `[RAG] 0 chunks para: "${query}" | rol=${rol} | aliases=${JSON.stringify(aliases)}`,
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
        descripcion: string | null;
        instructivo: boolean | null;
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
          descripcion: r.descripcion ?? null,
          instructivo: r.instructivo ?? null,
          mejorDistancia: dist,
        });
      }
    });

    const distanciaDe = (row: any): number =>
      row.distancia != null ? parseFloat(row.distancia) : 1;

    // Tier 1: "matches fuertes" (distancia < DOC_MATCH_THRESHOLD, incluye los
    // keyword matches por título/descripción con distancia sintética).
    // Si no hay matches fuertes, NO devolver documentos débiles para evitar
    // entregar documentos irrelevantes al usuario.
    const strong = rows.filter((r) => distanciaDe(r) < this.DOC_MATCH_THRESHOLD);
    const usarStrong = strong.length > 0;
    const rowsFiltrados: any[] = strong;

    // Documentos que la IA usará (ordenados por relevancia)
    const documentos = [...docsUnicos.values()]
      .filter((d) => rowsFiltrados.some((r) => r.nombre === d.nombre))
      .sort((a, b) => a.mejorDistancia - b.mejorDistancia)
      .map(({ mejorDistancia, ...d }) => ({
        ...d,
        distancia: mejorDistancia,
      }));

    // Contexto con etiqueta por chunk. En tier 2 se advierte que la relación
    // es posible (la IA decide no inventar sobre ella).
    const MAX_CONTEXT_CHARS = 4500;
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

  // Filtro SQL de rol (ÚNICA condición de entrega). Acepta NULL/CSV vacío como
  // público y exige coincidencia EXACTA de token dentro del CSV.
  // Retorna SQL con parámetros `$N` para prevenir inyección SQL.
  private sqlFiltroRol(
    aliases: string[],
    startParam: number = 1,
  ): { sql: string; params: string[] } {
    if (!aliases.length) return { sql: '', params: [] };
    const params: string[] = [];
    const conditions: string[] = [];
    for (const a of aliases) {
      const base = startParam + conditions.length;
      conditions.push(
        `roles_permitidos = $${base}`,
        `roles_permitidos LIKE $${base + 1}`,
        `roles_permitidos LIKE $${base + 2}`,
        `roles_permitidos LIKE $${base + 3}`,
      );
      params.push(a, `${a},%`, `%,${a},%`, `%,${a}`);
    }
    return {
      sql: ` AND (roles_permitidos IS NULL OR roles_permitidos = '' OR (${conditions.join(
        ' OR ',
      )}))`,
      params,
    };
  }

  // Fusiona resultados semánticos + de texto por id de chunk conservando la
  // MEJOR (menor) distancia de cada chunk. Así un match por título/descripción
  // (distancia sintética 0.05) gana aunque el embedding de ese chunk esté débil.
  private fusionarResultados(semanticos: any[], porTexto: any[]): any[] {
    const porId = new Map<number, any>();
    const poner = (r: any) => {
      const prev = porId.get(r.id);
      if (
        !prev ||
        parseFloat(r.distancia ?? 1) < parseFloat(prev.distancia ?? 1)
      ) {
        porId.set(r.id, r);
      }
    };
    for (const r of semanticos) poner(r);
    for (const r of porTexto) poner(r);
    return [...porId.values()].sort(
      (a, b) =>
        parseFloat(a.distancia ?? 1) - parseFloat(b.distancia ?? 1),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LISTAR
  // ─────────────────────────────────────────────────────────────────────────
  async listar(): Promise<any[]> {
    const rows = await this.dataSource.query(`
      SELECT
        nombre, descripcion, categoria, colegio, pdf_url, activo, instructivo,
        MAX(total_chunks)     as total_chunks,
        MIN(created_at)       as created_at,
        MAX(roles_permitidos) as roles_permitidos
      FROM documentos
      GROUP BY nombre, descripcion, categoria, colegio, pdf_url, activo, instructivo
      ORDER BY MIN(created_at) DESC
    `);
    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR ROLES
  // ─────────────────────────────────────────────────────────────────────────
  async actualizarRoles(
    nombreOriginal: string,
    data: {
      nombre?: string;
      descripcion: string;
      categoria?: string;
      colegio: string | null;
      rolesPermitidos: string;
      instructivo?: boolean;
    },
  ): Promise<{ ok: boolean }> {
    const nombreNuevo = data.nombre?.trim();

    // Renombrar: verificar que el nuevo nombre no esté en uso (nombre es PK).
    if (
      nombreNuevo &&
      nombreNuevo.toLowerCase() !== nombreOriginal.toLowerCase()
    ) {
      const dup = await this.dataSource.query(
        `
        SELECT 1 FROM documentos
        WHERE LOWER(nombre) = LOWER($1)
          AND LOWER(nombre) <> LOWER($2)
        LIMIT 1
      `,
        [nombreNuevo, nombreOriginal],
      );
      if (dup.length) {
        throw new BadRequestException(
          `Ya existe un documento llamado "${nombreNuevo}"`,
        );
      }
    }

    await this.dataSource.query(
      `
      UPDATE documentos
      SET nombre = COALESCE($1, nombre),
          descripcion = $2,
          categoria = COALESCE($3, categoria),
          colegio = $4,
          colegio_norm = $5,
          roles_permitidos = $6,
          instructivo = $7
      WHERE nombre = $8
    `,
      [
        nombreNuevo || null,
        data.descripcion || null,
        data.categoria ?? null,
        data.colegio || null,
        normalizarColegio(data.colegio) || null,
        normalizarRolesCsv(data.rolesPermitidos),
        data.instructivo ?? false,
        nombreOriginal,
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini embedding error: ${response.status} - ${err}`);
      }

      const data = await response.json();
      return data.embedding?.values ?? [];
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Gemini embedding timeout (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Búsqueda por palabras sobre nombre, descripción y contenido. Los matches
  // en TÍTULO/descripción reciben distancia sintética baja (0.05) y los de solo
  // contenido 0.40, para que queden en el tier fuerte y arriba en el ranking.
  // Búsqueda por palabras sobre título, descripción y contenido. Escalera de
  // relevancia (distancia sintética):
  //   0.05 → match en TÍTULO/descripción (evidencia fuerte de tema)
  //   0.40 → match en contenido con ≥2 tokens (relacionado)
  //   0.60 → match en contenido con 1 solo token (débil, solo entra si no hay
  //          nada fuerte: tier "posiblemente relacionado")
  // Los tokens ya vienen filtrados por `tokensInformativos` (sin stopwords).
  private async buscarPorTexto(
    tokens: string[],
    rol?: string,
    topK = 8,
  ): Promise<any[]> {
    if (!tokens.length) return [];

    const n = tokens.length;
    const likes = tokens.map((w) => `%${w}%`);
    const contentLikes = tokens
      .map((_, i) => `LOWER(contenido) LIKE $${i + 1}`)
      .join(' + ');
    const nombreClause = `(${tokens
      .map((_, i) => `LOWER(nombre) LIKE $${n + i + 1}`)
      .join(' OR ')})`;
    const descripcionClause = `(${tokens
      .map((_, i) => `LOWER(COALESCE(descripcion, '')) LIKE $${2 * n + i + 1}`)
      .join(' OR ')})`;
    const tituloODesc = `${nombreClause} OR ${descripcionClause}`;

    const params: any[] = [...likes, ...likes, ...likes];
    const rolStart = 3 * n + 1;
    const { sql: rolSql, params: rolParams } = this.sqlFiltroRol(
      resolverAliases(rol),
      rolStart,
    );
    const sql = `
      SELECT
        id, nombre, contenido, pdf_url, categoria, chunk_index, roles_permitidos,
        instructivo, descripcion,
        CASE
          WHEN ${tituloODesc} THEN 0.05
          WHEN (${tokens.map((_, i) => `(LOWER(contenido) LIKE $${i + 1})::int`).join(' + ')}) >= 2 THEN 0.40
          ELSE 0.60
        END AS distancia
      FROM documentos
      WHERE activo = true
        AND (${tituloODesc} OR (${tokens.map((_, i) => `(LOWER(contenido) LIKE $${i + 1})::int`).join(' + ')}) >= 1)
        ${rolSql}
      ORDER BY distancia ASC
      LIMIT ${topK}
    `;
    return this.dataSource.query(sql, [...params, ...rolParams]);
  }
}
