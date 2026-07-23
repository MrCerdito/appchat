import { User } from '../../auth/entities/user.entity';
export declare class Comunicado {
    id: string;
    asunto: string;
    cuerpo: string;
    sender: User;
    senderName: string;
    status: string;
    destinatarios: {
        email: string;
        nombre: string;
    }[];
    createdAt: Date;
    sentAt: Date | null;
}
