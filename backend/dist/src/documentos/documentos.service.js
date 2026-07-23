"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DocumentosService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentosService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const documento_entity_1 = require("./entities/documento.entity");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const ROL_ALIASES = {
    administrador: ['administrador', 'admin'],
    docente: ['docente', 'profesor'],
    estudiante: ['estudiante', 'alumno'],
    padre: ['padre', 'madre', 'acudiente'],
};
function resolverAliases(rol) {
    if (!rol)
        return [];
    const r = rol
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (ROL_ALIASES[r])
        return ROL_ALIASES[r];
    const entrada = Object.values(ROL_ALIASES).find((arr) => arr.includes(r));
    return entrada ?? [r];
}
let DocumentosService = DocumentosService_1 = class DocumentosService {
    docRepo;
    config;
    dataSource;
    logger = new common_1.Logger(DocumentosService_1.name);
    apiKey;
    embedUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
    CHUNK_SIZE = 1500;
    CHUNK_OVERLAP = 200;
    constructor(docRepo, config, dataSource) {
        this.docRepo = docRepo;
        this.config = config;
        this.dataSource = dataSource;
        this.apiKey = this.config.get('GEMINI_API_KEY') ?? '';
    }
    async procesarPdf(data) {
        const texto = await this.extraerTextoPdf(data.pdfBuffer);
        if (!texto.trim())
            throw new Error('El PDF no contiene texto extraíble');
        const chunks = this.dividirEnChunks(texto);
        this.logger.log(`[RAG] "${data.nombre}": ${chunks.length} chunks generados`);
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
                .query(`UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`, [`[${embedding.join(',')}]`, saved.id])
                .catch((err) => {
                this.logger.error(`[RAG] Error guardando embedding_vec para chunk ${i}:`, err?.message);
            });
            this.logger.log(`[RAG] Chunk ${i + 1}/${chunks.length} guardado`);
        }
        return { ok: true, chunks: chunks.length, nombre: data.nombre };
    }
    async buscarRelevantes(query, colegio, rol, topK = 3) {
        if (!query.trim())
            return { contexto: '', documentos: [], chunks: [] };
        const queryEmbedding = await this.generarEmbedding(query);
        const vectorStr = `[${queryEmbedding.join(',')}]`;
        const aliases = resolverAliases(rol);
        this.logger.log(`[RAG] rol="${rol}" → aliases=${JSON.stringify(aliases)} | colegio="${colegio}"`);
        let sql = `
      SELECT
        id, nombre, contenido, pdf_url, categoria, chunk_index,
        embedding_vec <=> $1::vector AS distancia
      FROM documentos
      WHERE activo = true
        AND embedding_vec IS NOT NULL
        AND embedding_vec <=> $1::vector < 0.60
    `;
        const params = [vectorStr];
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
        sql += ` ORDER BY distancia ASC LIMIT ${topK}`;
        let rows = [];
        try {
            rows = await this.dataSource.query(sql, params);
        }
        catch (err) {
            this.logger.warn('[RAG] pgvector no disponible, usando búsqueda por texto');
            rows = await this.buscarPorTexto(query, colegio, rol, topK);
        }
        if (!rows.length) {
            this.logger.warn(`[RAG] 0 chunks para: "${query}" | colegio=${colegio} | rol=${rol} | aliases=${JSON.stringify(aliases)}`);
            return { contexto: '', documentos: [], chunks: [] };
        }
        const contexto = rows
            .map((r, i) => `[Documento ${i + 1}: ${r.nombre}]\n${r.contenido}`)
            .join('\n\n---\n\n');
        const docsUnicos = new Map();
        rows.forEach((r) => {
            const dist = r.distancia ? parseFloat(r.distancia) : 1;
            if (!docsUnicos.has(r.nombre) ||
                dist < docsUnicos.get(r.nombre).mejorDistancia) {
                docsUnicos.set(r.nombre, {
                    nombre: r.nombre,
                    pdfUrl: r.pdf_url,
                    categoria: r.categoria,
                    mejorDistancia: dist,
                });
            }
        });
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
    async listar() {
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
    async actualizarRoles(nombre, data) {
        await this.dataSource.query(`
      UPDATE documentos
      SET descripcion = $1, categoria = $2, colegio = $3, roles_permitidos = $4
      WHERE nombre = $5
    `, [
            data.descripcion || null,
            data.categoria,
            data.colegio || null,
            data.rolesPermitidos,
            nombre,
        ]);
        return { ok: true };
    }
    async eliminar(nombre) {
        const doc = await this.docRepo.findOne({ where: { nombre } });
        if (doc?.pdfPath && fs.existsSync(doc.pdfPath))
            fs.unlinkSync(doc.pdfPath);
        await this.docRepo.delete({ nombre });
        return { ok: true };
    }
    async repararEmbeddingVec() {
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
                const vec = JSON.parse(row.embedding);
                await this.dataSource.query(`UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`, [`[${vec.join(',')}]`, row.id]);
                reparados++;
            }
            catch {
                errores++;
            }
        }
        this.logger.log(`[RAG] repararEmbeddingVec: ${reparados} reparados, ${errores} errores`);
        return { reparados, errores };
    }
    async extraerTextoPdf(buffer) {
        try {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(buffer);
            return data.text ?? '';
        }
        catch (err) {
            this.logger.error('[RAG] Error extrayendo texto:', err.message);
            throw new Error('No se pudo extraer texto del PDF: ' + err.message);
        }
    }
    dividirEnChunks(texto) {
        const chunks = [];
        let inicio = 0;
        while (inicio < texto.length) {
            const fin = Math.min(inicio + this.CHUNK_SIZE, texto.length);
            const chunk = texto.slice(inicio, fin).trim();
            if (chunk.length > 50)
                chunks.push(chunk);
            inicio += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
        }
        return chunks;
    }
    async generarEmbedding(texto) {
        const response = await fetch(this.embedUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey,
            },
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
    async buscarPorTexto(query, colegio, rol, topK = 4) {
        const words = query
            .toLowerCase()
            .split(' ')
            .filter((w) => w.length > 3);
        if (!words.length)
            return [];
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
};
exports.DocumentosService = DocumentosService;
exports.DocumentosService = DocumentosService = DocumentosService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(documento_entity_1.Documento)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        config_1.ConfigService,
        typeorm_2.DataSource])
], DocumentosService);
//# sourceMappingURL=documentos.service.js.map