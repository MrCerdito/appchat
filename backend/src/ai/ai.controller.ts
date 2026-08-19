import { Controller, Post, Body, Get, Res, Req, UseGuards, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AiService } from './ai.service';
import { AiLogsService } from './ai-logs.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';

// Segundos que el cliente tiene para leer el mensaje final antes de cerrar la
// sesión por uso continuado de lenguaje ofensivo.
const SEGUNDOS_CIERRE_POR_OFENSAS = 6;

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiLogs: AiLogsService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
      dto.sessionId,
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
      context?: string;
      tone?: string;
      length?: 'short' | 'medium' | 'long';
    },
  ) {
    if (!body.draft?.trim()) return { replies: [] };
    return this.aiService.improveWhatsappDraft(body.draft, {
      clientName: body.clientName ?? '',
      institution: body.institution ?? '',
      role: body.role ?? '',
      context: body.context ?? '',
    }, body.tone ?? 'formal', body.length ?? 'medium');
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

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('stream')
  async stream(@Req() req: Request, @Body() dto: AiChatDto, @Res() res: Response) {
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
      if (res.writableEnded || res.destroyed || !res.writable) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      } catch {
        /* cliente desconectado */
      }
    };

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const sessionId = dto.sessionId?.trim() || undefined;
    let respuestaParcial = '';

    const onPartial = (texto: string) => {
      if (texto && texto.trim()) respuestaParcial = texto.trim();
    };

    try {
      emit('start', { message: 'Procesando...' });

      if (sessionId) {
        const history = (await this.chatService
          .getHistory(sessionId, 50)
          .catch(() => [])) as any[];

        const yaHayIa = history.some(
          (m: any) => m.senderName === 'Asistente Virtual',
        );
        if (!yaHayIa && dto.welcome?.trim()) {
          await this.persist(sessionId, () =>
            this.chatService.saveMessage(
              sessionId,
              dto.welcome!.trim(),
              'advisor',
              'Asistente Virtual',
            ),
          );
        }

        await this.persist(sessionId, () =>
          this.chatService.saveMessage(
            sessionId,
            dto.message,
            'client',
            dto.clientName || 'Cliente',
          ),
        );
      }

      const reply = await this.aiService.chatStream(
        dto.message,
        dto.history ?? [],
        dto.clientName ?? '',
        dto.colegio ?? '',
        dto.tipoSolicitud ?? '',
        dto.rol ?? 'estudiante',
        emit,
        sessionId,
        dto.welcome,
        abortController.signal,
        onPartial,
      );

      // Si contiene TRANSFER_TO_ADVISOR, no persistimos el mensaje literal al cliente en BD,
      // sino que gatillamos la transferencia limpia a un asesor.
      if (
        sessionId &&
        reply &&
        !reply.includes('TRANSFER_TO_ADVISOR')
      ) {
        const esTerminated = reply.includes('SESSION_TERMINATED');
        const limpio = reply
          .replace(/SESSION_TERMINATED/g, '')
          .replace(/\[FEEDBACK:(YES|NO)\]\s*$/, '')
          .trim();

        if (limpio) {
          await this.persist(sessionId, () =>
            this.chatService.saveMessage(
              sessionId,
              limpio,
              'advisor',
              'Asistente Virtual',
            ),
          );
        }

        if (esTerminated) {
          emit('session_terminated', {
            motivo: 'Uso continuado de lenguaje ofensivo',
          });
          setTimeout(() => {
            this.chatGateway.terminateAiSession(
              sessionId,
              'Uso continuado de lenguaje ofensivo',
            );
          }, SEGUNDOS_CIERRE_POR_OFENSAS * 1000);
        }
      }
    } catch (err: any) {
      // Si el stream se interrumpió a mitad, persistir la respuesta parcial
      // para que el historial y los otros canales (advisors) la conserven.
      if (sessionId && respuestaParcial) {
        const limpio = respuestaParcial
          .replace(/SESSION_TERMINATED/g, '')
          .replace(/\[FEEDBACK:(YES|NO)\]\s*$/, '')
          .trim();
        if (limpio) {
          await this.persist(sessionId, () =>
            this.chatService.saveMessage(
              sessionId,
              limpio,
              'advisor',
              'Asistente Virtual',
            ),
          );
        }
      }
      emit('error', { message: err?.message ?? 'Error interno' });
    } finally {
      if (!res.writableEnded && !res.destroyed) {
        emit('end', { message: 'Listo' });
        res.end();
      }
    }
  }

  private async persist<T>(sessionId: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const saved = await fn();
      if (saved) {
        this.chatGateway.emitMessageToSession(sessionId, saved);
        this.chatGateway.emitSessionUpdated(sessionId);
      }
      return saved;
    } catch (err: any) {
      this.logger.error(
        `[PersistIA] Sesión ${sessionId}: ${err?.message ?? 'error'}`,
      );
      return null;
    }
  }

  @Public()
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

  @Roles('admin')
  @Get('models')
  async listModels() {
    const apiKey = this.aiService.getApiKey();
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        headers: {
          'x-goog-api-key': apiKey,
        },
      },
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
