import { Session } from '../../sessions/entities/session.entity';
export declare class Message {
    id: string;
    content: string;
    senderType: string;
    senderName: string;
    createdAt: Date;
    readAt: Date | null;
    session: Session;
}
