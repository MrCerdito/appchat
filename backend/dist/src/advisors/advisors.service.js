"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvisorsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const user_entity_1 = require("../auth/entities/user.entity");
let AdvisorsService = class AdvisorsService {
    userRepo;
    constructor(userRepo) {
        this.userRepo = userRepo;
    }
    async findAll() {
        return this.userRepo.find({
            where: { role: 'advisor' },
            select: [
                'id',
                'name',
                'email',
                'status',
                'activeChats',
                'active',
                'createdAt',
                'profilePhotoUrl',
            ],
            order: { createdAt: 'DESC' },
        });
    }
    async findAllPaginated(page, limit, search) {
        const where = { role: 'advisor' };
        if (search) {
            where.name = (0, typeorm_2.ILike)(`%${search}%`);
        }
        const [data, total] = await this.userRepo.findAndCount({
            where,
            select: [
                'id',
                'name',
                'email',
                'status',
                'activeChats',
                'active',
                'createdAt',
                'role',
                'profilePhotoUrl',
            ],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        };
    }
    async findById(id) {
        const user = await this.userRepo.findOne({
            where: { id },
            select: [
                'id',
                'name',
                'email',
                'status',
                'activeChats',
                'active',
                'createdAt',
                'role',
                'profilePhotoUrl',
            ],
        });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        return user;
    }
    async create(name, email, password) {
        const exists = await this.userRepo.findOne({ where: { email } });
        if (exists)
            throw new common_1.ConflictException('El email ya está registrado');
        const hash = await bcrypt.hash(password, 10);
        const user = this.userRepo.create({
            name,
            email,
            password: hash,
            role: 'advisor',
        });
        return this.userRepo.save(user);
    }
    async update(id, dto) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        if (dto.email && dto.email !== user.email) {
            const exists = await this.userRepo.findOne({
                where: { email: dto.email },
            });
            if (exists)
                throw new common_1.ConflictException('El email ya está registrado');
        }
        if (dto.name)
            user.name = dto.name;
        if (dto.email)
            user.email = dto.email;
        return this.userRepo.save(user);
    }
    async updatePassword(id, password) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        user.password = await bcrypt.hash(password, 10);
        await this.userRepo.save(user);
    }
    async toggle(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        user.active = !user.active;
        return this.userRepo.save(user);
    }
    async remove(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        await this.userRepo.remove(user);
    }
    async updatePhoto(id, profilePhotoUrl) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('Asesor no encontrado');
        user.profilePhotoUrl = profilePhotoUrl;
        return this.userRepo.save(user);
    }
};
exports.AdvisorsService = AdvisorsService;
exports.AdvisorsService = AdvisorsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AdvisorsService);
//# sourceMappingURL=advisors.service.js.map