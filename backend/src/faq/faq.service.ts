import { Inject, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as ExcelJS from 'exceljs';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import { Faq } from './entities/faq.entity';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);
  private readonly CACHE_TTL = 60_000;

  // ── SharePoint document cache ──────────────────────────────────────────────
  private docCache: { text: string; updatedAt: number } | null = null;
  private readonly DOC_CACHE_TTL = 5 * 60 * 1000; // 5 min

  constructor(
    @InjectRepository(Faq)
    private readonly faqRepo: Repository<Faq>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly config: ConfigService,
  ) {}

  async findAll(colegioId?: number, q?: string, rol?: string): Promise<Faq[]> {
    const cacheKey = `faq:list:${colegioId ?? 'all'}:${q ?? ''}:${rol ?? 'all'}`;
    const cached = await this.cache.get<Faq[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};

    if (colegioId !== undefined) {
      where.colegioId = colegioId;
    }

    let result: Faq[];

    if (q) {
      where.pregunta = Like(`%${q}%`);
      result = await this.faqRepo.find({
        where: [
          { ...where, pregunta: Like(`%${q}%`) },
          { ...where, respuesta: Like(`%${q}%`) },
          { ...where, keywords: Like(`%${q}%`) },
        ],
        order: { orden: 'ASC', id: 'DESC' },
      });
    } else {
      result = await this.faqRepo.find({
        where,
        order: { orden: 'ASC', id: 'DESC' },
      });
    }

    if (rol) result = result.filter((f) => aplicaARol(f.roles, rol));

    await this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async findCategorias(colegioId?: number, rol?: string): Promise<string[]> {
    const cacheKey = `faq:categorias:${colegioId ?? 'all'}:${rol ?? 'all'}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (colegioId !== undefined) {
      where.colegioId = colegioId;
    }

    const faqs = await this.faqRepo.find({
      where,
      select: ['categoria', 'roles'],
    });

    const categoriasUnicas = new Set<string>();
    for (const faq of faqs) {
      if (rol && !aplicaARol(faq.roles, rol)) continue;
      if (faq.categoria && faq.categoria.trim()) {
        categoriasUnicas.add(faq.categoria.trim());
      }
    }

    const result = Array.from(categoriasUnicas).sort((a, b) => a.localeCompare(b));
    await this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async findOne(id: number): Promise<Faq> {
    const faq = await this.faqRepo.findOne({ where: { id } });
    if (!faq) throw new NotFoundException(`FAQ con id ${id} no encontrada`);
    return faq;
  }

  private async existsByPregunta(pregunta: string, excludeId?: number): Promise<boolean> {
    const where: any = { pregunta: pregunta.trim() };
    if (excludeId) where.id = Not(excludeId);
    const count = await this.faqRepo.count({ where });
    return count > 0;
  }

  async create(dto: CreateFaqDto): Promise<Faq> {
    if (await this.existsByPregunta(dto.pregunta)) {
      throw new ConflictException('Ya existe una pregunta frecuente con ese texto');
    }
    const faq = this.faqRepo.create(dto as Faq);
    await this.faqRepo.save(faq);
    await this.invalidateCache();
    return faq;
  }

  async update(id: number, dto: UpdateFaqDto): Promise<Faq> {
    const faq = await this.findOne(id);
    Object.assign(faq, dto);
    await this.faqRepo.save(faq);
    await this.invalidateCache();
    return faq;
  }

  async remove(id: number): Promise<void> {
    const result = await this.faqRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`FAQ con id ${id} no encontrada`);
    await this.invalidateCache();
  }

  async removeBulk(ids: number[]): Promise<{ deleted: number }> {
    if (!ids?.length) return { deleted: 0 };
    const result = await this.faqRepo.delete(ids);
    await this.invalidateCache();
    return { deleted: result.affected ?? 0 };
  }

  async importXlsx(buffer: Buffer): Promise<{ imported: number; skipped: number; errors: string[]; total: number }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return { imported: 0, skipped: 0, errors: ['El archivo Excel no tiene hojas de trabajo'], total: 0 };

    const headerRow = worksheet.getRow(1).values as any[];
    const pIdx = headerRow.findIndex((h: any) => parseCell(h).toLowerCase() === 'pregunta');
    const rIdx = headerRow.findIndex((h: any) => parseCell(h).toLowerCase() === 'respuesta');
    const cIdx = headerRow.findIndex((h: any) => parseCell(h).toLowerCase() === 'categoria');
    const oIdx = headerRow.findIndex((h: any) => parseCell(h).toLowerCase() === 'orden');
    const aIdx = headerRow.findIndex((h: any) => parseCell(h).toLowerCase() === 'activo');

    if (pIdx === -1 || rIdx === -1) {
      return { imported: 0, skipped: 0, errors: ['El Excel debe tener columnas "Pregunta" y "Respuesta"'], total: 0 };
    }

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let total = 0;

    const existingPreguntas = new Set<string>();
    const allFaqs = await this.faqRepo.find({ select: ['pregunta'] });
    for (const f of allFaqs) existingPreguntas.add(f.pregunta.trim().toLowerCase());

    for (let i = 2; i <= worksheet.actualRowCount; i++) {
      const row = worksheet.getRow(i);
      const vals = row.values as any[];
      if (!vals || vals.length <= 1) continue;

      const pregunta = parseCell(vals[pIdx]).trim();
      const respuesta = parseCell(vals[rIdx]).trim();
      total++;

      if (!pregunta || !respuesta) {
        errors.push(`Fila ${i}: falta pregunta o respuesta`);
        continue;
      }

      if (existingPreguntas.has(pregunta.toLowerCase())) {
        skipped++;
        continue;
      }

      const dto: any = {
        pregunta,
        respuesta,
        categoria: cIdx !== -1 ? parseCell(vals[cIdx]).trim() || null : null,
        orden: oIdx !== -1 ? Number(parseCell(vals[oIdx])) || 0 : 0,
        activo: aIdx !== -1 ? parseCell(vals[aIdx]).toLowerCase() !== 'false' : true,
      };

      try {
        const faq = this.faqRepo.create(dto as Faq);
        await this.faqRepo.save(faq);
        existingPreguntas.add(pregunta.toLowerCase());
        imported++;
      } catch {
        errors.push(`Fila ${i}: no se pudo guardar`);
      }
    }

    if (imported) await this.invalidateCache();
    return { imported, skipped, errors, total };
  }

  async exportXlsx(): Promise<Buffer> {
    const faqs = await this.faqRepo.find({ order: { orden: 'ASC', id: 'DESC' } });
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('FAQs');

    ws.columns = [
      { header: 'Pregunta', key: 'pregunta', width: 45 },
      { header: 'Respuesta', key: 'respuesta', width: 65 },
      { header: 'Categoria', key: 'categoria', width: 25 },
      { header: 'Orden', key: 'orden', width: 10 },
      { header: 'Activo', key: 'activo', width: 10 },
    ];

    ws.getRow(1).font = { bold: true };

    for (const f of faqs) {
      ws.addRow({
        pregunta: f.pregunta ?? '',
        respuesta: f.respuesta ?? '',
        categoria: f.categoria ?? '',
        orden: f.orden ?? 0,
        activo: f.activo ? 'TRUE' : 'FALSE',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ── Local Document Chat ───────────────────────────────────────────────

  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'faq');
  private readonly DOC_FILENAME = 'faq-document.docx';
  private originalFilename = '';

  private suggestionsCache: { suggestions: string[]; updatedAt: number } | null = null;
  private readonly SUGGESTIONS_CACHE_TTL = 30 * 60 * 1000; // 30 min

  private getDocPath(): string {
    return path.join(this.UPLOAD_DIR, this.DOC_FILENAME);
  }

  async uploadDocument(buffer: Buffer, originalName: string): Promise<{ name: string; charCount: number }> {
    if (!fs.existsSync(this.UPLOAD_DIR)) {
      fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
    }
    const dest = this.getDocPath();
    fs.writeFileSync(dest, buffer);

    this.originalFilename = originalName;

    // Parse immediately to validate
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    this.docCache = { text, updatedAt: Date.now() };

    // Invalidate suggestions so they're regenerated from new document
    this.suggestionsCache = null;

    this.logger.log(`[FAQ-CHAT] Document uploaded & cached (${text.length} chars): ${originalName}`);

    return { name: originalName, charCount: text.length };
  }

  private async fetchLocalDocument(): Promise<string> {
    if (this.docCache && Date.now() - this.docCache.updatedAt < this.DOC_CACHE_TTL) {
      return this.docCache.text;
    }

    const docPath = this.getDocPath();
    if (!fs.existsSync(docPath)) {
      throw new Error('No hay documento de FAQ cargado. Sube un archivo .docx desde el panel.');
    }

    this.logger.log('[FAQ-CHAT] Reading local document...');
    const buffer = fs.readFileSync(docPath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    this.docCache = { text, updatedAt: Date.now() };
    this.logger.log(`[FAQ-CHAT] Document cached (${text.length} chars)`);
    return text;
  }

  private splitIntoChunks(text: string, chunkSize = 1200, overlap = 200): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length > chunkSize && current.length > 0) {
        chunks.push(current.trim());
        // Keep overlap from end of current chunk
        const words = current.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(overlap / 6));
        current = overlapWords.join(' ') + '\n\n' + para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length ? chunks : [text.slice(0, chunkSize)];
  }

  private extractRelevantChunks(
    documentText: string,
    query: string,
    maxChunks = 5,
  ): string[] {
    const chunks = this.splitIntoChunks(documentText);
    const queryWords = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\W+/)
      .filter((w) => w.length > 2);

    if (queryWords.length === 0) return chunks.slice(0, 2);

    // Score each chunk by keyword overlap
    const scored = chunks.map((chunk, idx) => {
      const normalized = chunk
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      let score = 0;
      for (const word of queryWords) {
        const regex = new RegExp(`\\b${word}\\w*`, 'gi');
        const matches = normalized.match(regex);
        if (matches) score += matches.length;
      }
      // Slight boost for earlier chunks (introductory content often relevant)
      score += Math.max(0, 2 - idx * 0.1);
      return { chunk, score, idx };
    });

    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

    // Return top scoring chunks, sorted by document order
    return scored
      .slice(0, maxChunks)
      .sort((a, b) => a.idx - b.idx)
      .map((s) => s.chunk);
  }

  private async callGeminiStream(
    systemPrompt: string,
    userMessage: string,
    emit: (event: string, data: object) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido. Estoy listo para responder preguntas sobre el documento.' }] },
      { role: 'user', parts: [{ text: userMessage.trim() }] },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort);
    }

    let response: Response;
    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
          }),
          signal: controller.signal,
        },
      );
    } catch (err: any) {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      if (err?.name === 'AbortError') throw new Error('Tiempo de espera agotado');
      throw err;
    }

    if (!response.ok) {
      const errText = await response.text();
      clearTimeout(timeout);
      this.logger.error(`Gemini FAQ stream error: ${response.status} - ${errText}`);
      throw new Error('Error al conectar con la IA');
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textoAcumulado = '';

    try {
      while (true) {
        let chunk: { done: boolean; value?: Uint8Array };
        try {
          chunk = await reader.read();
        } catch (err: any) {
          if (err?.name === 'AbortError') throw new Error('Tiempo de espera agotado');
          throw err;
        }
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;

          try {
            const parsed = JSON.parse(json);
            const text =
              parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) {
              textoAcumulado += text;
              emit('chunk', { text });
            }
          } catch {
            /* ignorar */
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }

    return textoAcumulado;
  }

  async chatWithDocument(
    query: string,
    emit: (event: string, data: object) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const documentText = await this.fetchLocalDocument();

    if (!query.trim()) {
      emit('chunk', { text: 'Por favor escribe una pregunta sobre el documento.' });
      return '';
    }

    // For small documents, send the full text; for large ones, extract relevant chunks
    let context: string;
    if (documentText.length <= 8000) {
      context = documentText;
    } else {
      const relevantChunks = this.extractRelevantChunks(documentText, query);
      context = relevantChunks.join('\n\n---\n\n');
    }

    const systemPrompt = `Eres un asistente experto que responde basándose en el contenido del documento proporcionado.

REGLAS:
- Responde con la información que esté en el documento.
- Si la información no está en el documento, di qué temas SÍ cubre el documento para ayudar al usuario a reformular su pregunta. Ejemplo: "El documento aborda la configuración de evaluación en preescolar por propósitos y la asignación de docentes. No encontré información específica sobre [tema preguntado]. ¿Puedes preguntar sobre uno de estos temas?"
- Sé claro, conciso y didáctico.
- Usa formato: listas con guiones (-), negritas con **texto**, y separa secciones con saltos de línea.
- Nunca inventes información.
- Responde en español.

DOCUMENTO COMPLETO:
${context}`;

    return this.callGeminiStream(systemPrompt, query, emit, signal);
  }

  async getDocumentInfo(): Promise<{ name: string; charCount: number; updatedAt: number; hasDocument: boolean }> {
    const docPath = this.getDocPath();
    const exists = fs.existsSync(docPath);
    if (!exists) {
      return { name: '', charCount: 0, updatedAt: 0, hasDocument: false };
    }
    const text = await this.fetchLocalDocument();
    return {
      name: this.originalFilename || this.DOC_FILENAME,
      charCount: text.length,
      updatedAt: this.docCache?.updatedAt ?? Date.now(),
      hasDocument: true,
    };
  }

  async getSuggestions(): Promise<string[]> {
    if (this.suggestionsCache && Date.now() - this.suggestionsCache.updatedAt < this.SUGGESTIONS_CACHE_TTL) {
      return this.suggestionsCache.suggestions;
    }

    const docPath = this.getDocPath();
    if (!fs.existsSync(docPath)) return [];

    try {
      const text = await this.fetchLocalDocument();
      if (!text || text.length < 50) return [];

      const preview = text.slice(0, 3000);
      const apiKey = this.config.get<string>('GEMINI_API_KEY');
      if (!apiKey) return [];

      const systemPrompt = `Basándote en el siguiente documento, genera exactamente 6 preguntas frecuentes que un usuario podría hacer. 
Las preguntas deben ser claras, concisas y variadas (que cubran diferentes temas del documento).
Responde SOLO con un array JSON válido de 6 strings, sin texto adicional, sin markdown, sin backticks.
Ejemplo: ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?", "Pregunta 4?", "Pregunta 5?", "Pregunta 6?"]`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\nDOCUMENTO:\n${preview}` }] },
            ],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        this.logger.warn(`[FAQ-SUGG] Gemini error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Parse the JSON array from Gemini response
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to extract array from partial response
        const arrMatch = cleaned.match(/\[.*\]/s);
        if (arrMatch) {
          parsed = JSON.parse(arrMatch[0]);
        } else {
          this.logger.warn(`[FAQ-SUGG] Cannot parse: ${cleaned.substring(0, 100)}`);
          return [];
        }
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        const suggestions = parsed.slice(0, 6).map(String);
        this.suggestionsCache = { suggestions, updatedAt: Date.now() };
        this.logger.log(`[FAQ-CHAT] Generated ${suggestions.length} suggestions from document`);
        return suggestions;
      }

      return [];
    } catch (err: any) {
      this.logger.warn(`[FAQ-SUGG] Failed: ${err?.message}`);
      return [];
    }
  }

  private async invalidateCache(): Promise<void> {
    try {
      await this.cache.del('faq:list:all:');
      await this.cache.del('faq:list:all:undefined');
      await this.cache.del('faq:list:all:null');
      await this.cache.del('faq:categorias:all');
      await this.cache.del('faq:categorias:undefined');
      await this.cache.del('faq:categorias:null');
    } catch {}
  }
}

function parseCell(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val.text !== undefined) return parseCell(val.text);
    if (val.result !== undefined) return parseCell(val.result);
    if (val.richText && Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => parseCell(rt?.text)).join('');
    }
  }
  return String(val);
}

// Indica si una pregunta/categoría frecuente aplica al rol dado.
// roles vacío/null = visible para todos. Se compara normalizado (sin tildes,
// minúsculas) y por coincidencia exacta de rol.
function normalizarRolText(rol: string): string {
  return (rol ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function aplicaARol(roles: string[] | null | undefined, rol: string): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return true;
  const target = normalizarRolText(rol);
  return roles.some((r) => normalizarRolText(r) === target);
}
