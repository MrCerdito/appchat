import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaqCategory } from './entities/faq-category.entity';
import { CreateFaqCategoryDto } from './dto/create-faq-category.dto';
import { UpdateFaqCategoryDto } from './dto/update-faq-category.dto';

@Injectable()
export class FaqCategoryService {
  private readonly logger = new Logger(FaqCategoryService.name);

  constructor(
    @InjectRepository(FaqCategory)
    private readonly repo: Repository<FaqCategory>,
  ) {}

  findAll(): Promise<FaqCategory[]> {
    return this.repo.find({ order: { orden: 'ASC', id: 'ASC' } });
  }

  async findOne(id: number): Promise<FaqCategory> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    return cat;
  }

  async create(dto: CreateFaqCategoryDto): Promise<FaqCategory> {
    await this.assertUniqueName(dto.name);
    const cat = this.repo.create({
      name: dto.name.trim(),
      icon: dto.icon ?? 'HelpCircle',
      description: dto.description ?? '',
      orden: dto.orden ?? 0,
      activo: dto.activo ?? true,
    });
    return this.repo.save(cat);
  }

  async update(id: number, dto: UpdateFaqCategoryDto): Promise<FaqCategory> {
    const cat = await this.findOne(id);
    if (dto.name && dto.name.trim() !== cat.name) {
      await this.assertUniqueName(dto.name, id);
    }
    Object.assign(cat, {
      ...(dto.name != null ? { name: dto.name.trim() } : {}),
      ...(dto.icon != null ? { icon: dto.icon } : {}),
      ...(dto.description != null ? { description: dto.description } : {}),
      ...(dto.orden != null ? { orden: dto.orden } : {}),
      ...(dto.activo != null ? { activo: dto.activo } : {}),
    });
    return this.repo.save(cat);
  }

  async remove(id: number): Promise<void> {
    const cat = await this.findOne(id);
    await this.repo.remove(cat);
  }

  private async assertUniqueName(name: string, exceptId?: number): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('LOWER(c.name) = LOWER(:name)', { name: name.trim() });
    if (exceptId != null) qb.andWhere('c.id != :id', { id: exceptId });
    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
  }
}
