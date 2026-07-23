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
exports.FaqService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const faq_entity_1 = require("./entities/faq.entity");
let FaqService = class FaqService {
    faqRepo;
    constructor(faqRepo) {
        this.faqRepo = faqRepo;
    }
    async findAll(colegioId, q) {
        const where = {};
        if (colegioId !== undefined) {
            where.colegioId = colegioId;
        }
        if (q) {
            where.pregunta = (0, typeorm_2.Like)(`%${q}%`);
            return this.faqRepo.find({
                where: [
                    { ...where, pregunta: (0, typeorm_2.Like)(`%${q}%`) },
                    { ...where, respuesta: (0, typeorm_2.Like)(`%${q}%`) },
                    { ...where, keywords: (0, typeorm_2.Like)(`%${q}%`) },
                ],
                order: { orden: 'ASC', id: 'DESC' },
            });
        }
        return this.faqRepo.find({
            where,
            order: { orden: 'ASC', id: 'DESC' },
        });
    }
    async findCategorias(colegioId) {
        const where = {};
        if (colegioId !== undefined) {
            where.colegioId = colegioId;
        }
        const faqs = await this.faqRepo.find({
            where,
            select: ['categoria'],
        });
        const categoriasUnicas = new Set();
        for (const faq of faqs) {
            if (faq.categoria && faq.categoria.trim()) {
                categoriasUnicas.add(faq.categoria.trim());
            }
        }
        return Array.from(categoriasUnicas).sort((a, b) => a.localeCompare(b));
    }
    async findOne(id) {
        const faq = await this.faqRepo.findOne({ where: { id } });
        if (!faq)
            throw new common_1.NotFoundException(`FAQ con id ${id} no encontrada`);
        return faq;
    }
    async create(dto) {
        const faq = this.faqRepo.create(dto);
        await this.faqRepo.save(faq);
        return faq;
    }
    async update(id, dto) {
        const faq = await this.findOne(id);
        Object.assign(faq, dto);
        await this.faqRepo.save(faq);
        return faq;
    }
    async remove(id) {
        const faq = await this.findOne(id);
        await this.faqRepo.remove(faq);
    }
};
exports.FaqService = FaqService;
exports.FaqService = FaqService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(faq_entity_1.Faq)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], FaqService);
//# sourceMappingURL=faq.service.js.map