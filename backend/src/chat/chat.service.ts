import {
  BadRequestException,
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

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  // ── Schema (prod has synchronize off) ─────────────────────────────────────
  async onModuleInit(): Promise<void> {
    try {
      await this.messageRepo.query(
        `ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo asegurar la columna delivered_at: ${error.message}`,
      );
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
}
