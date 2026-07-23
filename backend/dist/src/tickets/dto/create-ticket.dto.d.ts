export declare class CreateTicketDto {
    titulo: string;
    descripcion?: string | null;
    priority?: string;
    category?: string;
    sourceType: string;
    sourceId: string;
    clientName: string;
    clientInfo?: Record<string, any>;
    assignedToId?: string;
    conversation?: any[];
}
