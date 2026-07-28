import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Pqrs } from './entities/pqrs.entity';
import { CreatePqrsDto } from './dto/create-pqrs.dto';
import { UpdatePqrsDto } from './dto/update-pqrs.dto';
import { QueryPqrsDto } from './dto/query-pqrs.dto';

@Injectable()
export class PqrsService {
  constructor(
    @InjectRepository(Pqrs) private readonly repo: Repository<Pqrs>,
  ) {}

  private async generarCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PQR-${year}-`;
    const last = await this.repo.findOne({
      where: { codigo: Like(`${prefix}%`) },
      order: { codigo: 'DESC' },
    });
    let nextNum = 1;
    if (last) {
      const numStr = last.codigo.slice(prefix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  async create(dto: CreatePqrsDto): Promise<Pqrs> {
    const codigo = await this.generarCodigo();
    const pqrs = new Pqrs();
    pqrs.codigo = codigo;
    pqrs.tipo = dto.tipo;
    pqrs.asunto = dto.asunto;
    pqrs.descripcion = dto.descripcion;
    pqrs.identificacion = dto.identificacion ?? null;
    pqrs.nombre = dto.nombre;
    pqrs.apellido = dto.apellido ?? null;
    pqrs.email = dto.email ?? null;
    pqrs.telefono = dto.telefono ?? null;
    pqrs.colegio = dto.colegio ?? null;
    pqrs.adjuntos = dto.adjuntos ?? null;
    return this.repo.save(pqrs);
  }

  async findAll(query: QueryPqrsDto): Promise<{
    data: Pqrs[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const qb = this.repo.createQueryBuilder('p');

    if (query.search) {
      const s = `%${query.search}%`;
      qb.andWhere(
        '(p.asunto ILIKE :s OR p.codigo ILIKE :s OR p.nombre ILIKE :s OR p.descripcion ILIKE :s)',
        { s },
      );
    }
    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.tipo) {
      qb.andWhere('p.tipo = :tipo', { tipo: query.tipo });
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    qb.orderBy('p.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Pqrs> {
    const pqrs = await this.repo.findOne({ where: { id } });
    if (!pqrs) throw new NotFoundException('PQRS no encontrado');
    return pqrs;
  }

  async update(id: string, dto: UpdatePqrsDto): Promise<Pqrs> {
    const pqrs = await this.findById(id);
    if (dto.status !== undefined) pqrs.status = dto.status;
    if (dto.respuesta !== undefined) {
      pqrs.respuesta = dto.respuesta;
      if (dto.respuesta) pqrs.respondidoAt = new Date();
    }
    return this.repo.save(pqrs);
  }
}
