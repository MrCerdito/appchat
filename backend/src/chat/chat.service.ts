import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { Session } from '../sessions/entities/session.entity';
import { sanitizeMessage, sanitizeSenderName } from '../common/security/sanitize.helper';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async saveMessage(
    sessionId: string,
    content: string,
    senderType: 'client' | 'advisor',
    senderName: string,
  ): Promise<Message> {
    const safeContent = sanitizeMessage(content);
    if (!safeContent) throw new BadRequestException('Mensaje vacio');
    const safeSenderName = sanitizeSenderName(senderName);
    const message = this.messageRepo.create({
      content: safeContent,
      senderType,
      senderName: safeSenderName,
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
}
