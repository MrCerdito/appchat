"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TeamsMeetingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsMeetingsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const teams_token_entity_1 = require("./entities/teams-token.entity");
let TeamsMeetingsService = TeamsMeetingsService_1 = class TeamsMeetingsService {
    config;
    tokenRepo;
    logger = new common_1.Logger(TeamsMeetingsService_1.name);
    pendingAuth = new Map();
    appAccessToken = null;
    scopes = [
        'offline_access',
        'openid',
        'profile',
        'User.Read',
        'OnlineMeetings.ReadWrite',
        'Calendars.ReadWrite',
    ];
    constructor(config, tokenRepo) {
        this.config = config;
        this.tokenRepo = tokenRepo;
    }
    async getStatus(advisorId) {
        const token = await this.tokenRepo.findOne({ where: { advisorId } });
        return {
            connected: !!token,
            accountName: token?.accountName,
        };
    }
    createAuthUrl(advisorId) {
        const clientId = this.clientId();
        const state = this.randomToken();
        const codeVerifier = this.randomToken(48);
        const codeChallenge = this.base64Url((0, crypto_1.createHash)('sha256').update(codeVerifier).digest());
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
    async completeAuth(code, state) {
        if (!code || !state)
            throw new common_1.BadRequestException('Autorizacion incompleta');
        const pending = this.pendingAuth.get(state);
        if (!pending)
            throw new common_1.BadRequestException('Sesion de Teams expirada');
        this.pendingAuth.delete(state);
        const tokenSet = await this.exchangeCode(code, pending.codeVerifier);
        await this.tokenRepo.upsert({
            advisorId: pending.advisorId,
            accessToken: tokenSet.accessToken,
            refreshToken: tokenSet.refreshToken,
            expiresAt: tokenSet.expiresAt,
            accountName: tokenSet.accountName,
        }, ['advisorId']);
        return pending.advisorId;
    }
    async createMeeting(advisorId, input) {
        const subject = this.cleanSubject(input.subject);
        const start = new Date(input.startDateTime);
        if (Number.isNaN(start.getTime())) {
            throw new common_1.BadRequestException('Hora de reunion invalida');
        }
        const duration = Math.min(Math.max(input.durationMinutes ?? 30, 15), 240);
        const end = new Date(start.getTime() + duration * 60_000);
        const accessToken = await this.getAccessToken(advisorId);
        let data;
        try {
            const response = await axios_1.default.post('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
                subject,
                startDateTime: start.toISOString(),
                endDateTime: end.toISOString(),
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept-Language': 'es-CO',
                },
            });
            data = response.data;
        }
        catch (err) {
            this.handleMicrosoftError(err, 'crear reunion');
        }
        const joinUrl = data?.joinWebUrl;
        if (!joinUrl)
            throw new common_1.BadRequestException('Teams no devolvio un enlace de reunion');
        return {
            subject,
            startDateTime: data.startDateTime ?? start.toISOString(),
            endDateTime: data.endDateTime ?? end.toISOString(),
            joinUrl,
        };
    }
    async createCalendarEvent(advisorId, target, meeting, contact) {
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
        let url;
        if (target === 'personal') {
            url = 'https://graph.microsoft.com/v1.0/me/calendar/events';
        }
        else {
            const sharedMailbox = this.config.get('TEAMS_SHARED_CALENDAR_ID');
            if (!sharedMailbox) {
                this.logger.warn('TEAMS_SHARED_CALENDAR_ID no configurado, saltando calendario compartido');
                return;
            }
            url = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(sharedMailbox)}/events`;
        }
        try {
            await axios_1.default.post(url, eventBody, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (err) {
            this.handleMicrosoftError(err, `crear evento en calendario ${target}`);
        }
    }
    async getAccessToken(advisorId) {
        const token = await this.tokenRepo.findOne({ where: { advisorId } });
        if (!token)
            throw new common_1.UnauthorizedException('Debes iniciar sesion en Teams');
        if (token.expiresAt > Date.now() + 60_000)
            return token.accessToken;
        if (!token.refreshToken) {
            await this.tokenRepo.delete({ advisorId });
            throw new common_1.UnauthorizedException('Debes iniciar sesion en Teams');
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
        }
        catch (err) {
            await this.tokenRepo.delete({ advisorId });
            this.logger.warn(`No se pudo refrescar Teams: ${err?.message ?? err}`);
            throw new common_1.UnauthorizedException('Debes iniciar sesion en Teams');
        }
    }
    async getAppAccessToken() {
        if (this.appAccessToken &&
            this.appAccessToken.expiresAt > Date.now() + 60_000) {
            return this.appAccessToken.token;
        }
        const body = new URLSearchParams();
        body.set('client_id', this.clientId());
        body.set('client_secret', this.config.getOrThrow('MICROSOFT_CLIENT_SECRET'));
        body.set('scope', 'https://graph.microsoft.com/.default');
        body.set('grant_type', 'client_credentials');
        let data;
        try {
            const response = await axios_1.default.post(this.tokenUrl(), body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            data = response.data;
        }
        catch (err) {
            this.logger.warn(`Fallo client_credentials: ${err?.response?.status} ${err?.response?.data?.error || err?.message}`);
            throw new common_1.BadRequestException('Error al autenticar aplicacion con Microsoft.');
        }
        const expiresIn = Number(data?.expires_in ?? 3600);
        this.appAccessToken = {
            token: data.access_token,
            expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
        };
        return this.appAccessToken.token;
    }
    async exchangeCode(code, codeVerifier) {
        const body = this.baseTokenBody();
        body.set('grant_type', 'authorization_code');
        body.set('code', code);
        body.set('redirect_uri', this.redirectUri());
        body.set('code_verifier', codeVerifier);
        this.addClientSecret(body);
        let data;
        try {
            const response = await axios_1.default.post(this.tokenUrl(), body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            data = response.data;
        }
        catch (err) {
            this.handleMicrosoftError(err, 'conectar Teams');
        }
        return this.normalizeTokenSet(data);
    }
    async refreshAccessToken(refreshToken) {
        const body = this.baseTokenBody();
        body.set('grant_type', 'refresh_token');
        body.set('refresh_token', refreshToken);
        this.addClientSecret(body);
        let data;
        try {
            const response = await axios_1.default.post(this.tokenUrl(), body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            data = response.data;
        }
        catch (err) {
            this.handleMicrosoftError(err, 'refrescar Teams');
        }
        return this.normalizeTokenSet(data, refreshToken);
    }
    handleMicrosoftError(err, action) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const code = typeof data?.error === 'string'
            ? data.error
            : typeof data?.code === 'string'
                ? data.code
                : JSON.stringify(data?.error ?? data?.code ?? '');
        this.logger.warn(`Microsoft raw error: ${JSON.stringify(data)}`);
        const description = data?.error_description || data?.message || err?.message || '';
        this.logger.warn(`Microsoft fallo al ${action}: status=${status ?? 'n/a'} code=${code || 'n/a'} detail=${description || 'n/a'}`);
        if (status === 401 || code === 'invalid_client') {
            throw new common_1.BadRequestException('Microsoft rechazo la conexion. Revisa MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y que el Redirect URI coincida exactamente en Azure.');
        }
        if (code === 'invalid_grant') {
            throw new common_1.BadRequestException('La autorizacion de Microsoft expiro. Cierra esta ventana e intenta conectar de nuevo.');
        }
        if (status === 403) {
            if (action.includes('calendario')) {
                throw new common_1.BadRequestException('No tienes permisos para agendar en el calendario. Revisa el permiso Calendars.ReadWrite en Azure.');
            }
            throw new common_1.BadRequestException('La cuenta no tiene permisos para crear reuniones de Teams. Revisa el permiso OnlineMeetings.ReadWrite.');
        }
        throw new common_1.BadRequestException('No se pudo completar la operacion con Microsoft. Intenta nuevamente o revisa la configuracion.');
    }
    normalizeTokenSet(data, fallbackRefreshToken = '') {
        const expiresIn = Number(data?.expires_in ?? 3600);
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? fallbackRefreshToken,
            expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
            accountName: this.accountNameFromIdToken(data.id_token),
        };
    }
    baseTokenBody() {
        const body = new URLSearchParams();
        body.set('client_id', this.clientId());
        body.set('scope', this.scopes.join(' '));
        return body;
    }
    addClientSecret(body) {
        const secret = this.config.get('MICROSOFT_CLIENT_SECRET');
        if (secret)
            body.set('client_secret', secret);
    }
    accountNameFromIdToken(idToken) {
        if (!idToken)
            return undefined;
        try {
            const [, payload] = idToken.split('.');
            if (!payload)
                return undefined;
            const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            return decoded.name || decoded.preferred_username || decoded.email;
        }
        catch {
            return undefined;
        }
    }
    cleanSubject(value) {
        const subject = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!subject)
            throw new common_1.BadRequestException('Nombre de reunion requerido');
        return subject;
    }
    escHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    clientId() {
        const value = this.config.get('MICROSOFT_CLIENT_ID');
        if (!value)
            throw new common_1.BadRequestException('Falta configurar MICROSOFT_CLIENT_ID');
        return value;
    }
    authority() {
        const tenant = this.config.get('MICROSOFT_TENANT_ID') || 'common';
        return `https://login.microsoftonline.com/${tenant}`;
    }
    tokenUrl() {
        return `${this.authority()}/oauth2/v2.0/token`;
    }
    redirectUri() {
        const configured = this.config.get('MICROSOFT_REDIRECT_URI');
        if (configured)
            return configured;
        const appUrl = this.config.get('APP_URL') ?? 'http://localhost:3001';
        return `${appUrl}/advisors-whatsapp/teams/oauth/callback`;
    }
    randomToken(bytes = 32) {
        return this.base64Url((0, crypto_1.randomBytes)(bytes));
    }
    base64Url(buffer) {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }
    cleanupPendingAuth() {
        const maxAge = 10 * 60_000;
        for (const [state, pending] of this.pendingAuth.entries()) {
            if (Date.now() - pending.createdAt > maxAge)
                this.pendingAuth.delete(state);
        }
    }
};
exports.TeamsMeetingsService = TeamsMeetingsService;
exports.TeamsMeetingsService = TeamsMeetingsService = TeamsMeetingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(teams_token_entity_1.TeamsToken)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_2.Repository])
], TeamsMeetingsService);
//# sourceMappingURL=teams-meetings.service.js.map