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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const user_entity_1 = require("./entities/user.entity");
let AuthService = class AuthService {
    userRepo;
    jwtService;
    config;
    constructor(userRepo, jwtService, config) {
        this.userRepo = userRepo;
        this.jwtService = jwtService;
        this.config = config;
    }
    generateTokens(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        };
        const access_token = this.jwtService.sign(payload);
        const refresh_secret = this.config.get('JWT_REFRESH_SECRET');
        if (!refresh_secret) {
            throw new Error('JWT_REFRESH_SECRET no está configurado');
        }
        const refresh_token = this.jwtService.sign(payload, {
            secret: refresh_secret,
            expiresIn: '30d',
        });
        return { access_token, refresh_token };
    }
    async login(email, password) {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        }
        if (!user.active) {
            throw new common_1.UnauthorizedException('Usuario desactivado');
        }
        const { access_token, refresh_token } = this.generateTokens(user);
        user.refreshToken = await bcrypt.hash(refresh_token, 8);
        await this.userRepo.save(user);
        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        };
        if (user.profilePhotoUrl)
            userData.profilePhotoUrl = user.profilePhotoUrl;
        return {
            access_token,
            refresh_token,
            user: userData,
        };
    }
    async refresh(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
            });
            const user = await this.userRepo.findOne({ where: { id: payload.sub } });
            if (!user || !user.refreshToken) {
                throw new common_1.UnauthorizedException('Sesión inválida');
            }
            const valid = await bcrypt.compare(refreshToken, user.refreshToken);
            if (!valid) {
                throw new common_1.UnauthorizedException('Refresh token inválido');
            }
            const { access_token, refresh_token } = this.generateTokens(user);
            user.refreshToken = await bcrypt.hash(refresh_token, 8);
            await this.userRepo.save(user);
            return { access_token, refresh_token };
        }
        catch {
            throw new common_1.UnauthorizedException('Sesión expirada, inicia sesión nuevamente');
        }
    }
    async logout(userId) {
        await this.userRepo.update(userId, { refreshToken: null });
        return { message: 'Sesión cerrada' };
    }
    async register(name, email, password) {
        if (password.length < 8) {
            throw new common_1.BadRequestException('La contraseña debe tener al menos 8 caracteres');
        }
        if (!/[A-Z]/.test(password) ||
            !/[a-z]/.test(password) ||
            !/[0-9]/.test(password) ||
            !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
            throw new common_1.BadRequestException('La contraseña debe incluir mayúscula, minúscula, número y carácter especial');
        }
        const exists = await this.userRepo.findOne({ where: { email } });
        if (exists)
            throw new common_1.ConflictException('El email ya está registrado');
        const hash = await bcrypt.hash(password, 10);
        const user = this.userRepo.create({ name, email, password: hash });
        const saved = await this.userRepo.save(user);
        return { id: saved.id, name: saved.name, email: saved.email };
    }
    async validateToken(userId) {
        return this.userRepo.findOne({ where: { id: userId } });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map