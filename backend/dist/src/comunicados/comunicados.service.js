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
exports.ComunicadosService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
const resend_1 = require("resend");
const comunicado_entity_1 = require("./entities/comunicado.entity");
const colegio_entity_1 = require("../sessions/entities/colegio.entity");
const comunicado_evento_entity_1 = require("./entities/comunicado-evento.entity");
let ComunicadosService = class ComunicadosService {
    eventoRepo;
    comunicadoRepo;
    colegioRepo;
    config;
    resend;
    constructor(eventoRepo, comunicadoRepo, colegioRepo, config) {
        this.eventoRepo = eventoRepo;
        this.comunicadoRepo = comunicadoRepo;
        this.colegioRepo = colegioRepo;
        this.config = config;
        this.resend = new resend_1.Resend(config.get('RESEND_API_KEY'));
    }
    async findAll(userId, role) {
        if (role === 'admin') {
            return this.comunicadoRepo.find({ order: { createdAt: 'DESC' } });
        }
        return this.comunicadoRepo.find({
            where: { sender: { id: userId } },
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id) {
        const c = await this.comunicadoRepo.findOne({ where: { id } });
        if (!c)
            throw new common_1.NotFoundException('Comunicado no encontrado');
        return c;
    }
    async saveDraft(asunto, cuerpo, destinatarios, user) {
        const c = this.comunicadoRepo.create({
            asunto,
            cuerpo,
            destinatarios,
            sender: user,
            senderName: user.name,
            status: 'draft',
        });
        return this.comunicadoRepo.save(c);
    }
    async updateDraft(id, asunto, cuerpo, destinatarios) {
        const c = await this.findOne(id);
        if (c.status === 'sent')
            throw new common_1.BadRequestException('No se puede editar un comunicado enviado');
        c.asunto = asunto;
        c.cuerpo = cuerpo;
        c.destinatarios = destinatarios.map((d) => ({
            email: d.email,
            nombre: d.nombre,
        }));
        return this.comunicadoRepo.save(c);
    }
    async send(id) {
        const c = await this.findOne(id);
        if (c.status === 'sent')
            throw new common_1.BadRequestException('Ya fue enviado');
        if (!c.destinatarios.length)
            throw new common_1.BadRequestException('Sin destinatarios');
        const baseUrl = this.config.get('APP_URL') ?? 'http://localhost:3001';
        const from = this.config.get('MAIL_FROM');
        const isDev = process.env.NODE_ENV !== 'production';
        const results = await Promise.allSettled(c.destinatarios.map(async (dest) => {
            const emailDestino = isDev ? 'jeanpfmunozv@gmail.com' : dest.email;
            const pixelUrl = `${baseUrl}/track/open/${id}/${encodeURIComponent(dest.email)}`;
            const cuerpoFinal = `
          ${this.injectTracking(c.cuerpo, id, dest.email, baseUrl)}
          <img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>
        `;
            const { data, error } = await this.resend.emails.send({
                from,
                to: emailDestino,
                subject: isDev ? `[TEST → ${dest.email}] ${c.asunto}` : c.asunto,
                html: cuerpoFinal,
            });
            if (error)
                throw new common_1.BadRequestException(error.message);
            return data;
        }));
        c.destinatarios = c.destinatarios.map((dest, i) => {
            const result = results[i];
            if (result.status === 'fulfilled') {
                return { email: dest.email, nombre: dest.nombre, sendStatus: 'ok' };
            }
            const msg = String(result.reason?.message ?? 'Error desconocido');
            return {
                email: dest.email,
                nombre: dest.nombre,
                sendStatus: 'failed',
                sendError: msg,
            };
        });
        const enviados = c.destinatarios.filter((d) => d.sendStatus === 'ok').length;
        c.status = enviados > 0 ? 'sent' : 'failed';
        c.sentAt = enviados > 0 ? new Date() : null;
        c.totalEnviados = enviados;
        return this.comunicadoRepo.save(c);
    }
    async getStats(id) {
        const c = await this.findOne(id);
        const eventos = await this.eventoRepo.find({
            where: { comunicado: { id } },
            order: { createdAt: 'DESC' },
        });
        const aperturasPorEmail = new Map();
        const clicsPorEmail = new Map();
        eventos.forEach((e) => {
            if (e.tipo === 'apertura') {
                aperturasPorEmail.set(e.email, (aperturasPorEmail.get(e.email) ?? 0) + 1);
            }
            else {
                clicsPorEmail.set(e.email, (clicsPorEmail.get(e.email) ?? 0) + 1);
            }
        });
        return {
            totalEnviados: c.totalEnviados,
            totalAperturas: c.totalAperturas,
            totalClics: c.totalClics,
            tasaApertura: c.totalEnviados > 0
                ? Math.round((c.totalAperturas / c.totalEnviados) * 100)
                : 0,
            tasaClics: c.totalEnviados > 0
                ? Math.round((c.totalClics / c.totalEnviados) * 100)
                : 0,
            detalle: c.destinatarios.map((d) => ({
                email: d.email,
                nombre: d.nombre,
                aperturas: aperturasPorEmail.get(d.email) ?? 0,
                clics: clicsPorEmail.get(d.email) ?? 0,
                sendStatus: d.sendStatus ?? 'ok',
                sendError: d.sendError ?? null,
            })),
            eventos: eventos.slice(0, 50),
        };
    }
    async remove(id) {
        const c = await this.findOne(id);
        await this.comunicadoRepo.remove(c);
    }
    async getColegios() {
        return this.colegioRepo.find({ order: { nombre: 'ASC' } });
    }
    async registrarApertura(comunicadoId, email, userAgent, ip) {
        await this.eventoRepo.save(this.eventoRepo.create({
            comunicado: { id: comunicadoId },
            email,
            tipo: 'apertura',
            userAgent,
            ip,
        }));
        await this.comunicadoRepo.increment({ id: comunicadoId }, 'totalAperturas', 1);
    }
    async markBounced(email, reason) {
        const comunicados = await this.comunicadoRepo.find({
            where: { status: 'sent' },
            order: { sentAt: 'DESC' },
            take: 10,
        });
        for (const c of comunicados) {
            const idx = c.destinatarios.findIndex((d) => d.email === email && d.sendStatus === 'ok');
            if (idx !== -1) {
                c.destinatarios[idx] = {
                    ...c.destinatarios[idx],
                    sendStatus: 'failed',
                    sendError: `Rebote: ${reason}`,
                };
                await this.comunicadoRepo.save(c);
            }
        }
    }
    async registrarClic(comunicadoId, email, urlDestino, userAgent, ip) {
        await this.eventoRepo.save(this.eventoRepo.create({
            comunicado: { id: comunicadoId },
            email,
            tipo: 'clic',
            urlDestino,
            userAgent,
            ip,
        }));
        await this.comunicadoRepo.increment({ id: comunicadoId }, 'totalClics', 1);
        return urlDestino;
    }
    injectTracking(html, comunicadoId, email, baseUrl) {
        return html.replace(/<a\s+href="([^"]+)"/gi, (_, url) => {
            const tracked = `${baseUrl}/track/click/${comunicadoId}/${encodeURIComponent(email)}?url=${encodeURIComponent(url)}`;
            return `<a href="${tracked}"`;
        });
    }
};
exports.ComunicadosService = ComunicadosService;
exports.ComunicadosService = ComunicadosService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(comunicado_evento_entity_1.ComunicadoEvento)),
    __param(1, (0, typeorm_1.InjectRepository)(comunicado_entity_1.Comunicado)),
    __param(2, (0, typeorm_1.InjectRepository)(colegio_entity_1.Colegio)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        config_1.ConfigService])
], ComunicadosService);
//# sourceMappingURL=comunicados.service.js.map