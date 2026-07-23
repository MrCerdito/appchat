import { User } from '../auth/entities/user.entity';
export declare class Ticket {
    id: string;
    codigo: string;
    titulo: string;
    descripcion: string | null;
    status: string;
    priority: string;
    category: string | null;
    sourceType: string;
    sourceId: string | null;
    conversation: any[] | null;
    assignedTo: User | null;
    assignedToName: string | null;
    clientName: string;
    clientInfo: Record<string, any> | null;
    createdBy: User | null;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    closedBy: User | null;
}
