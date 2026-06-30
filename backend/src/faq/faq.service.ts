import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Faq } from './entities/faq.entity';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepo: Repository<Faq>,
  ) {}

  async findAll(colegioId?: number, q?: string): Promise<Faq[]> {
    const where: any = {};

    if (colegioId !== undefined) {
      where.colegioId = colegioId;
    }

    if (q) {
      where.pregunta = Like(`%${q}%`);
      // Use query builder for OR across multiple fields
      return this.faqRepo.find({
        where: [
          { ...where, pregunta: Like(`%${q}%`) },
          { ...where, respuesta: Like(`%${q}%`) },
          { ...where, keywords: Like(`%${q}%`) },
        ],
        order: { orden: 'ASC', id: 'DESC' },
      });
    }

    return this.faqRepo.find({
      where,
      order: { orden: 'ASC', id: 'DESC' },
    });
  }

  async findCategorias(colegioId?: number): Promise<string[]> {
    const where: any = {};
    if (colegioId !== undefined) {
      where.colegioId = colegioId;
    }

    const result = await this.faqRepo
      .createQueryBuilder('faq')
      .select('DISTINCT faq.categoria')
      .where(where)
      .andWhere('faq.categoria IS NOT NULL')
      .orderBy('faq.categoria', 'ASC')
      .getRawMany();

    return result.map((r: any) => r.faq_categoria);
  }

  async findOne(id: number): Promise<Faq> {
    const faq = await this.faqRepo.findOne({ where: { id } });
    if (!faq) throw new NotFoundException(`FAQ con id ${id} no encontrada`);
    return faq;
  }

  async create(dto: CreateFaqDto): Promise<Faq> {
    const faq = this.faqRepo.create(dto as Faq);
    await this.faqRepo.save(faq);
    return faq;
  }

  async update(id: number, dto: UpdateFaqDto): Promise<Faq> {
    const faq = await this.findOne(id);
    Object.assign(faq, dto);
    await this.faqRepo.save(faq);
    return faq;
  }

  async remove(id: number): Promise<void> {
    const faq = await this.findOne(id);
    await this.faqRepo.remove(faq);
  }
}
