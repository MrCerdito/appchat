import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
export declare class ChatService {
    private readonly messageRepo;
    constructor(messageRepo: Repository<Message>);
    saveMessage(sessionId: string, content: string, senderType: 'client' | 'advisor', senderName: string): Promise<Message>;
    getHistory(sessionId: string, limit?: number): Promise<Message[]>;
    markAsRead(sessionId: string, senderType: string): Promise<void>;
}
