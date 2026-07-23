import type { Response } from 'express';
import { AiService } from './ai.service';
import { AiLogsService } from './ai-logs.service';
import { AiChatDto } from './dto/ai-chat.dto';
export declare class AiController {
    private readonly aiService;
    private readonly aiLogs;
    constructor(aiService: AiService, aiLogs: AiLogsService);
    chat(dto: AiChatDto): Promise<import("./ai.service").AiResult>;
    improveWhatsappDraft(body: {
        draft: string;
        clientName?: string;
        institution?: string;
        role?: string;
    }): Promise<{
        reply: string;
    }>;
    summarizeWhatsapp(body: {
        clientName?: string;
        institution?: string;
        role?: string;
        city?: string;
        phone?: string;
        notes?: string[];
        messages?: {
            fromMe: boolean;
            body: string;
        }[];
    }): Promise<{
        summary: string;
    }>;
    stream(dto: AiChatDto, res: Response): Promise<void>;
    feedback(body: {
        sessionId: string;
        pregunta: string;
        util: boolean;
    }): Promise<{
        ok: boolean;
    }>;
    listModels(): Promise<{
        models: any;
    }>;
}
