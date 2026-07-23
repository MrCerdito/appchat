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
exports.DocumentosController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const documentos_service_1 = require("./documentos.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const UPLOADS_DIR = (0, path_1.join)(process.cwd(), 'uploads', 'documentos');
let DocumentosController = class DocumentosController {
    docService;
    constructor(docService) {
        this.docService = docService;
    }
    listar() {
        return this.docService.listar();
    }
    async upload(file, body) {
        if (!file)
            throw new common_1.BadRequestException('Archivo PDF requerido');
        if (!body.nombre?.trim())
            throw new common_1.BadRequestException('El nombre es requerido');
        const { readFileSync } = require('fs');
        const pdfBuffer = readFileSync(file.path);
        const backendUrl = process.env.APP_URL ?? 'http://localhost:3001';
        const pdfUrl = `${backendUrl}/uploads/documentos/${file.filename}`;
        const mapaRoles = {
            admin: 'administrador',
            administrador: 'administrador',
            docente: 'docente',
            profesor: 'docente',
            estudiante: 'estudiante',
            alumno: 'estudiante',
            padre: 'padre',
            madre: 'padre',
            acudiente: 'padre',
        };
        const rolesPermitidos = body.rolesPermitidos
            ? body.rolesPermitidos
                .split(',')
                .map((r) => mapaRoles[r.trim().toLowerCase()] ?? r.trim().toLowerCase())
                .filter(Boolean)
            : ['administrador', 'docente', 'estudiante', 'padre'];
        return this.docService.procesarPdf({
            nombre: body.nombre.trim(),
            descripcion: body.descripcion?.trim() ?? '',
            categoria: body.categoria?.trim() ?? 'general',
            colegio: body.colegio?.trim() || undefined,
            rolesPermitidos,
            pdfBuffer,
            pdfPath: file.path,
            pdfUrl,
        });
    }
    actualizarRoles(nombre, body) {
        return this.docService.actualizarRoles(decodeURIComponent(nombre), body);
    }
    eliminar(nombre) {
        return this.docService.eliminar(decodeURIComponent(nombre));
    }
    buscar(body) {
        return this.docService.buscarRelevantes(body.query, body.colegio, undefined, body.topK ? Number(body.topK) : 4);
    }
};
exports.DocumentosController = DocumentosController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DocumentosController.prototype, "listar", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                if (!(0, fs_1.existsSync)(UPLOADS_DIR)) {
                    (0, fs_1.mkdirSync)(UPLOADS_DIR, { recursive: true });
                }
                cb(null, UPLOADS_DIR);
            },
            filename: (req, file, cb) => {
                const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
                cb(null, unique + (0, path_1.extname)(file.originalname));
            },
        }),
        fileFilter: (req, file, cb) => {
            if (file.mimetype !== 'application/pdf') {
                cb(new common_1.BadRequestException('Solo se aceptan archivos PDF'), false);
            }
            else {
                cb(null, true);
            }
        },
        limits: { fileSize: 20 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "upload", null);
__decorate([
    (0, common_1.Patch)(':nombre/roles'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('nombre')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentosController.prototype, "actualizarRoles", null);
__decorate([
    (0, common_1.Delete)(':nombre'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('nombre')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentosController.prototype, "eliminar", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocumentosController.prototype, "buscar", null);
exports.DocumentosController = DocumentosController = __decorate([
    (0, common_1.Controller)('documentos'),
    __metadata("design:paramtypes", [documentos_service_1.DocumentosService])
], DocumentosController);
//# sourceMappingURL=documentos.controller.js.map