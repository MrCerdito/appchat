import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
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

  async create(dto: CreateFaqDto): Promise<Faq> {
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
    const faq = await this.findOne(id);
    await this.faqRepo.remove(faq);
    await this.invalidateCache();
  }

  async removeBulk(ids: number[]): Promise<{ deleted: number }> {
    if (!ids?.length) return { deleted: 0 };
    await this.faqRepo.delete(ids);
    await this.invalidateCache();
    return { deleted: ids.length };
  }

  async importCsv(csv: string): Promise<{ imported: number; errors: string[]; total: number }> {
    const lines = csv.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return { imported: 0, errors: ['El archivo CSV está vacío o no tiene datos'], total: 0 };

    const header = lines[0].toLowerCase();
    const cols = header.split(';').map((c) => c.trim().replace(/"/g, ''));
    const pIdx = cols.indexOf('pregunta');
    const rIdx = cols.indexOf('respuesta');
    const cIdx = cols.indexOf('categoria');
    const oIdx = cols.indexOf('orden');
    const aIdx = cols.indexOf('activo');

    if (pIdx === -1 || rIdx === -1)
      throw new Error('CSV debe tener columnas "pregunta" y "respuesta"');

    const errors: string[] = [];
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const vals = this.parseCsvLine(lines[i]);
      const dto: any = {
        pregunta: vals[pIdx]?.trim(),
        respuesta: vals[rIdx]?.trim(),
        categoria: cIdx !== -1 ? vals[cIdx]?.trim() || null : null,
        orden: oIdx !== -1 ? Number(vals[oIdx]) || 0 : 0,
        activo: aIdx !== -1 ? vals[aIdx]?.trim().toLowerCase() !== 'false' : true,
      };
      if (dto.pregunta && dto.respuesta) {
        try {
          const faq = this.faqRepo.create(dto as Faq);
          await this.faqRepo.save(faq);
          imported++;
        } catch {
          errors.push(`Fila ${i + 1}: no se pudo guardar`);
        }
      } else {
        errors.push(`Fila ${i + 1}: falta pregunta o respuesta`);
      }
    }

    if (imported) await this.invalidateCache();
    return { imported, errors, total: lines.length - 1 };
  }

  async exportCsv(): Promise<string> {
    const faqs = await this.faqRepo.find({ order: { orden: 'ASC', id: 'DESC' } });
    const header = '"pregunta";"respuesta";"categoria";"orden";"activo"';
    const rows = faqs.map((f) => {
      const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
      return [esc(f.pregunta), esc(f.respuesta), esc(f.categoria ?? ''), f.orden, f.activo].join(';');
    });
    return [header, ...rows].join('\n');
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ';' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  private async invalidateCache(): Promise<void> {
    try {
      await this.cache.del('faq:list:all:');
      await this.cache.del('faq:categorias:all');
    } catch {}
  }
}
