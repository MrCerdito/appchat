import { User } from '../../auth/entities/user.entity';
import { Message } from '../../chat/entities/message.entity';
export declare class Session {
    id: string;
    codigo: string | null;
    clientName: string;
    identificacion: string | null;
    apellido: string | null;
    rol: string | null;
    colegio: string | null;
    colegioLink: string | null;
    tipoSolicitud: string | null;
    status: string;
    advisor: User | null;
    createdAt: Date;
    closedAt: Date | null;
    messages: Message[];
}
