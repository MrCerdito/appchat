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
var SeedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const user_entity_1 = require("../auth/entities/user.entity");
const configuracion_entity_1 = require("../configuracion/entities/configuracion.entity");
const widget_config_entity_1 = require("../widget/entities/widget-config.entity");
const faq_entity_1 = require("../faq/entities/faq.entity");
const colegio_entity_1 = require("../sessions/entities/colegio.entity");
let SeedService = SeedService_1 = class SeedService {
    userRepo;
    configRepo;
    widgetRepo;
    faqRepo;
    colegioRepo;
    logger = new common_1.Logger(SeedService_1.name);
    constructor(userRepo, configRepo, widgetRepo, faqRepo, colegioRepo) {
        this.userRepo = userRepo;
        this.configRepo = configRepo;
        this.widgetRepo = widgetRepo;
        this.faqRepo = faqRepo;
        this.colegioRepo = colegioRepo;
    }
    async onApplicationBootstrap() {
        await this.seed();
    }
    async seed() {
        if (process.env.NODE_ENV === 'production') {
            this.logger.log('Producción detectada — seed omitido por seguridad');
            return;
        }
        const adminExists = await this.userRepo.findOne({
            where: { role: 'admin' },
        });
        if (adminExists) {
            this.logger.log('Base de datos ya tiene datos — seed omitido');
            return;
        }
        this.logger.log('Base de datos vacía — insertando datos iniciales...');
        try {
            await this.seedUsers();
            await this.seedConfiguracion();
            await this.seedWidgetConfig();
            await this.seedColegios();
            await this.seedFaqs();
            this.logger.log('Seed completado exitosamente');
        }
        catch (error) {
            this.logger.error('Error durante el seed:', error);
        }
    }
    async seedUsers() {
        const passwordHashAdmin = await bcrypt.hash('Admin@123456', 10);
        const passwordHashAsesor = await bcrypt.hash('Asesor@123456', 10);
        const admin = this.userRepo.create({
            name: 'Administrador',
            email: 'admin@innovacloud.co',
            password: passwordHashAdmin,
            role: 'admin',
            active: true,
            status: 'offline',
            activeChats: 0,
        });
        await this.userRepo.save(admin);
        const advisor = this.userRepo.create({
            name: 'Andres Sapta',
            email: 'asesor@innovacloud.com',
            password: passwordHashAsesor,
            role: 'advisor',
            active: true,
            status: 'offline',
            activeChats: 0,
        });
        await this.userRepo.save(advisor);
        this.logger.log('Usuarios creados exitosamente');
    }
    async seedConfiguracion() {
        const config = this.configRepo.create({
            advisorId: null,
            mensajeBienvenida: '¡Hola! Soy {{asesor}}, tu asesor de soporte. ¿En qué puedo ayudarte hoy?',
            asesorInactividadSeg: 120,
            asesorInactividadMsg: 'Estamos trabajando en tu solicitud, en breve te atendemos.',
            clienteInactividadSeg: 180,
            clienteInactividadMsg: '¿Sigues en línea? Tu sesión se cerrará pronto si no hay respuesta.',
            clienteInactividadIters: 2,
            clienteCierreMsg: 'La sesión ha sido cerrada por inactividad. Puedes iniciar una nueva consulta cuando lo necesites.',
            horarios: [
                { dia: 1, inicio: '08:00', fin: '17:00' },
                { dia: 2, inicio: '08:00', fin: '17:00' },
                { dia: 3, inicio: '08:00', fin: '17:00' },
                { dia: 4, inicio: '08:00', fin: '17:00' },
                { dia: 5, inicio: '08:00', fin: '17:00' },
            ],
            horarioFueraMsg: 'En este momento estamos fuera de horario. Nuestro horario de atención es de lunes a viernes de 8:00 a 17:00.',
            horariosActivos: true,
            whatsappAssignmentMsg: 'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
            whatsappQueueMsg: 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
            whatsappOutOfHoursMsg: 'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
            whatsappCallUnavailableMsg: 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
            whatsappQuickReplies: [
                { name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
                { name: 'Espera', content: 'Dame un momento mientras valido la informacion.' },
                { name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
            ],
            almuerzos: [],
            ticketCategories: [
                'Soporte tecnico',
                'Administrativo',
                'Academico',
                'Facturacion',
                'Otro',
            ],
        });
        await this.configRepo.save(config);
        this.logger.log('Configuración global creada');
    }
    async seedWidgetConfig() {
        const widget = this.widgetRepo.create({
            color: '#2563eb',
            posicion: 'bottom-right',
            forma: 'circle',
            tamano: 'md',
            icono: 'chat',
            textoBoton: '',
            mostrarTexto: false,
            abrirAutomatico: false,
            delayAutoAbrir: 5,
            mensajeBurbuja: '¿Necesitas ayuda? ¡Chatea con nosotros!',
            mostrarBurbuja: true,
            tituloPanelChat: 'Soporte en línea',
            subtituloPanelChat: 'Estamos aquí para ayudarte',
            chatUrl: 'https://ia.innovacloud.co',
            chatHeaderColor: '#1a1a1a',
            chatBgColor: '#f0ede9',
            chatBubbleColor: '#ffffff',
            chatBubbleUserColor: '#1a1a1a',
            chatMarca: 'Soporte en línea',
        });
        await this.widgetRepo.save(widget);
        this.logger.log('Widget config creado');
    }
    async seedColegios() {
        const colegios = this.colegioRepo.create([
            {
                nombre: 'Innovacloud',
                link: 'https://innovacloud.co',
                email: 'info@innovacloud.co',
            },
            { nombre: 'Colegio General', link: '#', email: '' },
        ]);
        await this.colegioRepo.save(colegios);
        this.logger.log('Colegios creados');
    }
    async seedFaqs() {
        const faqs = this.faqRepo.create([
            {
                pregunta: '¿Cómo puedo contactar a un asesor?',
                respuesta: 'Puedes contactar a un asesor a través de nuestro chat en línea. Solo escribe tu consulta y un asesor te atenderá a la brevedad.',
                categoria: 'General',
                keywords: ['contactar', 'asesor', 'ayuda', 'humano'],
                orden: 1,
                activo: true,
            },
            {
                pregunta: '¿Cuál es el horario de atención?',
                respuesta: 'Nuestro horario de atención es de lunes a viernes de 8:00 a 17:00.',
                categoria: 'General',
                keywords: ['horario', 'atencion', 'horas'],
                orden: 2,
                activo: true,
            },
            {
                pregunta: '¿Cómo puedo crear un ticket de soporte?',
                respuesta: 'Durante tu conversación con un asesor, puedes solicitar la creación de un ticket para dar seguimiento a tu caso de manera más estructurada.',
                categoria: 'Soporte',
                keywords: ['ticket', 'soporte', 'caso', 'seguimiento'],
                orden: 3,
                activo: true,
            },
        ]);
        await this.faqRepo.save(faqs);
        this.logger.log('FAQs creadas');
    }
};
exports.SeedService = SeedService;
exports.SeedService = SeedService = SeedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(configuracion_entity_1.Configuracion)),
    __param(2, (0, typeorm_1.InjectRepository)(widget_config_entity_1.WidgetConfig)),
    __param(3, (0, typeorm_1.InjectRepository)(faq_entity_1.Faq)),
    __param(4, (0, typeorm_1.InjectRepository)(colegio_entity_1.Colegio)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SeedService);
//# sourceMappingURL=seed.service.js.map