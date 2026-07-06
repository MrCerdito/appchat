import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { TeamsToken } from './entities/teams-token.entity';

interface PendingAuth {
  advisorId: string;
  codeVerifier: string;
  createdAt: number;
}

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

@Injectable()
export class TeamsMeetingsService {
  private readonly logger = new Logger(TeamsMeetingsService.name);
  private readonly pendingAuth = new Map<string, PendingAuth>();
  private appAccessToken: { token: string; expiresAt: number } | null = null;
  private readonly scopes = [
    'offline_access',
    'openid',
    'profile',
    'User.Read',
    'OnlineMeetings.ReadWrite',
    'Calendars.ReadWrite',
  ];

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TeamsToken)
    private readonly tokenRepo: Repository<TeamsToken>,
  ) {}

  async getStatus(advisorId: string) {
    const token = await this.tokenRepo.findOne({ where: { advisorId } });
    return {
      connected: !!token,
      accountName: token?.accountName,
    };
  }

  createAuthUrl(advisorId: string): { authUrl: string } {
    const clientId = this.clientId();
    const state = this.randomToken();
    const codeVerifier = this.randomToken(48);
    const codeChallenge = this.base64Url(
      createHash('sha256').update(codeVerifier).digest(),
    );

    this.pendingAuth.set(state, {
      advisorId,
      codeVerifier,
      createdAt: Date.now(),
    });
    this.cleanupPendingAuth();

    const url = new URL(`${this.authority()}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return { authUrl: url.toString() };
  }

  async completeAuth(code: string, state: string): Promise<string> {
    if (!code || !state) throw new BadRequestException('Autorizacion incompleta');
    const pending = this.pendingAuth.get(state);
    if (!pending) throw new BadRequestException('Sesion de Teams expirada');
    this.pendingAuth.delete(state);

    const tokenSet = await this.exchangeCode(code, pending.codeVerifier);
    await this.tokenRepo.upsert(
      {
        advisorId: pending.advisorId,
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        expiresAt: tokenSet.expiresAt,
        accountName: tokenSet.accountName,
      },
      ['advisorId'],
    );
    return pending.advisorId;
  }

  async createMeeting(
    advisorId: string,
    input: TeamsMeetingInput,
  ): Promise<TeamsMeetingResult> {
    const subject = this.cleanSubject(input.subject);
    const start = new Date(input.startDateTime);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Hora de reunion invalida');
    }

    const duration = Math.min(Math.max(input.durationMinutes ?? 30, 15), 240);
    const end = new Date(start.getTime() + duration * 60_000);
    const accessToken = await this.getAccessToken(advisorId);

    let data: any;
    try {
      const response = await axios.post(
        'https://graph.microsoft.com/v1.0/me/onlineMeetings',
        {
          subject,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept-Language': 'es-CO',
          },
        },
      );
      data = response.data;
    } catch (err: any) {
  this.handleMicrosoftError(err, 'crear reunion');
}
    const joinUrl = data?.joinWebUrl;
    if (!joinUrl) throw new BadRequestException('Teams no devolvio un enlace de reunion');

    return {
      subject,
      startDateTime: data.startDateTime ?? start.toISOString(),
      endDateTime: data.endDateTime ?? end.toISOString(),
      joinUrl,
    };
  }

  async createCalendarEvent(
    advisorId: string,
    target: 'personal' | 'shared',
    meeting: TeamsMeetingResult,
    contact: CalendarEventContact,
  ): Promise<void> {
    const accessToken = target === 'shared'
      ? await this.getAppAccessToken()
      : await this.getAccessToken(advisorId);

    const description = [
      `<b>Contacto:</b> ${this.escHtml(contact.name)}`,
      `<b>Cargo:</b> ${this.escHtml(contact.role)}`,
      `<b>Colegio:</b> ${this.escHtml(contact.institution)}`,
      `<b>Teléfono:</b> ${this.escHtml(contact.phone)}`,
    ];
    if (contact.email) {
      description.push(`<b>Email:</b> ${this.escHtml(contact.email)}`);
    }
    description.push(`<p><b>Enlace reunión Teams:</b> <a href="${this.escHtml(meeting.joinUrl)}">${this.escHtml(meeting.joinUrl)}</a></p>`);

    const eventBody = {
      subject: meeting.subject,
      start: {
        dateTime: meeting.startDateTime,
        timeZone: 'America/Bogota',
      },
      end: {
        dateTime: meeting.endDateTime,
        timeZone: 'America/Bogota',
      },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      body: {
        contentType: 'html',
        content: description.join('<br>'),
      },
      location: {
        displayName: 'Microsoft Teams',
      },
    };

    let url: string;
    if (target === 'personal') {
      url = 'https://graph.microsoft.com/v1.0/me/calendar/events';
    } else {
      const sharedMailbox = this.config.get<string>('TEAMS_SHARED_CALENDAR_ID');
      if (!sharedMailbox) {
        this.logger.warn('TEAMS_SHARED_CALENDAR_ID no configurado, saltando calendario compartido');
        return;
      }
      url = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(sharedMailbox)}/events`;
    }

    try {
      await axios.post(url, eventBody, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      this.handleMicrosoftError(err, `crear evento en calendario ${target}`);
    }
  }

  private async getAccessToken(advisorId: string): Promise<string> {
    const token = await this.tokenRepo.findOne({ where: { advisorId } });
    if (!token) throw new UnauthorizedException('Debes iniciar sesion en Teams');
    if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
    if (!token.refreshToken) {
      await this.tokenRepo.delete({ advisorId });
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    }

    try {
      const refreshed = await this.refreshAccessToken(token.refreshToken);
      await this.tokenRepo.update({ advisorId }, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        accountName: refreshed.accountName,
      });
      return refreshed.accessToken;
    } catch (err: any) {
      await this.tokenRepo.delete({ advisorId });
      this.logger.warn(`No se pudo refrescar Teams: ${err?.message ?? err}`);
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    }
  }

  private async getAppAccessToken(): Promise<string> {
    if (this.appAccessToken && this.appAccessToken.expiresAt > Date.now() + 60_000) {
      return this.appAccessToken.token;
    }

    const body = new URLSearchParams();
    body.set('client_id', this.clientId());
    body.set('client_secret', this.config.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'));
    body.set('scope', 'https://graph.microsoft.com/.default');
    body.set('grant_type', 'client_credentials');

    let data: any;
    try {
      const response = await axios.post(this.tokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      this.logger.warn(`Fallo client_credentials: ${err?.response?.status} ${err?.response?.data?.error || err?.message}`);
      throw new BadRequestException('Error al autenticar aplicacion con Microsoft.');
    }

    const expiresIn = Number(data?.expires_in ?? 3600);
    this.appAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    };
    return this.appAccessToken.token;
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<{
    accessToken: string; refreshToken: string; expiresAt: number; accountName?: string;
  }> {
    const body = this.baseTokenBody();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', this.redirectUri());
    body.set('code_verifier', codeVerifier);
    this.addClientSecret(body);

    let data: any;
    try {
      const response = await axios.post(this.tokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      this.handleMicrosoftError(err, 'conectar Teams');
    }
    return this.normalizeTokenSet(data);
  }

  private async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string; refreshToken: string; expiresAt: number; accountName?: string;
  }> {
    const body = this.baseTokenBody();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    this.addClientSecret(body);

    let data: any;
    try {
      const response = await axios.post(this.tokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      this.handleMicrosoftError(err, 'refrescar Teams');
    }
    return this.normalizeTokenSet(data, refreshToken);
  }

  private handleMicrosoftError(err: any, action: string): never {
  const status = (err as any)?.response?.status;
  const data = (err as any)?.response?.data;
    const code = typeof data?.error === 'string' ? data.error : typeof data?.code === 'string' ? data.code : JSON.stringify(data?.error ?? data?.code ?? '');
    this.logger.warn(`Microsoft raw error: ${JSON.stringify(data)}`);
    const description = data?.error_description || data?.message || err?.message || '';
    this.logger.warn(
      `Microsoft fallo al ${action}: status=${status ?? 'n/a'} code=${code || 'n/a'} detail=${description || 'n/a'}`,
    );

    if (status === 401 || code === 'invalid_client') {
      throw new BadRequestException(
        'Microsoft rechazo la conexion. Revisa MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y que el Redirect URI coincida exactamente en Azure.',
      );
    }

    if (code === 'invalid_grant') {
      throw new BadRequestException('La autorizacion de Microsoft expiro. Cierra esta ventana e intenta conectar de nuevo.');
    }

    if (status === 403) {
      if (action.includes('calendario')) {
        throw new BadRequestException('No tienes permisos para agendar en el calendario. Revisa el permiso Calendars.ReadWrite en Azure.');
      }
      throw new BadRequestException('La cuenta no tiene permisos para crear reuniones de Teams. Revisa el permiso OnlineMeetings.ReadWrite.');
    }

    throw new BadRequestException('No se pudo completar la operacion con Microsoft. Intenta nuevamente o revisa la configuracion.');
  }

  private normalizeTokenSet(data: any, fallbackRefreshToken = '') {
    const expiresIn = Number(data?.expires_in ?? 3600);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? fallbackRefreshToken,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
      accountName: this.accountNameFromIdToken(data.id_token),
    };
  }

  private baseTokenBody(): URLSearchParams {
    const body = new URLSearchParams();
    body.set('client_id', this.clientId());
    body.set('scope', this.scopes.join(' '));
    return body;
  }

  private addClientSecret(body: URLSearchParams): void {
    const secret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
    if (secret) body.set('client_secret', secret);
  }

  private accountNameFromIdToken(idToken?: string): string | undefined {
    if (!idToken) return undefined;
    try {
      const [, payload] = idToken.split('.');
      if (!payload) return undefined;
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return decoded.name || decoded.preferred_username || decoded.email;
    } catch {
      return undefined;
    }
  }

  private cleanSubject(value: string): string {
    const subject = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!subject) throw new BadRequestException('Nombre de reunion requerido');
    return subject;
  }

  private escHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private clientId(): string {
    const value = this.config.get<string>('MICROSOFT_CLIENT_ID');
    if (!value) throw new BadRequestException('Falta configurar MICROSOFT_CLIENT_ID');
    return value;
  }

  private authority(): string {
    const tenant = this.config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    return `https://login.microsoftonline.com/${tenant}`;
  }

  private tokenUrl(): string {
    return `${this.authority()}/oauth2/v2.0/token`;
  }

  private redirectUri(): string {
    const configured = this.config.get<string>('MICROSOFT_REDIRECT_URI');
    if (configured) return configured;
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3001';
    return `${appUrl}/advisors-whatsapp/teams/oauth/callback`;
  }

  private randomToken(bytes = 32): string {
    return this.base64Url(randomBytes(bytes));
  }

  private base64Url(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private cleanupPendingAuth(): void {
    const maxAge = 10 * 60_000;
    for (const [state, pending] of this.pendingAuth.entries()) {
      if (Date.now() - pending.createdAt > maxAge) this.pendingAuth.delete(state);
    }
  }
}
