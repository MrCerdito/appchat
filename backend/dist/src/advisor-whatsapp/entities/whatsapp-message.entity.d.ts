import { User } from '../../auth/entities/user.entity';
import { WhatsappChat } from './whatsapp-chat.entity';
export type WhatsappMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export declare class WhatsappMessage {
    id: string;
    metaMessageId: string | null;
    chat: WhatsappChat;
    body: string;
    fromMe: boolean;
    senderName: string;
    participantJid: string | null;
    advisor: User | null;
    status: WhatsappMessageStatus;
    isAuto: boolean;
    type: string;
    mediaId: string | null;
    mediaUrl: string | null;
    mimeType: string | null;
    fileName: string | null;
    fileSize: number | null;
    editedAt: Date | null;
    replyToMessageId: string | null;
    createdAt: Date;
}
