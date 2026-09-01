import { BadRequestException, Controller, Post, Body, Logger } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { FaqModule } from '../faq/faq.module';
import { FaqService } from '../faq/faq.service';

@Controller('chat')
@SkipThrottle()
export class ChatEventsController {
  private readonly logger = new Logger(ChatEventsController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly faqService: FaqService,
  ) {}

  /** Registro público y ligero: el cliente reporta qué FAQ abrió durante su
   *  sesión de chat. La respuesta se resuelve en el servidor desde el catálogo
   *  para que el historial muestre la información real entregada.
   *
   *  Además del evento, se persisten en la sesión la pregunta del cliente y la
   *  respuesta de la IA (Asistente Virtual) para que el historial muestre la
   *  interacción completa cuando el cliente elige una pregunta frecuente del
   *  menú (que de otro modo ocurriría solo en memoria y no quedaría registrada).
   */
  @Post('eventos-faq')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async registrarFaqClic(
    @Body() body: { sessionId?: string; faqId?: number; fecha?: string; soloEvento?: boolean },
  ) {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const faqId = Number(body?.faqId);
    if (!sessionId || !Number.isInteger(faqId)) {
      throw new BadRequestException('sessionId y faqId son obligatorios');
    }
    const fecha = typeof body?.fecha === 'string' && body.fecha.trim() ? body.fecha.trim() : null;
    const soloEvento = body?.soloEvento === true;
    try {
      const faq = await this.faqService.findOne(faqId);
      if (!faq) return { ok: false };

      const yaExiste = await this.chatService.existeEventoFaq(sessionId, faqId);

      const evento = await this.chatService.registrarEvento(
        sessionId,
        'faq_clic',
        {
          faqId,
          pregunta: faq.pregunta,
          respuesta: faq.respuesta,
          categoria: faq.categoria ?? null,
        },
        fecha,
      );

      // En modo "soloEvento" se persiste únicamente el evento (formato chip),
      // sin burbujas de mensaje. En el resto de casos, si es la primera
      // interacción con este FAQ, se persisten la pregunta del cliente y la
      // respuesta del Asistente Virtual como mensajes reales para que el
      // historial muestre la interacción completa.
      if (!soloEvento && !yaExiste && faq.pregunta?.trim()) {
        await this.chatService.saveMessage(
          sessionId,
          faq.pregunta,
          'client',
          'Cliente',
        );
      }
      if (!soloEvento && !yaExiste && faq.respuesta?.trim()) {
        await this.chatService.saveMessage(
          sessionId,
          faq.respuesta,
          'advisor',
          'Asistente Virtual',
        );
      }

      this.chatGateway.emitirSessionEvento(sessionId, evento);
      return { ok: true };
    } catch (err: any) {
      // La sesión pudo cerrarse o no existir: el tracking nunca debe romper el chat.
      if (err?.message) {
        this.logger.debug(`[FAQ] sesión ${sessionId}: ${err.message}`);
      }
      return { ok: false };
    }
  }
}
