import { User } from '../../auth/entities/user.entity';
export interface Destinatario {
    email: string;
    nombre: string;
    sendStatus?: 'ok' | 'failed';
    sendError?: string;
}
export declare class Comunicado {
    id: string;
    asunto: string;
    cuerpo: string;
    sender: User;
    senderName: string;
    status: 'draft' | 'sent' | 'failed';
    destinatarios: Destinatario[];
    createdAt: Date;
    sentAt: Date | null;
    totalEnviados: number;
    totalAperturas: number;
    totalClics: number;
}
