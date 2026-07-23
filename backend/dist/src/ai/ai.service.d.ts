import { ConfigService } from '@nestjs/config';
import { DocumentosService } from '../documentos/documentos.service';
import { AiLogsService } from './ai-logs.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
export interface AiMessage {
    role: 'user' | 'model';
    text: string;
}
export interface AiResult {
    reply: string;
    transfer: boolean;
    showFeedback: boolean;
    documentos?: {
        nombre: string;
        pdfUrl: string | null;
        categoria: string | null;
    }[];
}
export interface WhatsappSummaryMessage {
    fromMe: boolean;
    body: string;
}
export declare class AiService {
    private config;
    private documentosService;
    private aiLogs;
    private configuracionService;
    private readonly logger;
    private readonly apiKey;
    private readonly apiUrl;
    constructor(config: ConfigService, documentosService: DocumentosService, aiLogs: AiLogsService, configuracionService: ConfiguracionService);
    chat(message: string, history: AiMessage[], clientName: string, colegio: string, tipoSolicitud: string, rol?: string): Promise<AiResult>;
    improveWhatsappDraft(draft: string, profile?: {
        clientName?: string;
        institution?: string;
        role?: string;
    }): Promise<{
        reply: string;
    }>;
    summarizeWhatsappConversation(input: {
        clientName?: string;
        institution?: string;
        role?: string;
        city?: string;
        phone?: string;
        notes?: string[];
        messages?: WhatsappSummaryMessage[];
    }): Promise<{
        summary: string;
    }>;
    chatStream(message: string, history: AiMessage[], clientName: string, colegio: string, tipoSolicitud: string, rol: string, emit: (event: string, data: object) => void): Promise<void>;
    private generateCompactText;
    private compactText;
    private cleanAiPlainText;
    private buildSystemPrompt;
    getApiKey(): string;
}
