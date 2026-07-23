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
exports.AdvisorsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const advisors_service_1 = require("./advisors.service");
const create_advisor_dto_1 = require("./dto/create-advisor.dto");
const update_advisor_dto_1 = require("./dto/update-advisor.dto");
const update_password_dto_1 = require("./dto/update-password.dto");
const query_advisor_dto_1 = require("./dto/query-advisor.dto");
const roles_guard_1 = require("../auth/roles.guard");
let AdvisorsController = class AdvisorsController {
    advisorsService;
    constructor(advisorsService) {
        this.advisorsService = advisorsService;
    }
    findAll(query) {
        if (query.page || query.limit || query.search) {
            return this.advisorsService.findAllPaginated(query.page ?? 1, query.limit ?? 20, query.search);
        }
        return this.advisorsService.findAll();
    }
    findOne(id) {
        return this.advisorsService.findById(id);
    }
    create(body) {
        return this.advisorsService.create(body.name, body.email, body.password);
    }
    update(id, body) {
        return this.advisorsService.update(id, body);
    }
    updatePassword(id, body) {
        return this.advisorsService
            .updatePassword(id, body.password)
            .then(() => ({ ok: true }));
    }
    toggle(id) {
        return this.advisorsService.toggle(id);
    }
    remove(id) {
        return this.advisorsService.remove(id);
    }
    async uploadPhoto(id, file, req) {
        if (!file)
            throw new common_1.BadRequestException('Archivo no recibido');
        if (req.user.role === 'advisor' && req.user.id !== id) {
            throw new common_1.ForbiddenException('No puedes modificar la foto de otro asesor');
        }
        const ext = file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
        const timestamp = Date.now();
        const filename = `profile-${id}-${timestamp}${ext}`;
        const dir = (0, path_1.join)(process.cwd(), 'uploads', 'profiles');
        const tempPath = file.path;
        const targetPath = (0, path_1.join)(dir, filename);
        try {
            const oldFiles = (0, fs_1.readdirSync)(dir).filter((f) => f.startsWith(`profile-${id}-`));
            for (const old of oldFiles)
                (0, fs_1.unlinkSync)((0, path_1.join)(dir, old));
        }
        catch {
        }
        try {
            const { renameSync } = await Promise.resolve().then(() => __importStar(require('fs')));
            renameSync(tempPath, targetPath);
        }
        catch {
            const { readFileSync } = await Promise.resolve().then(() => __importStar(require('fs')));
            const data = readFileSync(tempPath);
            (0, fs_1.writeFileSync)(targetPath, data);
            try {
                (0, fs_1.unlinkSync)(tempPath);
            }
            catch { }
        }
        const backendUrl = process.env.APP_URL || 'http://localhost:3001';
        const profilePhotoUrl = `${backendUrl}/uploads/profiles/${filename}`;
        await this.advisorsService.updatePhoto(id, profilePhotoUrl);
        return { profilePhotoUrl };
    }
    async deletePhoto(id, req) {
        if (req.user.role === 'advisor' && req.user.id !== id) {
            throw new common_1.ForbiddenException('No puedes eliminar la foto de otro asesor');
        }
        const user = await this.advisorsService.findById(id);
        if (user.profilePhotoUrl) {
            const oldPath = (0, path_1.join)(process.cwd(), 'uploads', 'profiles', `profile-${id}.*`);
            try {
                const oldName = user.profilePhotoUrl.split('/').pop();
                if (oldName)
                    (0, fs_1.unlinkSync)((0, path_1.join)(process.cwd(), 'uploads', 'profiles', oldName));
            }
            catch {
            }
        }
        await this.advisorsService.updatePhoto(id, null);
        return { ok: true };
    }
};
exports.AdvisorsController = AdvisorsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_advisor_dto_1.QueryAdvisorDto]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_advisor_dto_1.CreateAdvisorDto]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new common_1.ValidationPipe({ whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_advisor_dto_1.UpdateAdvisorDto]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/password'),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new common_1.ValidationPipe({ whitelist: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_password_dto_1.UpdatePasswordDto]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Patch)(':id/toggle'),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "toggle", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)(':id/photo'),
    (0, roles_guard_1.Roles)('admin', 'advisor'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('photo', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                const dir = (0, path_1.join)(process.cwd(), 'uploads', 'profiles');
                if (!(0, fs_1.existsSync)(dir))
                    (0, fs_1.mkdirSync)(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (_req, file, cb) => {
                const ext = file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
                cb(null, `temp-${Date.now()}${ext}`);
            },
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new common_1.BadRequestException('Solo se permiten imágenes', ''), false);
            }
            cb(null, true);
        },
    })),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "uploadPhoto", null);
__decorate([
    (0, common_1.Delete)(':id/photo'),
    (0, roles_guard_1.Roles)('admin', 'advisor'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsController.prototype, "deletePhoto", null);
exports.AdvisorsController = AdvisorsController = __decorate([
    (0, common_1.Controller)('advisors'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [advisors_service_1.AdvisorsService])
], AdvisorsController);
//# sourceMappingURL=advisors.controller.js.map