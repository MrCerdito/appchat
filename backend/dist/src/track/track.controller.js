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
exports.TrackController = void 0;
const common_1 = require("@nestjs/common");
const comunicados_service_1 = require("../comunicados/comunicados.service");
let TrackController = class TrackController {
    comunicadosService;
    constructor(comunicadosService) {
        this.comunicadosService = comunicadosService;
    }
    async trackOpen(id, email, req, res) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip;
        const ua = req.headers['user-agent'] ?? '';
        await this.comunicadosService
            .registrarApertura(id, decodeURIComponent(email), ua, ip)
            .catch(() => { });
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.set('Content-Type', 'image/gif');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.send(pixel);
    }
    async trackClick(id, email, url, req, res) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip;
        const ua = req.headers['user-agent'] ?? '';
        const destino = await this.comunicadosService
            .registrarClic(id, decodeURIComponent(email), decodeURIComponent(url), ua, ip)
            .catch(() => decodeURIComponent(url));
        const safeUrl = destino?.startsWith('http://') || destino?.startsWith('https://')
            ? destino
            : '/';
        res.redirect(safeUrl);
    }
};
exports.TrackController = TrackController;
__decorate([
    (0, common_1.Get)('open/:id/:email'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('email')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], TrackController.prototype, "trackOpen", null);
__decorate([
    (0, common_1.Get)('click/:id/:email'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('email')),
    __param(2, (0, common_1.Query)('url')),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], TrackController.prototype, "trackClick", null);
exports.TrackController = TrackController = __decorate([
    (0, common_1.Controller)('track'),
    __metadata("design:paramtypes", [comunicados_service_1.ComunicadosService])
], TrackController);
//# sourceMappingURL=track.controller.js.map