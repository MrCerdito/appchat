import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { type WAMessage, type WAMessageKey } from '@whiskeysockets/baileys';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import type { WhatsappAssignmentMode, WhatsappOperationalStatus } from './entities/whatsapp-chat.entity';
import { WhatsappMessage, WhatsappMessageStatus } from './entities/whatsapp-message.entity';
export interface IncomingWhatsappMessage {
    messageId: string;
    chatJid?: string;
    from: string;
    fromName: string;
    senderName?: string;
    advisorId?: string;
    participantJid?: string;
    isGroup?: boolean;
    type: string;
    text: string;
    mediaId?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    reactionToMessageId?: string;
    timestamp: string;
    phoneNumberId?: string;
    messageKey?: WAMessageKey;
    rawMessage?: WAMessage;
}
export type WhatsappMediaType = 'image' | 'video' | 'audio' | 'document';
export interface WhatsappStatusUpdate {
    messageId: string;
    status: WhatsappMessageStatus;
    timestamp: string;
}
export interface WaMessageDto {
    id: string;
    chatId: string;
    body: string;
    fromMe: boolean;
    timestamp: Date;
    status: WhatsappMessageStatus;
    isAuto: boolean;
    type: string;
    senderName?: string;
    advisorId?: string;
    participantJid?: string;
    mediaId?: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
    editedAt?: Date;
    metaMessageId?: string;
    reactionToMessageId?: string;
    reactionByName?: string;
    reactionRemoved?: boolean;
    replyToMessageId?: string;
    quotedBody?: string;
    quotedSender?: string;
    isForwarded?: boolean;
}
export interface WaChatDto {
    id: string;
    name: string;
    role: string;
    institution: string;
    institutionUrl: string;
    city: string;
    avatar: string;
    phone: string;
    jid?: string;
    isGroup: boolean;
    email: string;
    plan: string;
    modules: string[];
    stage: string;
    stageIdx: number;
    tag: 'pendiente' | 'asignado' | 'cerrado';
    assignmentStatus: 'waiting' | 'active' | 'closed';
    operationalStatus: WhatsappOperationalStatus;
    operationalStatusLabel: string;
    assignmentMode?: WhatsappAssignmentMode;
    assignedTo?: string;
    assignedToName?: string;
    fixedAdvisorId?: string;
    fixedAdvisorName?: string;
    unread: number;
    preview: string;
    time: string;
    status: 'online' | 'away' | 'offline';
    notes: string[];
    quickReplies: Array<{
        name: string;
        content: string;
    }>;
    lastClientMsg: Date;
    messages: WaMessageDto[];
    priority?: 'low' | 'normal' | 'high' | 'critical';
}
export interface UpdateWhatsappContactInput {
    name?: string;
    role?: string;
    institution?: string;
    institutionUrl?: string | null;
    city?: string;
    phone?: string;
    email?: string | null;
    plan?: string;
    modules?: string[];
}
export interface AssignmentResult {
    advisorId: string;
    advisorName: string;
    chat: WaChatDto;
    autoMessage: WaMessageDto | null;
}
export interface WhatsappAdvisorStatsDto {
    id: string;
    name: string;
    email: string;
    status: string;
    active: boolean;
    activeChats: number;
    closedChats: number;
    waitingCustomerChats: number;
    manualChats: number;
    fixedClients: number;
    avgResponseMinutes: number;
    idleMinutes: number;
    connectedMinutes: number;
    pauseMinutes: number;
    slaPercent: number;
    lastActivity?: string;
}
export interface WhatsappAdminDashboardDto {
    summary: {
        totalChats: number;
        activeChats: number;
        queuedChats: number;
        waitingCustomerChats: number;
        waitingTechnicalChats: number;
        closedChats: number;
        fixedClients: number;
        manualChats: number;
        slaBreached: number;
        frozenChats: number;
        avgResponseMinutes: number;
        slaCompliancePercent: number;
        closedToday: number;
        uniqueClientsToday: number;
    };
    advisors: WhatsappAdvisorStatsDto[];
    chats: WaChatDto[];
    alerts: {
        type: string;
        severity: 'info' | 'warning' | 'critical';
        title: string;
        detail: string;
        chatId?: string;
        advisorId?: string;
    }[];
}
export interface IncomingHandlingResult {
    chat: WaChatDto;
    message: WaMessageDto | null;
    assignedAdvisorId?: string;
    assignment?: AssignmentResult;
    queueMessage?: WaMessageDto | null;
    duplicate?: boolean;
}
export type WhatsappConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';
export interface WhatsappConnectionDto {
    status: WhatsappConnectionStatus;
    qr?: string;
    qrDataUrl?: string;
    connectedJid?: string;
    connectedName?: string;
    lastError?: string;
    updatedAt: string;
}
export declare class AdvisorsWhatsappService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly chatRepo;
    private readonly messageRepo;
    private readonly userRepo;
    private readonly configuracionService;
    private readonly logger;
    private readonly removedReactionBody;
    private readonly maxActiveChatsPerAdvisor;
    private readonly customerIdleReleaseMs;
    private readonly advisorIdleWarningMs;
    private readonly slowResponseWarningMs;
    private sock;
    private connectingPromise;
    private reconnectTimer;
    private connectionStatus;
    private currentQr;
    private currentQrDataUrl;
    private connectedJid;
    private connectedName;
    private lastConnectionError;
    private connectionUpdatedAt;
    private readonly groupNameCache;
    private readonly contactNameCache;
    private readonly connectedAdvisorIds;
    private readonly handledCallIds;
    private socketId;
    private connectionSequence;
    private qrReceivedInSession;
    private reconnectAttempts;
    readonly connectionUpdates$: Subject<WhatsappConnectionDto>;
    readonly incomingResults$: Subject<IncomingHandlingResult>;
    readonly messageStatusUpdates$: Subject<{
        advisorId?: string;
        message: WaMessageDto;
        chat: WaChatDto;
    }>;
    private readonly defaultAssignmentMessage;
    private readonly defaultQueueMessage;
    private readonly defaultOutOfHoursMessage;
    private readonly defaultCallUnavailableMessage;
    readonly defaultQuickReplies: {
        name: string;
        content: string;
    }[];
    private readonly maxTextLength;
    private readonly maxCaptionLength;
    private readonly maxMetadataLength;
    private readonly allowedMediaMimes;
    constructor(config: ConfigService, chatRepo: Repository<WhatsappChat>, messageRepo: Repository<WhatsappMessage>, userRepo: Repository<User>, configuracionService: ConfiguracionService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    setConnectedAdvisorIds(ids: string[]): void;
    getConnectionStatus(): Promise<WhatsappConnectionDto>;
    restartConnection(): Promise<WhatsappConnectionDto>;
    logoutConnection(): Promise<WhatsappConnectionDto>;
    private ensureBaileysConnection;
    private createBaileysSocket;
    private handleBaileysConnectionUpdate;
    private scheduleReconnect;
    private setConnectionState;
    private getConnectionDto;
    private baileysAuthDir;
    private ensureWhatsappSchema;
    handleIncomingMessage(raw: IncomingWhatsappMessage, connectedAdvisorIds: string[]): Promise<IncomingHandlingResult>;
    assignWaitingChats(connectedAdvisorIds: string[]): Promise<AssignmentResult[]>;
    takeQueuedChat(chatId: string, advisorId: string, role: string): Promise<AssignmentResult>;
    reassignChatsForDisconnectedAdvisor(_advisorId: string, _connectedAdvisorIds: string[]): Promise<AssignmentResult[]>;
    getChatById(id: string): Promise<WhatsappChat>;
    listChats(_advisorId: string, _role: string, page?: number, limit?: number): Promise<WaChatDto[] | {
        chats: WaChatDto[];
        total: number;
        hasMore: boolean;
    }>;
    getAdminDashboard(role: string): Promise<WhatsappAdminDashboardDto>;
    adminAssignChat(chatId: string, advisorId: string, role: string, mode?: WhatsappAssignmentMode, customMessage?: string): Promise<AssignmentResult>;
    setFixedAdvisor(chatId: string, advisorId: string, role: string): Promise<WaChatDto>;
    clearFixedAdvisor(chatId: string, role: string): Promise<WaChatDto>;
    updateOperationalStatus(chatId: string, operationalStatus: WhatsappOperationalStatus, advisorId: string, role: string): Promise<WaChatDto>;
    updateChatPriority(chatId: string, priority: 'low' | 'normal' | 'high' | 'critical', role: string): Promise<WaChatDto>;
    getMessages(chatId: string, page?: number, limit?: number, advisorId?: string, role?: string): Promise<WaMessageDto[]>;
    getChatForAdvisor(chatId: string, advisorId: string, role: string): Promise<WaChatDto>;
    private getMessagesInternal;
    editAdvisorMessage(chatId: string, messageId: string, advisorId: string, role: string, text: string): Promise<WaChatDto>;
    deleteAdvisorMessage(chatId: string, messageId: string, advisorId: string, role: string): Promise<WaChatDto>;
    sendAdvisorText(advisorId: string, role: string, to: string, text: string): Promise<{
        chat: WaChatDto;
        message: WaMessageDto;
    }>;
    replyToMessage(advisorId: string, role: string, chatId: string, messageId: string, text: string): Promise<{
        chat: WaChatDto;
        message: WaMessageDto;
    }>;
    forwardMessage(advisorId: string, role: string, chatId: string, messageId: string, targetChatId: string): Promise<{
        chat: WaChatDto;
        message: WaMessageDto;
    }>;
    private downloadMediaFromUrl;
    sendAdvisorMedia(advisorId: string, role: string, to: string, file: Express.Multer.File, caption?: string): Promise<{
        chat: WaChatDto;
        message: WaMessageDto;
    }>;
    sendAdvisorTemplate(advisorId: string, role: string, to: string, templateName: string, langCode?: string, components?: any[]): Promise<{
        chat: WaChatDto;
        message: WaMessageDto;
        messageId?: string;
    }>;
    addNote(chatId: string, note: string, advisorId?: string, role?: string): Promise<WaChatDto>;
    deleteNote(chatId: string, index: number, advisorId?: string, role?: string): Promise<WaChatDto>;
    updateTags(chatId: string, tags: string[], advisorId?: string, role?: string): Promise<WaChatDto>;
    updateContactInfo(chatId: string, input?: UpdateWhatsappContactInput, advisorId?: string, role?: string): Promise<WaChatDto>;
    markRead(chatId: string, advisorId?: string, role?: string): Promise<void>;
    closeChat(chatId: string, advisorId: string, role: string): Promise<WaChatDto>;
    updateMessageStatus(update: WhatsappStatusUpdate): Promise<{
        advisorId?: string;
        message: WaMessageDto;
        chat: WaChatDto;
    } | null>;
    getQuickReplies(): Promise<{
        id: string;
        name: string;
        content: string;
        shortcut: string;
    }[]>;
    sendTextMessage(to: string, text: string): Promise<{
        messages: {
            id: string | null;
        }[];
    }>;
    reactToMessage(chatId: string, messageId: string, advisorId: string, role: string, emoji: string): Promise<WaChatDto>;
    private editRemoteMessage;
    private deleteRemoteMessage;
    sendMediaMessage(to: string, mediaType: WhatsappMediaType, buffer: Buffer, caption?: string, fileName?: string, mimeType?: string): Promise<{
        messages: {
            id: string | null;
        }[];
    }>;
    sendTemplateMessage(to: string, templateName: string, langCode?: string, components?: any[]): Promise<{
        messages: {
            id: string | null;
        }[];
    }>;
    markAsRead(messageId: string): Promise<{
        ok: boolean;
    }>;
    parseIncomingMessages(body: any): IncomingWhatsappMessage[];
    parseStatusUpdates(body: any): WhatsappStatusUpdate[];
    private handleBaileysMessages;
    private handleBaileysMessageUpdates;
    private handleBaileysCalls;
    private baileysMessageToIncoming;
    private saveBaileysOutgoingMessage;
    private extractBaileysBody;
    private unwrapBaileysContent;
    private isIgnorableBaileysContent;
    private mapBaileysStatus;
    private readBaileysMessage;
    private findOrCreateChatForRaw;
    private saveReactionMessage;
    private findChatByAddressOrFail;
    private findChatByAddress;
    private getReadySocket;
    private getChatJid;
    private normalizeTargetJid;
    private phoneToJid;
    private jidToPhone;
    private normalizeJid;
    private isGroupJid;
    private getGroupName;
    private rememberContact;
    private getContactName;
    private profilePictureForChat;
    private refreshProfilePicture;
    private baileysTimestampToIso;
    private assignChatIfPossible;
    private assignChatToAdvisor;
    private finishChatAssignment;
    private sendQueueNoticeIfNeeded;
    private sendOutOfHoursNoticeIfNeeded;
    private sendSystemMessage;
    private findAvailableAdvisor;
    private releaseExpiredActiveChats;
    countActiveChatsByAdvisor(advisorId: string): Promise<number>;
    private findFixedAdvisorIfAvailable;
    private buildAdvisorStats;
    private buildAdminAlerts;
    private averageAdvisorResponseMinutes;
    private isSlaBreached;
    private minutesSince;
    private shouldReleaseForCustomerIdle;
    private findChatOrFail;
    private assertCanViewChat;
    private assertCanManageMetadata;
    private assertWhatsappUserRole;
    private assertAdminRole;
    private assertWindowOpen;
    private isWindowExpired;
    private toChatDto;
    private toChatDtoWithPreload;
    private toMessageDto;
    private inferOperationalStatus;
    private operationalStatusLabel;
    private safeDisplayText;
    private compactLogText;
    private assertAllowedMedia;
    private normalizeMimeType;
    private isCompatibleExtension;
    private isVoiceNoteMime;
    private messagePreview;
    private getQuickReplyTexts;
    private normalizeQuickReplies;
    private quickReplyShortcut;
    private renderTemplate;
    private normalizeUrl;
    private normalizePhone;
    private messageBody;
    private cleanReactionEmoji;
    private attachIncomingMedia;
    private isDownloadableMedia;
    private saveLocalMedia;
    private saveMediaBuffer;
    private extractIncomingMedia;
    private mediaTypeFromMime;
    private normalizeIncomingType;
    private mediaFallbackBody;
    private isLegacyMediaFallback;
    private extFromMime;
    private avatarFor;
    private formatTime;
}
