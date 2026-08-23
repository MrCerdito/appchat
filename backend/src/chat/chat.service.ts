import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, Attachment } from './entities/message.entity';
import { Session } from '../sessions/entities/session.entity';
import {
  sanitizeMessage,
  sanitizeSenderName,
} from '../common/security/sanitize.helper';

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);
  private readonly EDIT_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  // ── Schema (prod has synchronize off) ─────────────────────────────────────
  async onModuleInit(): Promise<void> {
    const cols = ['delivered_at timestamptz', 'edited_at timestamptz'];
    for (const col of cols) {
      try {
        await this.messageRepo.query(
          `ALTER TABLE messages ADD COLUMN IF NOT EXISTS ${col}`,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo asegurar la columna ${col.split(' ')[0]}: ${error.message}`,
        );
      }
    }
  }

  async saveMessage(
    sessionId: string,
    content: string,
    senderType: 'client' | 'advisor',
    senderName: string,
    attachments?: Attachment[] | null,
  ): Promise<Message> {
    const safeContent = sanitizeMessage(content);
    if (!safeContent && (!attachments || attachments.length === 0)) {
      throw new BadRequestException('Mensaje vacio');
    }
    const safeSenderName = sanitizeSenderName(senderName);
    const message = this.messageRepo.create({
      content: safeContent || '',
      senderType,
      senderName: safeSenderName,
      attachments: attachments && attachments.length > 0 ? attachments : null,
      session: { id: sessionId } as Session,
    });
    return this.messageRepo.save(message);
  }

  async getHistory(sessionId: string, limit?: number): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return messages.reverse();
  }

  async markAsRead(sessionId: string, senderType: string): Promise<void> {
    await this.messageRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('sender_type = :senderType', { senderType })
      .andWhere('read_at IS NULL')
      .execute();
  }

  async markDelivered(sessionId: string, senderType: string): Promise<void> {
    await this.messageRepo
      .createQueryBuilder()
      .update()
      .set({ deliveredAt: new Date() })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('sender_type = :senderType', { senderType })
      .andWhere('delivered_at IS NULL')
      .execute();
  }

  async editMessage(
    messageId: string,
    sessionId: string,
    senderType: string,
    content: string,
  ): Promise<Message> {
    const msg = await this.messageRepo.findOne({
      where: { id: messageId, session: { id: sessionId } as any },
    });
    if (!msg) throw new BadRequestException('Mensaje no encontrado');
    if (msg.senderType !== senderType) {
      throw new ForbiddenException('Solo el autor puede editar');
    }
    if (msg.senderName === 'Sistema' || msg.senderName === 'Asistente Virtual') {
      throw new ForbiddenException('No se pueden editar mensajes del sistema');
    }
    const elapsed = Date.now() - new Date(msg.createdAt).getTime();
    if (elapsed > this.EDIT_WINDOW_MS) {
      throw new ForbiddenException('Ventana de edicion expirada (15 minutos)');
    }
    const safeContent = sanitizeMessage(content);
    if (!safeContent) throw new BadRequestException('Mensaje vacio');
    msg.content = safeContent;
    msg.editedAt = new Date();
    return this.messageRepo.save(msg);
  }
}
