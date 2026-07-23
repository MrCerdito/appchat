import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { AdvisorsWhatsappService, AssignmentResult, IncomingHandlingResult } from './advisors-whatsapp.service';
export declare class AdvisorsWhatsappGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
    private readonly jwtService;
    private readonly config;
    private readonly whatsappService;
    server: Server;
    private readonly logger;
    private readonly advisorSockets;
    private readonly subscriptions;
    constructor(jwtService: JwtService, config: ConfigService, whatsappService: AdvisorsWhatsappService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    handleJoin(advisorId: string, client: Socket): void;
    getConnectedAdvisorIds(): string[];
    emitIncoming(result: IncomingHandlingResult): void;
    emitAssignments(assignments: AssignmentResult[]): void;
    emitStatus(advisorId: string | undefined, payload: {
        messageId: string;
        status: string;
        chatId?: string;
    }): void;
    emitChatUpdated(chat: unknown): void;
    private emitToAdvisor;
    private advisorRoom;
    private addAdvisorSocket;
    private removeAdvisorSocket;
}
