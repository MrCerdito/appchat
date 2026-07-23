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
exports.ConfiguracionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const configuracion_entity_1 = require("./entities/configuracion.entity");
const sanitize_helper_1 = require("../common/security/sanitize.helper");
let ConfiguracionService = class ConfiguracionService {
    repo;
    dias = [
        'domingo',
        'lunes',
        'martes',
        'miercoles',
        'jueves',
        'viernes',
        'sabado',
    ];
    configCache = new Map();
    CACHE_TTL_MS = 30_000;
    constructor(repo) {
        this.repo = repo;
    }
    async onModuleInit() {
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS whatsapp_quick_replies jsonb NOT NULL
      DEFAULT '["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]'::jsonb
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS whatsapp_call_unavailable_msg text NOT NULL
      DEFAULT 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.'
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_activado boolean NOT NULL DEFAULT true
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_whatsapp varchar(30) NOT NULL DEFAULT 'whatsapp1'
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_asesor varchar(30) NOT NULL DEFAULT 'asesor1'
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_cliente varchar(30) NOT NULL DEFAULT 'cliente1'
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_asignacion varchar(30) NOT NULL DEFAULT 'asignacion1'
    `);
        await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ai_prompt_config jsonb DEFAULT NULL
    `);
        const count = await this.repo.count({ where: { advisorId: null } });
        if (count === 0) {
            await this.getGlobal();
        }
    }
    cacheKey(advisorId) {
        return advisorId ? `advisor:${advisorId}` : 'global';
    }
    getFromCache(key) {
        const entry = this.configCache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.configCache.delete(key);
            return null;
        }
        return entry.data;
    }
    setCache(key, data) {
        this.configCache.set(key, {
            data,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
    }
    invalidateCache(advisorId) {
        this.configCache.delete(this.cacheKey(advisorId));
    }
    async getEfectiva(advisorId) {
        const key = this.cacheKey(advisorId);
        const cached = this.getFromCache(key);
        if (cached)
            return cached;
        if (advisorId) {
            const override = await this.repo.findOne({ where: { advisorId } });
            if (override) {
                this.setCache(key, override);
                return override;
            }
        }
        const global = await this.repo.findOne({
            where: { advisorId: null },
        });
        if (global) {
            this.setCache('global', global);
            return global;
        }
        const defaults = {
            mensajeBienvenida: '¡Bienvenido! ¿En qué puedo ayudarte?',
            asesorInactividadMsg: 'El asesor se ha desconectado. En breve lo atenderá otro.',
            clienteInactividadMsg: '¿Sigues ahí? Escribe algo para continuar.',
            clienteCierreMsg: 'Gracias por contactarnos. Que tengas un buen día.',
            horarioFueraMsg: 'Estamos fuera del horario de atención. Vuelve en nuestro horario habitual.',
            whatsappAssignmentMsg: 'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
            whatsappQueueMsg: 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
            whatsappOutOfHoursMsg: 'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
            whatsappCallUnavailableMsg: 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
            ticketCategories: [
                'Soporte tecnico',
                'Administrativo',
                'Academico',
                'Facturacion',
                'Otro',
            ],
            sonidoActivado: true,
            sonidoWhatsapp: 'whatsapp1',
            sonidoAsesor: 'asesor1',
            sonidoCliente: 'cliente1',
            sonidoAsignacion: 'asignacion1',
        };
        const nueva = this.repo.create({ ...defaults, advisorId: null });
        const saved = await this.repo.save(nueva);
        this.setCache('global', saved);
        return saved;
    }
    async getEfectivaBatch(advisorIds) {
        const result = new Map();
        const missingIds = [];
        const globalCached = this.getFromCache('global');
        let globalConfig = globalCached;
        for (const id of advisorIds) {
            const cached = this.getFromCache(this.cacheKey(id));
            if (cached) {
                result.set(id, cached);
            }
            else {
                missingIds.push(id);
            }
        }
        if (missingIds.length > 0) {
            const overrides = await this.repo
                .createQueryBuilder('c')
                .where('c.advisor_id IN (:...ids)', { ids: missingIds })
                .getMany();
            const overrideMap = new Map(overrides.map(o => [o.advisorId, o]));
            for (const id of missingIds) {
                const override = overrideMap.get(id);
                if (override) {
                    this.setCache(this.cacheKey(id), override);
                    result.set(id, override);
                }
                else {
                    if (!globalConfig) {
                        globalConfig = await this.repo.findOne({ where: { advisorId: null } });
                        if (globalConfig)
                            this.setCache('global', globalConfig);
                    }
                    if (globalConfig)
                        result.set(id, globalConfig);
                }
            }
        }
        return result;
    }
    async getGlobal() {
        return this.getEfectiva();
    }
    async guardar(data, advisorId) {
        this.sanitizeConfigText(data);
        if (Array.isArray(data.whatsappQuickReplies)) {
            const first = data.whatsappQuickReplies[0];
            if (typeof first === 'string') {
                data.whatsappQuickReplies = data.whatsappQuickReplies
                    .map((text) => {
                    const clean = (0, sanitize_helper_1.cleanText)(text, 500);
                    if (!clean)
                        return null;
                    return { name: clean.slice(0, 60), content: clean };
                })
                    .filter(Boolean)
                    .slice(0, 20);
            }
            else {
                data.whatsappQuickReplies = data.whatsappQuickReplies
                    .filter((r) => r?.name && r?.content)
                    .map((r) => ({
                    name: String(r.name).slice(0, 60),
                    content: (0, sanitize_helper_1.cleanText)(String(r.content), 500) || '',
                }))
                    .filter((r) => r.content)
                    .slice(0, 20);
            }
        }
        const existing = await this.repo.findOne({
            where: { advisorId: (advisorId ?? null) },
        });
        let saved;
        if (existing) {
            const readOnlyKeys = ['id', 'advisorId', 'createdAt', 'updatedAt'];
            for (const key of readOnlyKeys) {
                delete data[key];
            }
            Object.assign(existing, data);
            saved = await this.repo.save(existing);
        }
        else {
            const global = await this.repo.findOne({ where: { advisorId: null } });
            const defaults = global ? { ...global } : {};
            delete defaults.id;
            delete defaults.advisorId;
            const nueva = this.repo.create({ ...defaults, ...data, advisorId: advisorId ?? null });
            saved = await this.repo.save(nueva);
        }
        this.invalidateCache(advisorId);
        if (!advisorId) {
            this.invalidateCache(undefined);
        }
        return saved;
    }
    sanitizeConfigText(data) {
        const textKeys = [
            'mensajeBienvenida',
            'asesorInactividadMsg',
            'clienteInactividadMsg',
            'clienteCierreMsg',
            'horarioFueraMsg',
            'whatsappAssignmentMsg',
            'whatsappQueueMsg',
            'whatsappOutOfHoursMsg',
            'whatsappCallUnavailableMsg',
        ];
        for (const key of textKeys) {
            const value = data[key];
            if (typeof value === 'string') {
                data[key] = (0, sanitize_helper_1.cleanText)(value, 4096);
            }
        }
        if (Array.isArray(data.ticketCategories)) {
            data.ticketCategories = data.ticketCategories
                .map((c) => (0, sanitize_helper_1.cleanText)(c, 100))
                .filter(Boolean)
                .slice(0, 20);
        }
        if (data.aiPromptConfig && typeof data.aiPromptConfig === 'object') {
            const aiCfg = data.aiPromptConfig;
            if (typeof aiCfg.nombreAsistente === 'string') {
                aiCfg.nombreAsistente = (0, sanitize_helper_1.cleanText)(aiCfg.nombreAsistente, 200);
            }
            if (typeof aiCfg.especialidad === 'string') {
                aiCfg.especialidad = (0, sanitize_helper_1.cleanText)(aiCfg.especialidad, 200);
            }
            if (typeof aiCfg.instruccionesGenerales === 'string') {
                aiCfg.instruccionesGenerales = (0, sanitize_helper_1.cleanText)(aiCfg.instruccionesGenerales, 2000);
            }
            if (typeof aiCfg.feedbackPositivo === 'string') {
                aiCfg.feedbackPositivo = (0, sanitize_helper_1.cleanText)(aiCfg.feedbackPositivo, 500);
            }
            if (Array.isArray(aiCfg.frasesTransferencia)) {
                aiCfg.frasesTransferencia = aiCfg.frasesTransferencia
                    .map((f) => (0, sanitize_helper_1.cleanText)(String(f), 50))
                    .filter(Boolean)
                    .slice(0, 20);
            }
            if (typeof aiCfg.promptPersonalizado === 'string') {
                aiCfg.promptPersonalizado = (0, sanitize_helper_1.cleanText)(aiCfg.promptPersonalizado, 10000);
            }
            if (aiCfg.roles && typeof aiCfg.roles === 'object') {
                const validKeys = ['administrador', 'docente', 'estudiante', 'padre'];
                for (const key of Object.keys(aiCfg.roles)) {
                    if (!validKeys.includes(key)) {
                        delete aiCfg.roles[key];
                        continue;
                    }
                    const role = aiCfg.roles[key];
                    if (typeof role.descripcion === 'string') {
                        role.descripcion = (0, sanitize_helper_1.cleanText)(role.descripcion, 500);
                    }
                    if (typeof role.mensajeRestringido === 'string') {
                        role.mensajeRestringido = (0, sanitize_helper_1.cleanText)(role.mensajeRestringido, 500);
                    }
                    if (Array.isArray(role.temasRestringidos)) {
                        role.temasRestringidos = role.temasRestringidos
                            .map((t) => (0, sanitize_helper_1.cleanText)(String(t), 50))
                            .filter(Boolean)
                            .slice(0, 30);
                    }
                }
            }
            const jsonStr = JSON.stringify(aiCfg);
            if (jsonStr.length > 50000) {
                data.aiPromptConfig = null;
            }
        }
    }
    async resetearOverride(advisorId) {
        await this.repo.delete({ advisorId });
        return { ok: true };
    }
    async estaEnHorario(_advisorId) {
        const estado = await this.getHorarioEstado();
        return estado.enJornada;
    }
    async getHorarioEstado() {
        const config = await this.getGlobal();
        const horarios = config.horarios ?? [];
        const ahora = new Date();
        const diaHoy = ahora.getDay();
        const hhmm = this.hhmm(ahora);
        if (!config.horariosActivos) {
            return {
                enJornada: true,
                diaHoy,
                horarios,
                mensaje: '',
                proximaApertura: '',
                horaApertura: '',
            };
        }
        const slotHoy = horarios.find((h) => h.dia === diaHoy);
        const enJornada = slotHoy
            ? hhmm >= slotHoy.inicio && hhmm < slotHoy.fin
            : false;
        const proxima = this.getProximaApertura(horarios, ahora);
        return {
            enJornada,
            diaHoy,
            horarios,
            mensaje: config.horarioFueraMsg,
            proximaApertura: proxima.label,
            horaApertura: proxima.hora,
        };
    }
    async estaEnAlmuerzo(advisorId) {
        const config = await this.getEfectiva(advisorId);
        return this.slotActivo(config.almuerzos ?? []);
    }
    slotActivo(slots) {
        const ahora = new Date();
        const dia = ahora.getDay();
        const hhmm = this.hhmm(ahora);
        const slot = slots.find((item) => item.dia === dia);
        return !!slot && hhmm >= slot.inicio && hhmm < slot.fin;
    }
    getProximaApertura(horarios, ahora) {
        if (!horarios.length)
            return { label: 'en nuestro proximo horario', hora: '' };
        const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
        const diaHoy = ahora.getDay();
        for (let offset = 0; offset <= 7; offset++) {
            const dia = (diaHoy + offset) % 7;
            const slotsDia = horarios
                .filter((slot) => slot.dia === dia)
                .sort((a, b) => this.toMinutes(a.inicio) - this.toMinutes(b.inicio));
            for (const slot of slotsDia) {
                if (offset === 0 && this.toMinutes(slot.inicio) <= minutosAhora)
                    continue;
                if (offset === 0)
                    return { label: `hoy a las ${slot.inicio}`, hora: slot.inicio };
                if (offset === 1)
                    return { label: `manana a las ${slot.inicio}`, hora: slot.inicio };
                return {
                    label: `el ${this.dias[dia]} a las ${slot.inicio}`,
                    hora: slot.inicio,
                };
            }
        }
        return { label: 'en nuestro proximo horario', hora: '' };
    }
    hhmm(date) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    toMinutes(hora) {
        const [h = 0, m = 0] = hora.split(':').map(Number);
        return h * 60 + m;
    }
};
exports.ConfiguracionService = ConfiguracionService;
exports.ConfiguracionService = ConfiguracionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(configuracion_entity_1.Configuracion)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ConfiguracionService);
//# sourceMappingURL=configuracion.service.js.map