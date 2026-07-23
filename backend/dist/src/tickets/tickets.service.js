"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ticket_entity_1 = require("./ticket.entity");
const user_entity_1 = require("../auth/entities/user.entity");
let TicketsService = class TicketsService {
    repo;
    userRepo;
    constructor(repo, userRepo) {
        this.repo = repo;
        this.userRepo = userRepo;
    }
    async generarCodigo() {
        const year = new Date().getFullYear();
        const prefix = `TKT-${year}-`;
        const last = await this.repo.findOne({
            where: { codigo: (0, typeorm_2.Like)(`${prefix}%`) },
            order: { codigo: 'DESC' },
        });
        let nextNum = 1;
        if (last) {
            const numStr = last.codigo.slice(prefix.length);
            const num = parseInt(numStr, 10);
            if (!isNaN(num))
                nextNum = num + 1;
        }
        return `${prefix}${String(nextNum).padStart(4, '0')}`;
    }
    async create(dto, userId) {
        const MAX_RETRIES = 5;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.createOnce(dto, userId);
            }
            catch (err) {
                const isDuplicate = err?.code === '23505' || err?.message?.includes?.('duplicate key');
                if (!isDuplicate || attempt === MAX_RETRIES) {
                    if (isDuplicate) {
                        throw new common_1.ConflictException('El codigo del ticket ya existe. Intenta de nuevo.');
                    }
                    throw err;
                }
            }
        }
        throw new common_1.ConflictException('No se pudo generar un codigo unico. Intenta de nuevo.');
    }
    async createOnce(dto, userId) {
        const codigo = await this.generarCodigo();
        let assignedTo = null;
        if (dto.assignedToId) {
            assignedTo = await this.userRepo.findOneBy({ id: dto.assignedToId });
        }
        else if (userId) {
            assignedTo = await this.userRepo.findOneBy({ id: userId });
        }
        let createdBy = null;
        if (userId) {
            createdBy = await this.userRepo.findOneBy({ id: userId });
        }
        const ticket = new ticket_entity_1.Ticket();
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
    async findAll(query) {
        const qb = this.repo
            .createQueryBuilder('t')
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
            qb.andWhere('t.sourceType = :sourceType', {
                sourceType: query.sourceType,
            });
        }
        if (query.assignedTo) {
            qb.andWhere('t.assignedTo = :assignedTo', {
                assignedTo: query.assignedTo,
            });
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
    async findAllSimple() {
        return this.repo.find({
            order: { createdAt: 'DESC' },
            relations: ['assignedTo', 'createdBy', 'closedBy'],
            take: 500,
        });
    }
    async findById(id) {
        const ticket = await this.repo.findOne({
            where: { id },
            relations: ['assignedTo', 'createdBy', 'closedBy'],
        });
        if (!ticket)
            throw new common_1.NotFoundException('Ticket no encontrado');
        return ticket;
    }
    async update(id, dto, userId) {
        const ticket = await this.findById(id);
        if (dto.titulo !== undefined)
            ticket.titulo = dto.titulo;
        if (dto.descripcion !== undefined)
            ticket.descripcion = dto.descripcion;
        if (dto.priority !== undefined)
            ticket.priority = dto.priority;
        if (dto.category !== undefined)
            ticket.category = dto.category;
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
            ticket.assignedToName = assignedTo?.name ?? null;
        }
        return this.repo.save(ticket);
    }
    async delete(id) {
        const result = await this.repo.delete(id);
        if (result.affected === 0)
            throw new common_1.NotFoundException('Ticket no encontrado');
    }
};
exports.TicketsService = TicketsService;
exports.TicketsService = TicketsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(ticket_entity_1.Ticket)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], TicketsService);
//# sourceMappingURL=tickets.service.js.map