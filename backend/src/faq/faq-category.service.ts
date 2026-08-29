import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaqCategory } from './entities/faq-category.entity';
import { CreateFaqCategoryDto } from './dto/create-faq-category.dto';
import { UpdateFaqCategoryDto } from './dto/update-faq-category.dto';

@Injectable()
export class FaqCategoryService implements OnModuleInit {
  private readonly logger = new Logger(FaqCategoryService.name);

  // Categorías por defecto (se siembran solo si la tabla está vacía).
  private readonly defaultCategories: Partial<FaqCategory>[] = [
    { name: 'General', icon: 'HelpCircle', description: 'Preguntas generales sobre la plataforma e institución', orden: 0 },
    { name: 'Académico', icon: 'BookOpen', description: 'Notas, boletines, certificados y documentos académicos', orden: 1 },
    { name: 'Soporte', icon: 'Headphones', description: 'Tickets de soporte y ayuda técnica', orden: 2 },
    { name: 'APP', icon: 'Smartphone', description: 'Aplicación móvil de la plataforma', orden: 3 },
    { name: 'Authenticator', icon: 'ShieldCheck', description: 'Autenticación, código QR y accesos', orden: 4 },
  ];

  constructor(
    @InjectRepository(FaqCategory)
    private readonly repo: Repository<FaqCategory>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.repo.count();
      if (count > 0) return;
      for (const cat of this.defaultCategories) {
        await this.repo.save(this.repo.create({ ...cat, roles: null, activo: true }));
      }
      this.logger.log(
        `Se sembraron ${this.defaultCategories.length} categorías de FAQ por defecto`,
      );
    } catch (err) {
      this.logger.error('No se pudieron sembrar las categorías de FAQ por defecto', (err as Error)?.stack);
    }
  }

  async findAll(rol?: string): Promise<FaqCategory[]> {
    let cats = await this.repo.find({ order: { orden: 'ASC', id: 'ASC' } });
    if (rol) cats = cats.filter((c) => aplicaARol(c.roles, rol));
    return cats;
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
      roles: dto.roles ?? null,
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
      ...(dto.roles != null ? { roles: dto.roles } : {}),
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

// Indica si una categoría aplica al rol dado.
// roles vacío/null = visible para todos.
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
