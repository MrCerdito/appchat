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
var AdvisorsWhatsappGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvisorsWhatsappGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const rxjs_1 = require("rxjs");
const advisors_whatsapp_service_1 = require("./advisors-whatsapp.service");
let AdvisorsWhatsappGateway = AdvisorsWhatsappGateway_1 = class AdvisorsWhatsappGateway {
    jwtService;
    config;
    whatsappService;
    server;
    logger = new common_1.Logger(AdvisorsWhatsappGateway_1.name);
    advisorSockets = new Map();
    subscriptions = new rxjs_1.Subscription();
    constructor(jwtService, config, whatsappService) {
        this.jwtService = jwtService;
        this.config = config;
        this.whatsappService = whatsappService;
    }
    onModuleInit() {
        this.subscriptions.add(this.whatsappService.incomingResults$.subscribe((result) => this.emitIncoming(result)));
        this.subscriptions.add(this.whatsappService.messageStatusUpdates$.subscribe((updated) => {
            this.emitStatus(updated.advisorId, {
                messageId: updated.message.id,
                status: updated.message.status,
                chatId: updated.chat.id,
            });
        }));
        this.subscriptions.add(this.whatsappService.connectionUpdates$.subscribe((update) => {
            this.server?.emit('aw_connection_update', update);
        }));
    }
    onModuleDestroy() {
        this.subscriptions.unsubscribe();
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token;
        if (!token) {
            client.disconnect(true);
            return;
        }
        try {
            const secret = this.config.get('JWT_SECRET');
            const payload = this.jwtService.verify(token, { secret });
            if (payload.role !== 'advisor' && payload.role !== 'admin') {
                client.disconnect(true);
                return;
            }
            client.data.user = {
                id: payload.sub,
                name: payload.name,
                email: payload.email,
                role: payload.role,
            };
            client.join(this.advisorRoom(payload.sub));
            this.addAdvisorSocket(payload.sub, client.id);
            this.whatsappService.setConnectedAdvisorIds(this.getConnectedAdvisorIds());
            client.emit('aw_connected', { advisorId: payload.sub });
            client.emit('aw_connection_update', await this.whatsappService.getConnectionStatus());
            this.server.emit('aw_advisors_online', {
                advisorIds: this.getConnectedAdvisorIds(),
            });
            this.logger.log(`Asesor WhatsApp conectado: ${payload.name}`);
            const assignments = await this.whatsappService.assignWaitingChats(this.getConnectedAdvisorIds());
            this.emitAssignments(assignments);
        }
        catch {
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        const advisorId = client.data.user?.id;
        if (!advisorId)
            return;
        const wentOffline = this.removeAdvisorSocket(advisorId, client.id);
        if (!wentOffline)
            return;
        this.whatsappService.setConnectedAdvisorIds(this.getConnectedAdvisorIds());
        this.server.emit('aw_advisors_online', {
            advisorIds: this.getConnectedAdvisorIds(),
        });
        this.logger.log(`Asesor WhatsApp desconectado: ${advisorId}. Sus chats asignados se conservan.`);
    }
    handleJoin(advisorId, client) {
        if (client.data.user?.id !== advisorId &&
            client.data.user?.role !== 'admin')
            return;
        client.join(this.advisorRoom(advisorId));
    }
    getConnectedAdvisorIds() {
        return [...this.advisorSockets.keys()];
    }
    emitIncoming(result) {
        if (result.duplicate)
            return;
        if (result.assignment) {
            if (result.message) {
                this.emitToAdvisor(result.assignment.advisorId, 'aw_new_message', result.message);
                this.server.emit('aw_new_message', result.message);
            }
            this.emitAssignments([result.assignment]);
            return;
        }
        if (result.assignedAdvisorId) {
            if (result.message) {
                this.emitToAdvisor(result.assignedAdvisorId, 'aw_new_message', result.message);
                this.server.emit('aw_new_message', result.message);
            }
            this.emitToAdvisor(result.assignedAdvisorId, 'aw_chat_updated', result.chat);
            this.server.emit('aw_chat_updated', result.chat);
            return;
        }
        this.server.emit('aw_chat_updated', result.chat);
        if (result.message) {
            this.server.emit('aw_new_message', result.message);
        }
        if (result.queueMessage) {
            this.server.emit('aw_new_message', result.queueMessage);
        }
        if (!result.chat.isGroup) {
            this.server.emit('aw_queue_updated', { chat: result.chat });
        }
    }
    emitAssignments(assignments) {
        for (const assignment of assignments) {
            this.emitToAdvisor(assignment.advisorId, 'aw_chat_assigned', {
                advisorId: assignment.advisorId,
                advisorName: assignment.advisorName,
                chat: assignment.chat,
            });
            this.emitToAdvisor(assignment.advisorId, 'aw_chat_updated', assignment.chat);
            this.server.emit('aw_chat_updated', assignment.chat);
            if (assignment.autoMessage) {
                this.emitToAdvisor(assignment.advisorId, 'aw_new_message', assignment.autoMessage);
                this.server.emit('aw_new_message', assignment.autoMessage);
            }
        }
        if (assignments.length) {
            this.server.emit('aw_queue_updated', {});
        }
    }
    emitStatus(advisorId, payload) {
        if (advisorId) {
            this.emitToAdvisor(advisorId, 'aw_message_status', payload);
        }
        else {
            this.server.emit('aw_message_status', payload);
        }
    }
    emitChatUpdated(chat) {
        this.server.emit('aw_chat_updated', chat);
    }
    emitToAdvisor(advisorId, event, payload) {
        this.server.to(this.advisorRoom(advisorId)).emit(event, payload);
    }
    advisorRoom(advisorId) {
        return `advisor:${advisorId}`;
    }
    addAdvisorSocket(advisorId, socketId) {
        const sockets = this.advisorSockets.get(advisorId) ?? new Set();
        sockets.add(socketId);
        this.advisorSockets.set(advisorId, sockets);
    }
    removeAdvisorSocket(advisorId, socketId) {
        const sockets = this.advisorSockets.get(advisorId);
        if (!sockets)
            return false;
        sockets.delete(socketId);
        if (sockets.size > 0)
            return false;
        this.advisorSockets.delete(advisorId);
        return true;
    }
};
exports.AdvisorsWhatsappGateway = AdvisorsWhatsappGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], AdvisorsWhatsappGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('aw_join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappGateway.prototype, "handleJoin", null);
exports.AdvisorsWhatsappGateway = AdvisorsWhatsappGateway = AdvisorsWhatsappGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/advisors-whatsapp',
        maxHttpBufferSize: 1_000_000,
        cors: {
            origin: process.env.CORS_ORIGINS
                ? process.env.CORS_ORIGINS.split(',')
                : ['http://localhost:4200'],
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService,
        advisors_whatsapp_service_1.AdvisorsWhatsappService])
], AdvisorsWhatsappGateway);
//# sourceMappingURL=advisors-whatsapp.gateway.js.map