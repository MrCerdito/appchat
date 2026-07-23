import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TeamsToken } from './entities/teams-token.entity';
export interface TeamsMeetingInput {
    subject: string;
    startDateTime: string;
    durationMinutes?: number;
}
export interface TeamsMeetingResult {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    joinUrl: string;
}
export interface CalendarEventContact {
    name: string;
    role: string;
    institution: string;
    phone: string;
    email?: string;
}
export declare class TeamsMeetingsService {
    private readonly config;
    private readonly tokenRepo;
    private readonly logger;
    private readonly pendingAuth;
    private appAccessToken;
    private readonly scopes;
    constructor(config: ConfigService, tokenRepo: Repository<TeamsToken>);
    getStatus(advisorId: string): Promise<{
        connected: boolean;
        accountName: string | null | undefined;
    }>;
    createAuthUrl(advisorId: string): {
        authUrl: string;
    };
    completeAuth(code: string, state: string): Promise<string>;
    createMeeting(advisorId: string, input: TeamsMeetingInput): Promise<TeamsMeetingResult>;
    createCalendarEvent(advisorId: string, target: 'personal' | 'shared', meeting: TeamsMeetingResult, contact: CalendarEventContact): Promise<void>;
    private getAccessToken;
    private getAppAccessToken;
    private exchangeCode;
    private refreshAccessToken;
    private handleMicrosoftError;
    private normalizeTokenSet;
    private baseTokenBody;
    private addClientSecret;
    private accountNameFromIdToken;
    private cleanSubject;
    private escHtml;
    private clientId;
    private authority;
    private tokenUrl;
    private redirectUri;
    private randomToken;
    private base64Url;
    private cleanupPendingAuth;
}
