export declare class AiChatDto {
    message: string;
    history?: {
        role: 'user' | 'model';
        text: string;
    }[];
    clientName?: string;
    colegio?: string;
    tipoSolicitud?: string;
    rol?: string;
}
