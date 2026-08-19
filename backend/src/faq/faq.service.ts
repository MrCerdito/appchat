import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
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

  async importXml(xml: string): Promise<{ imported: number; skipped: number; errors: string[]; total: number }> {
    const faqMatches = xml.match(/<faq>([\s\S]*?)<\/faq>/g);
    if (!faqMatches || faqMatches.length === 0) {
      return { imported: 0, skipped: 0, errors: ['El archivo XML no contiene etiquetas <faq>'], total: 0 };
    }

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    const existingPreguntas = new Set<string>();
    const allFaqs = await this.faqRepo.find({ select: ['pregunta'] });
    for (const f of allFaqs) {
      existingPreguntas.add(f.pregunta.trim().toLowerCase());
    }

    for (let i = 0; i < faqMatches.length; i++) {
      const block = faqMatches[i];
      const pregunta = this.extractXmlTag(block, 'pregunta');
      const respuesta = this.extractXmlTag(block, 'respuesta');
      const categoria = this.extractXmlTag(block, 'categoria') || null;
      const ordenStr = this.extractXmlTag(block, 'orden');
      const activoStr = this.extractXmlTag(block, 'activo');

      if (!pregunta || !respuesta) {
        errors.push(`FAQ ${i + 1}: falta pregunta o respuesta`);
        continue;
      }

      if (existingPreguntas.has(pregunta.toLowerCase())) {
        skipped++;
        continue;
      }

      const dto: any = {
        pregunta,
        respuesta,
        categoria,
        orden: ordenStr ? Number(ordenStr) || 0 : 0,
        activo: activoStr ? activoStr.toLowerCase() !== 'false' : true,
      };

      try {
        const faq = this.faqRepo.create(dto as Faq);
        await this.faqRepo.save(faq);
        existingPreguntas.add(pregunta.toLowerCase());
        imported++;
      } catch {
        errors.push(`FAQ ${i + 1}: no se pudo guardar`);
      }
    }

    if (imported) await this.invalidateCache();
    return { imported, skipped, errors, total: faqMatches.length };
  }

  async exportXml(): Promise<string> {
    const faqs = await this.faqRepo.find({ order: { orden: 'ASC', id: 'DESC' } });
    const esc = (s: string) => this.escapeXml(s ?? '');

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<faqs>\n';
    for (const f of faqs) {
      xml += '  <faq>\n';
      xml += `    <pregunta>${esc(f.pregunta)}</pregunta>\n`;
      xml += `    <respuesta>${esc(f.respuesta)}</respuesta>\n`;
      xml += `    <categoria>${esc(f.categoria ?? '')}</categoria>\n`;
      xml += `    <orden>${f.orden}</orden>\n`;
      xml += `    <activo>${f.activo}</activo>\n`;
      xml += '  </faq>\n';
    }
    xml += '</faqs>';
    return xml;
  }

  private extractXmlTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : '';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
