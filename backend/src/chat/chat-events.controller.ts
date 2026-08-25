import { BadRequestException, Controller, Post, Body } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { FaqModule } from '../faq/faq.module';
import { FaqService } from '../faq/faq.service';

@Controller('chat')
@SkipThrottle()
export class ChatEventsController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly faqService: FaqService,
  ) {}

  /** Registro público y ligero: el cliente reporta qué FAQ abrió durante su
   *  sesión de chat. La respuesta se resuelve en el servidor desde el catálogo
   *  para que el historial muestre la información real entregada. */
  @Post('eventos-faq')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async registrarFaqClic(
    @Body() body: { sessionId?: string; faqId?: number },
  ) {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const faqId = Number(body?.faqId);
    if (!sessionId || !Number.isInteger(faqId)) {
      throw new BadRequestException('sessionId y faqId son obligatorios');
    }
    try {
      const faq = await this.faqService.findOne(faqId);
      if (!faq) return { ok: false };
      const evento = await this.chatService.registrarEvento(
        sessionId,
        'faq_clic',
        {
          faqId,
          pregunta: faq.pregunta,
          respuesta: faq.respuesta,
          categoria: faq.categoria ?? null,
        },
      );
      this.chatGateway.emitirSessionEvento(sessionId, evento);
      return { ok: true };
    } catch {
      // La sesión pudo cerrarse o no existir: el tracking nunca debe romper el chat.
      return { ok: false };
    }
  }
}
