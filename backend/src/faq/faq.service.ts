import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as ExcelJS from 'exceljs';
import { Faq } from './entities/faq.entity';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  private readonly CACHE_TTL = 60_000;

  constructor(
    @InjectRepository(Faq)
    private readonly faqRepo: Repository<Faq>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async findAll(colegioId?: number, q?: string): Promise<Faq[]> {
    const cacheKey = `faq:list:${colegioId ?? 'all'}:${q ?? ''}`;
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

    await this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async findCategorias(colegioId?: number): Promise<string[]> {
    const cacheKey = `faq:categorias:${colegioId ?? 'all'}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (colegioId !== undefined) {
      where.colegioId = colegioId;
    }

    const faqs = await this.faqRepo.find({
      where,
      select: ['categoria'],
    });

    const categoriasUnicas = new Set<string>();
    for (const faq of faqs) {
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
