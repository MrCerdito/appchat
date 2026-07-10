import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';
import { AiLogsService } from './ai-logs.service';
import { AiChatDto } from './dto/ai-chat.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiLogs: AiLogsService,
  ) {}

  @Post('chat')
  async chat(@Body() dto: AiChatDto) {
    if (!dto.message?.trim())
      return {
        reply: 'Por favor escribe un mensaje.',
        transfer: false,
        showFeedback: false,
      };

    return this.aiService.chat(
      dto.message,
      dto.history ?? [],
      dto.clientName ?? '',
      dto.colegio ?? '',
      dto.tipoSolicitud ?? '',
      dto.rol ?? 'estudiante',
    );
  }

  @Post('whatsapp/improve')
  async improveWhatsappDraft(
    @Body()
    body: {
      draft: string;
      clientName?: string;
      institution?: string;
      role?: string;
    },
  ) {
    if (!body.draft?.trim()) return { reply: '' };
    return this.aiService.improveWhatsappDraft(body.draft, {
      clientName: body.clientName ?? '',
      institution: body.institution ?? '',
      role: body.role ?? '',
    });
  }

  @Post('whatsapp/summary')
  async summarizeWhatsapp(
    @Body()
    body: {
      clientName?: string;
      institution?: string;
      role?: string;
      city?: string;
      phone?: string;
      notes?: string[];
      messages?: { fromMe: boolean; body: string }[];
    },
  ) {
    return this.aiService.summarizeWhatsappConversation(body);
  }

  @Post('stream')
  async stream(@Body() dto: AiChatDto, @Res() res: Response) {
    if (!dto.message?.trim()) {
      res.status(400).json({ error: 'Mensaje vacío' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    };

    try {
      emit('start', { message: 'Procesando...' });
      await this.aiService.chatStream(
        dto.message,
        dto.history ?? [],
        dto.clientName ?? '',
        dto.colegio ?? '',
        dto.tipoSolicitud ?? '',
        dto.rol ?? 'estudiante',
        emit,
      );
    } catch (err: any) {
      emit('error', { message: err?.message ?? 'Error interno' });
    } finally {
      emit('end', { message: 'Listo' });
      res.end();
    }
  }

  @Post('feedback')
  async feedback(
    @Body() body: { sessionId: string; pregunta: string; util: boolean },
  ) {
    await this.aiLogs.actualizarFeedback(
      body.sessionId,
      body.pregunta,
      body.util,
    );
    return { ok: true };
  }

  @Get('models')
  async listModels() {
    const apiKey = this.aiService.getApiKey();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const data = await res.json();
    const models = (data.models ?? []).map((m: any) => ({
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      supportedGenerationMethods: m.supportedGenerationMethods,
    }));
    return { models };
  }
}
