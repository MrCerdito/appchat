import { Repository } from 'typeorm';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TicketsService } from '../tickets/tickets.service';
import { AdvisorsWhatsappService, UpdateWhatsappContactInput } from './advisors-whatsapp.service';
import { AdvisorsWhatsappGateway } from './advisors-whatsapp.gateway';
import { TeamsMeetingsService } from './teams-meetings.service';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
export declare class AdvisorsWhatsappController {
    private readonly whatsappService;
    private readonly whatsappGateway;
    private readonly teamsService;
    private readonly config;
    private readonly ticketsService;
    private readonly waMessageRepo;
    private readonly logger;
    constructor(whatsappService: AdvisorsWhatsappService, whatsappGateway: AdvisorsWhatsappGateway, teamsService: TeamsMeetingsService, config: ConfigService, ticketsService: TicketsService, waMessageRepo: Repository<WhatsappMessage>);
    verifyWebhook(mode: string, token: string, challenge: string): string;
    receiveWebhook(_body: any): {
        ok: boolean;
        transport: string;
    };
    listChats(req: Request & {
        user: any;
    }, page?: string, limit?: string): Promise<import("./advisors-whatsapp.service").WaChatDto[] | {
        chats: import("./advisors-whatsapp.service").WaChatDto[];
        total: number;
        hasMore: boolean;
    }>;
    getAdminDashboard(req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WhatsappAdminDashboardDto>;
    getConnection(): Promise<import("./advisors-whatsapp.service").WhatsappConnectionDto>;
    restartConnection(): Promise<import("./advisors-whatsapp.service").WhatsappConnectionDto>;
    logoutConnection(): Promise<import("./advisors-whatsapp.service").WhatsappConnectionDto>;
    getMessages(chatId: string, page: string | undefined, limit: string | undefined, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaMessageDto[]>;
    editMessage(chatId: string, messageId: string, body: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    deleteMessage(chatId: string, messageId: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    reactToMessage(chatId: string, messageId: string, emoji: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    saveNote(chatId: string, note: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    deleteNote(chatId: string, index: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    updateTags(chatId: string, tags: string[], req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    updateContact(chatId: string, body: UpdateWhatsappContactInput, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    markRead(chatId: string, req: Request & {
        user: any;
    }): Promise<{
        ok: boolean;
    }>;
    takeChat(chatId: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    adminAssignChat(chatId: string, req: Request & {
        user: any;
    }, body: {
        advisorId: string;
        mode?: 'admin' | 'temporary';
        message?: string;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    setFixedAdvisor(chatId: string, req: Request & {
        user: any;
    }, advisorId: string): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    clearFixedAdvisor(chatId: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    updateOperationalStatus(chatId: string, req: Request & {
        user: any;
    }, status: any): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    updateChatPriority(chatId: string, req: Request & {
        user: any;
    }, priority: string): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    closeChat(chatId: string, req: Request & {
        user: any;
    }): Promise<import("./advisors-whatsapp.service").WaChatDto>;
    getQuickReplies(): Promise<{
        id: string;
        name: string;
        content: string;
        shortcut: string;
    }[]>;
    getTeamsStatus(req: Request & {
        user: any;
    }): Promise<{
        connected: boolean;
        accountName: string | null | undefined;
    }>;
    getTeamsAuthUrl(req: Request & {
        user: any;
    }): {
        authUrl: string;
    };
    completeTeamsAuth(code: string, state: string, oauthError: string, oauthErrorDescription: string, res: any): Promise<void>;
    createTeamsMeeting(chatId: string, req: Request & {
        user: any;
    }, body: {
        subject: string;
        startDateTime: string;
        durationMinutes?: number;
        calendarTarget?: 'personal' | 'shared' | 'none';
    }): Promise<{
        ok: boolean;
        meeting: import("./teams-meetings.service").TeamsMeetingResult;
        chat: import("./advisors-whatsapp.service").WaChatDto;
    }>;
    sendMessage(_apiKey: string, req: Request & {
        user: any;
    }, body: {
        to: string;
        text: string;
    }): Promise<{
        ok: boolean;
        messageId: string;
        chat: import("./advisors-whatsapp.service").WaChatDto;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        messageId?: undefined;
        chat?: undefined;
    }>;
    replyToMessage(req: Request & {
        user: any;
    }, chatId: string, messageId: string, body: {
        text: string;
    }): Promise<{
        ok: boolean;
        error: string;
        messageId?: undefined;
        chat?: undefined;
    } | {
        ok: boolean;
        messageId: string;
        chat: import("./advisors-whatsapp.service").WaChatDto;
        error?: undefined;
    }>;
    forwardMessage(req: Request & {
        user: any;
    }, chatId: string, messageId: string, body: {
        targetChatId: string;
    }): Promise<{
        ok: boolean;
        error: string;
        messageId?: undefined;
        chat?: undefined;
    } | {
        ok: boolean;
        messageId: string;
        chat: import("./advisors-whatsapp.service").WaChatDto;
        error?: undefined;
    }>;
    sendTemplate(_apiKey: string, req: Request & {
        user: any;
    }, body: {
        to: string;
        templateName: string;
        langCode?: string;
        components?: any[];
    }): Promise<{
        ok: boolean;
        messageId: string;
        chat: import("./advisors-whatsapp.service").WaChatDto;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        messageId?: undefined;
        chat?: undefined;
    }>;
    sendMedia(req: Request & {
        user: any;
    }, file: Express.Multer.File, body: {
        to: string;
        caption?: string;
    }): Promise<{
        ok: boolean;
        error: string;
        messageId?: undefined;
        chat?: undefined;
    } | {
        ok: boolean;
        messageId: string;
        chat: import("./advisors-whatsapp.service").WaChatDto;
        error?: undefined;
    }>;
    createTicketFromWhatsapp(id: string, body: {
        titulo?: string;
        descripcion?: string;
        priority?: string;
        category?: string;
    }, req: Request & {
        user: any;
    }): Promise<import("../tickets/ticket.entity").Ticket>;
    private teamsWhatsappText;
    private teamsCallbackHtml;
    private escapeHtml;
}
