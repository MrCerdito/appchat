import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private readonly repo: Repository<Ticket>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private async generarCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
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

  async create(dto: CreateTicketDto, userId?: string): Promise<Ticket> {
    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.createOnce(dto, userId);
      } catch (err: any) {
        const isDuplicate = err?.code === '23505' || err?.message?.includes?.('duplicate key');
        if (!isDuplicate || attempt === MAX_RETRIES) {
          if (isDuplicate) {
            throw new ConflictException('El codigo del ticket ya existe. Intenta de nuevo.');
          }
          throw err;
        }
      }
    }
    throw new ConflictException('No se pudo generar un codigo unico. Intenta de nuevo.');
  }

  private async createOnce(dto: CreateTicketDto, userId?: string): Promise<Ticket> {
    const codigo = await this.generarCodigo();
    let assignedTo: User | null = null;
    if (dto.assignedToId) {
      assignedTo = await this.userRepo.findOneBy({ id: dto.assignedToId });
    } else if (userId) {
      assignedTo = await this.userRepo.findOneBy({ id: userId });
    }

    let createdBy: User | null = null;
    if (userId) {
      createdBy = await this.userRepo.findOneBy({ id: userId });
    }

    const ticket = new Ticket();
    ticket.codigo = codigo;
    ticket.titulo = dto.titulo;
    ticket.descripcion = dto.descripcion ?? null;
    ticket.priority = dto.priority ?? 'medium';
    ticket.category = dto.category ?? null;
    ticket.sourceType = dto.sourceType;
    ticket.sourceId = dto.sourceId;
    ticket.clientName = dto.clientName;
    ticket.clientInfo = dto.clientInfo ?? null;
    ticket.conversation = dto.conversation ?? null;
    ticket.assignedTo = assignedTo;
    ticket.assignedToName = assignedTo?.name ?? null;
    ticket.createdBy = createdBy;

    return this.repo.save(ticket);
  }

  async findAll(query: QueryTicketDto): Promise<{ data: Ticket[]; total: number; page: number; limit: number; pages: number }> {
    const qb = this.repo.createQueryBuilder('t')
      .leftJoinAndSelect('t.assignedTo', 'assignedTo')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .leftJoinAndSelect('t.closedBy', 'closedBy');

    if (query.search) {
      const s = `%${query.search}%`;
      qb.andWhere('(t.titulo ILIKE :s OR t.codigo ILIKE :s OR t.clientName ILIKE :s)', { s });
    }
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.priority) {
      qb.andWhere('t.priority = :priority', { priority: query.priority });
    }
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.sourceType) {
      qb.andWhere('t.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.assignedTo) {
      qb.andWhere('t.assignedTo = :assignedTo', { assignedTo: query.assignedTo });
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    qb.orderBy('t.createdAt', 'DESC');
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

  async findAllSimple(): Promise<Ticket[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      relations: ['assignedTo', 'createdBy', 'closedBy'],
    });
  }

  async findById(id: string): Promise<Ticket> {
    const ticket = await this.repo.findOne({
      where: { id },
      relations: ['assignedTo', 'createdBy', 'closedBy'],
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, userId?: string): Promise<Ticket> {
    const ticket = await this.findById(id);

    if (dto.titulo !== undefined) ticket.titulo = dto.titulo;
    if (dto.descripcion !== undefined) ticket.descripcion = dto.descripcion;
    if (dto.priority !== undefined) ticket.priority = dto.priority;
    if (dto.category !== undefined) ticket.category = dto.category;

    if (dto.status !== undefined) {
      ticket.status = dto.status;
      if (dto.status === 'closed' && !ticket.closedAt) {
        ticket.closedAt = new Date();
        if (userId) {
          const closedBy = await this.userRepo.findOneBy({ id: userId });
          ticket.closedBy = closedBy;
        }
      }
    }

    if (dto.assignedToId !== undefined) {
      const assignedTo = dto.assignedToId
        ? await this.userRepo.findOneBy({ id: dto.assignedToId })
        : null;
      ticket.assignedTo = assignedTo;
      ticket.assignedToName = assignedTo?.name ?? null as any;
    }

    return this.repo.save(ticket);
  }

  async delete(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Ticket no encontrado');
  }
}
