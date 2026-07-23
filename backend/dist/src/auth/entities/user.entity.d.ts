import { Session } from '../../sessions/entities/session.entity';
export declare class User {
    id: string;
    name: string;
    email: string;
    password: string;
    role: string;
    active: boolean;
    createdAt: Date;
    status: string;
    activeChats: number;
    profilePhotoUrl: string | null;
    sessions: Session[];
    refreshToken: string | null;
}
