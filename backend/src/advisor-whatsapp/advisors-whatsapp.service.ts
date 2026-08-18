import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
  proto,
  type WACallEvent,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import * as ExcelJS from 'exceljs';
import { InjectRepository } from '@nestjs/typeorm';
import QRCode from 'qrcode';
import { mkdir, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { Subject } from 'rxjs';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import {
  ConfiguracionService,
  HorarioEstado,
} from '../configuracion/configuracion.service';
import { RedisStateService } from '../common/redis/redis-state.service';
import {
  cleanText,
  sanitizeOutboundText,
  sanitizeFileName,
} from '../common/security/sanitize.helper';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import type {
  WhatsappAssignmentMode,
  WhatsappOperationalStatus,
} from './entities/whatsapp-chat.entity';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp-message.entity';

export interface IncomingWhatsappMessage {
  messageId: string;
  chatJid?: string;
  from: string;
  fromName: string;
  senderName?: string;
  advisorId?: string;
  participantJid?: string;
  isGroup?: boolean;
  type: string;
  text: string;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  reactionToMessageId?: string;
  replyToMessageId?: string;
  timestamp: string;
  phoneNumberId?: string;
  messageKey?: WAMessageKey;
  rawMessage?: WAMessage;
}

export type WhatsappMediaType =
  'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface WhatsappStatusUpdate {
  messageId: string;
  status: WhatsappMessageStatus;
  timestamp: string;
}

export interface WaMessageDto {
  id: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  timestamp: Date;
  status: WhatsappMessageStatus;
  isAuto: boolean;
  type: string;
  senderName?: string;
  advisorId?: string;
  participantJid?: string;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  editedAt?: Date;
  metaMessageId?: string;
  reactionToMessageId?: string;
  reactionByName?: string;
  reactionRemoved?: boolean;
  replyToMessageId?: string;
  quotedBody?: string;
  quotedSender?: string;
  isForwarded?: boolean;
}

export interface WaChatDto {
  id: string;
  name: string;
  role: string;
  institution: string;
  institutionUrl: string;
  city: string;
  avatar: string;
  phone: string;
  jid?: string;
  isGroup: boolean;
  email: string;
  plan: string;
  modules: string[];
  stage: string;
  stageIdx: number;
  tag: 'pendiente' | 'asignado' | 'cerrado';
  assignmentStatus: 'waiting' | 'active' | 'closed';
  operationalStatus: WhatsappOperationalStatus;
  operationalStatusLabel: string;
  assignmentMode?: WhatsappAssignmentMode;
  assignedTo?: string;
  assignedToName?: string;
  fixedAdvisorId?: string | null;
  fixedAdvisorName?: string | null;
  unread: number;
  preview: string;
  time: string;
  status: 'online' | 'away' | 'offline';
  notes: string[];
  quickReplies: Array<{ name: string; content: string }>;
  lastClientMsg: Date;
  clientWrote?: boolean;
  messages: WaMessageDto[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  slaState?: 'in_time' | 'por_vencer' | 'vencido';
  slaBreached?: boolean;
  slaMinutesWaiting?: number;
  slaWaitingSince?: string;
  slaDeadlineMinutes?: number;
  slaRemainingMinutes?: number;
  frozen?: boolean;
  frozenMinutes?: number;
  categoria?: string;
  categoriaLabel?: string;
}

export interface UpdateWhatsappContactInput {
  name?: string;
  role?: string;
  institution?: string;
  institutionUrl?: string | null;
  city?: string;
  phone?: string;
  email?: string | null;
  plan?: string;
  modules?: string[];
}

export interface AssignmentResult {
  advisorId: string;
  advisorName: string;
  chat: WaChatDto;
  autoMessage: WaMessageDto | null;
}

export interface WhatsappAdvisorStatsDto {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
  status: string;
  active: boolean;
  activeChats: number;
  closedChats: number;
  waitingCustomerChats: number;
  manualChats: number;
  fixedClients: number;
  avgResponseMinutes: number;
  idleMinutes: number;
  connectedMinutes: number;
  pauseMinutes: number;
  slaPercent: number;
  slaBreachedChats: number;
  frozenChats: number;
  lastActivity?: string;
}

export interface WhatsappAdminDashboardDto {
  summary: {
    totalChats: number;
    activeChats: number;
    queuedChats: number;
    waitingCustomerChats: number;
    waitingTechnicalChats: number;
    closedChats: number;
    fixedClients: number;
    manualChats: number;
    slaBreached: number;
    porVencer: number;
    frozenChats: number;
    avgResponseMinutes: number;
    slaCompliancePercent: number;
    slaComplianceDenominator: number;
    enGestion: number;
    esperandoRespuesta: number;
    soporteChats: number;
    closedToday: number;
    uniqueClientsToday: number;
  };
  advisors: WhatsappAdvisorStatsDto[];
  chats: WaChatDto[];
  alerts: {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    detail: string;
    chatId?: string;
    advisorId?: string;
    timestamp?: string;
  }[];
}

export interface WhatsappReportDataDto {
  from: string;
  to: string;
  granularity: string;
  summary: {
    chatsRecibidos: number;
    clientesUnicos: number;
    asignados: number;
    cerrados: number;
    mensajesTotales: number;
    mensajesAsesor: number;
    tiempoPromedioRespuestaMin: number;
    slaCumplimiento: number;
    slaDenominador: number;
  };
  series: Array<{
    periodo: string;
    recibidos: number;
    asignados: number;
    cerrados: number;
  }>;
  perAdvisor: Array<{
    id: string;
    name: string;
    chatsAsignados: number;
    cerrados: number;
    mensajesEnviados: number;
    promRespuestaMin: number;
  }>;
  porCategoria: Array<{ categoria: string; label: string; total: number }>;
  chats: Array<{
    id: string;
    name: string;
    phone: string;
    advisor: string;
    priority: string;
    categoria: string;
    estado: string;
    creado: string;
    cerrado: string | null;
    mensajes: number;
  }>;
}

export interface IncomingHandlingResult {
  chat: WaChatDto;
  message: WaMessageDto | null;
  assignedAdvisorId?: string;
  assignment?: AssignmentResult;
  queueMessage?: WaMessageDto | null;
  duplicate?: boolean;
}

export type WhatsappConnectionStatus =
  'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';

export interface WhatsappConnectionDto {
  status: WhatsappConnectionStatus;
  qr?: string;
  qrDataUrl?: string;
  connectedJid?: string;
  connectedName?: string;
  lastError?: string;
  updatedAt: string;
}

@Injectable()
export class AdvisorsWhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvisorsWhatsappService.name);
  private readonly removedReactionBody = '__reaction_removed__';
  private readonly maxActiveChatsPerAdvisor = 3;
  private readonly customerIdleReleaseMs = 3 * 60 * 1000;
  private readonly advisorIdleWarningMs = 5 * 60 * 1000;
  private readonly frozenChatWarningMs = 10 * 60 * 1000;
  private readonly slaMinutesByPriority: Record<string, number> = {
    critical: 1,
    high: 2,
    normal: 7,
    low: 10,
  };
  private sock: WASocket | null = null;
  private connectingPromise: Promise<WhatsappConnectionDto> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionStatus: WhatsappConnectionStatus = 'disconnected';
  private currentQr: string | null = null;
  private currentQrDataUrl: string | null = null;
  private connectedJid: string | null = null;
  private connectedName: string | null = null;
  private lastConnectionError = '';
  private connectionUpdatedAt = new Date();
  private readonly groupNameCache = new Map<string, string>();
  private readonly contactNameCache = new Map<string, string>();
  private readonly connectedAdvisorIds = new Set<string>();
  private readonly handledCallIds = new Set<string>();
  private readonly openChatByUser = new Map<string, string>();
  private socketId = 0;
  private connectionSequence = 0;
  private qrReceivedInSession = false;
  private reconnectAttempts = 0;
  private qrExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;

  readonly connectionUpdates$ = new Subject<WhatsappConnectionDto>();
  readonly incomingResults$ = new Subject<IncomingHandlingResult>();
  readonly messageStatusUpdates$ = new Subject<{
    advisorId?: string;
    message: WaMessageDto;
    chat: WaChatDto;
  }>();

  private readonly defaultAssignmentMessage =
    'Hola, soy {{advisor}}. Ya fui asignado a tu conversacion y revisare tu caso.';
  private readonly defaultQueueMessage =
    'Te encuentras en cola. En breves momentos un agente se comunicara contigo.';
  private readonly defaultOutOfHoursMessage =
    'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.';
  private readonly defaultCallUnavailableMessage =
    'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.';
  readonly defaultQuickReplies = [
    { name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
    {
      name: 'Espera',
      content: 'Dame un momento mientras valido la informacion.',
    },
    { name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
  ];
  private readonly maxTextLength = 4096;
  private readonly maxCaptionLength = 1024;
  private readonly maxMetadataLength = 500;
  private readonly allowedMediaMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/3gpp',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/opus',
    'audio/amr',
    'audio/webm',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/x-rar',
    'application/x-7z-compressed',
    'application/x-compressed',
  ]);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configuracionService: ConfiguracionService,
    private readonly redisState: RedisStateService,
  ) {
    this.logger.log('WhatsApp usara Baileys con sesion unica por QR.');
  }

  /** Máx. de ms que se espera a Baileys antes de liberar la asignación. */
  private readonly whatsappSendTimeoutMs = 8_000;

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private assignWaitQueue: Promise<unknown> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    await this.ensureWhatsappSchema();
    this.logger.log(
      'WhatsApp Baileys: iniciando conexion automatica al arranque del servidor.',
    );
    this.ensureBaileysConnection().catch((err) => {
      this.logger.warn(
        `No se pudo conectar WhatsApp al arranque: ${err?.message ?? err}. Se reintentara automaticamente.`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.sock
      ?.end(new Error('Aplicacion finalizada'))
      .catch(() => undefined);
    this.sock = null;
  }

  setConnectedAdvisorIds(ids: string[]): void {
    this.connectedAdvisorIds.clear();
    for (const id of ids) {
      if (id) this.connectedAdvisorIds.add(id);
    }
  }

  getConnectedAdvisorIds(): string[] {
    return [...this.connectedAdvisorIds];
  }

  async getConnectionStatus(): Promise<WhatsappConnectionDto> {
    if (
      this.connectionStatus === 'disconnected' ||
      this.connectionStatus === 'error'
    ) {
      this.setConnectionState('connecting');
      return this.ensureBaileysConnection();
    }
    return this.getConnectionDto();
  }

  async restartConnection(): Promise<WhatsappConnectionDto> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearQrExpiryTimer();
    this.connectingPromise = null;
    await this.sock
      ?.end(new Error('Reinicio manual de Baileys'))
      .catch(() => undefined);
    this.sock = null;
    this.currentQr = null;
    this.currentQrDataUrl = null;
    this.qrReceivedInSession = false;
    this.reconnectAttempts = 0;
    this.setConnectionState('connecting');
    return this.ensureBaileysConnection();
  }

  async logoutConnection(): Promise<WhatsappConnectionDto> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.sock
      ?.logout('Cierre manual desde InnovaCloud')
      .catch(() => undefined);
    await this.sock
      ?.end(new Error('Sesion de WhatsApp cerrada'))
      .catch(() => undefined);
    this.sock = null;
    this.qrReceivedInSession = false;
    await rm(this.baileysAuthDir(), { recursive: true, force: true }).catch(
      () => undefined,
    );
    this.connectedJid = null;
    this.connectedName = null;
    this.currentQr = null;
    this.currentQrDataUrl = null;
    this.setConnectionState(
      'disconnected',
      'Sesion cerrada. Vuelve a escanear el QR.',
    );
    return this.getConnectionDto();
  }

  private async ensureBaileysConnection(): Promise<WhatsappConnectionDto> {
    if (
      this.sock &&
      this.connectionStatus !== 'disconnected' &&
      this.connectionStatus !== 'error'
    ) {
      return this.getConnectionDto();
    }

    if (this.sock) {
      await this.sock
        .end(new Error('Reconectando Baileys'))
        .catch(() => undefined);
      this.sock = null;
    }

    if (this.connectingPromise) return this.connectingPromise;

    this.setConnectionState('connecting');
    this.connectingPromise = this.createBaileysSocket().finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  private async createBaileysSocket(): Promise<WhatsappConnectionDto> {
    this.setConnectionState('connecting');
    this.qrReceivedInSession = false;
    await mkdir(this.baileysAuthDir(), { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(
      this.baileysAuthDir(),
    );
    const currentSocketId = ++this.socketId;
    const proxyUrl = this.config.get<string>('WHATSAPP_PROXY_URL');
    const socketOptions: any = {
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      logger: pino({ level: 'info', name: 'baileys' }),
    };
    if (proxyUrl) {
      socketOptions.proxy = { url: proxyUrl };
      this.logger.log(`Baileys usando proxy: ${proxyUrl}`);
    }
    const sock = makeWASocket(socketOptions);

    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      this.handleBaileysConnectionUpdate(update, currentSocketId).catch(
        (err) => {
          this.logger.warn(
            `Error procesando estado de Baileys: ${err?.message ?? err}`,
          );
        },
      );
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      this.handleBaileysMessages(messages, type).catch((err) => {
        this.logger.warn(
          `Error procesando mensajes de Baileys: ${err?.message ?? err}`,
        );
      });
    });
    sock.ev.on('messages.update', (updates) => {
      this.handleBaileysMessageUpdates(updates).catch((err) => {
        this.logger.warn(
          `Error procesando estados de mensajes: ${err?.message ?? err}`,
        );
      });
    });
    sock.ev.on('call', (calls) => {
      this.handleBaileysCalls(calls).catch((err) => {
        this.logger.warn(
          `Error procesando llamada entrante: ${err?.message ?? err}`,
        );
      });
    });
    sock.ev.on('contacts.upsert', (contacts) =>
      contacts.forEach((contact) => this.rememberContact(contact)),
    );
    sock.ev.on('contacts.update', (contacts) =>
      contacts.forEach((contact) => this.rememberContact(contact)),
    );
    sock.ev.on('groups.upsert', (groups) => {
      groups.forEach((group) => {
        if (group.id && group.subject)
          this.groupNameCache.set(group.id, group.subject);
      });
    });
    sock.ev.on('groups.update', (groups) => {
      groups.forEach((group) => {
        if (group.id && group.subject)
          this.groupNameCache.set(group.id, group.subject);
      });
    });

    return this.getConnectionDto();
  }

  private async handleBaileysConnectionUpdate(
    update: Partial<proto.IWebMessageInfo> & any,
    sourceSocketId?: number,
  ): Promise<void> {
    if (sourceSocketId !== undefined && sourceSocketId !== this.socketId) {
      this.logger.debug(
        `Ignorando evento de socket viejo #${sourceSocketId} (actual: #${this.socketId})`,
      );
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (qr === this.currentQr) return;
      this.clearQrExpiryTimer();
      this.qrReceivedInSession = true;
      this.currentQr = qr;
      this.currentQrDataUrl = await QRCode.toDataURL(qr, {
        margin: 1,
        width: 500,
        color: { dark: '#0b1219', light: '#ffffff' },
      });
      this.setConnectionState('qr');
      this.qrExpiryTimer = setTimeout(() => {
        if (
          this.connectionStatus === 'qr' ||
          this.connectionStatus === 'connecting'
        ) {
          this.currentQr = null;
          this.currentQrDataUrl = null;
          this.logger.log('QR expirado. Solicitando nuevo codigo...');
          this.connectingPromise = null;
          this.sock?.end(new Error('QR expirado')).catch(() => undefined);
          this.sock = null;
          this.qrReceivedInSession = false;
          this.reconnectAttempts = 0;
          this.ensureBaileysConnection().catch((err) => {
            this.logger.warn(`Error al regenerar QR: ${err?.message ?? err}`);
          });
        }
      }, 55_000);
    }

    if (connection === 'connecting' && this.connectionStatus === 'connecting') {
      return;
    }
    if (connection === 'connecting') {
      this.setConnectionState('connecting');
    }

    if (connection === 'open') {
      this.clearQrExpiryTimer();
      this.currentQr = null;
      this.currentQrDataUrl = null;
      this.reconnectAttempts = 0;
      this.connectedJid = this.sock?.user?.id
        ? jidNormalizedUser(this.sock.user.id)
        : null;
      this.connectedName =
        this.sock?.user?.name ??
        (this.sock?.user as any)?.verifiedName ??
        'WhatsApp';
      this.setConnectionState('connected');
      this.logger.log(
        `Baileys conectado como ${this.connectedName ?? this.connectedJid ?? 'WhatsApp'}`,
      );
    }

    if (connection === 'close') {
      this.clearQrExpiryTimer();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message ?? 'Conexion cerrada';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      this.sock = null;
      this.currentQr = null;
      this.currentQrDataUrl = null;

      this.setConnectionState('disconnected', reason);
      if (shouldReconnect) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (
      this.reconnectAttempts >= AdvisorsWhatsappService.MAX_RECONNECT_ATTEMPTS
    ) {
      this.logger.warn(
        `Baileys: maximo ${AdvisorsWhatsappService.MAX_RECONNECT_ATTEMPTS} intentos de reconexión alcanzados. Conecte manualmente desde el panel.`,
      );
      this.setConnectionState(
        'error',
        'Maximos intentos de reconexion alcanzados. Conecte manualmente.',
      );
      return;
    }
    const delay = Math.min(3_000 * 2 ** this.reconnectAttempts, 60_000);
    this.reconnectAttempts++;
    this.logger.log(
      `Reconexion programada en ${delay / 1000}s (intento #${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureBaileysConnection().catch((err) => {
        this.logger.warn(`Reconexion Baileys fallida: ${err?.message ?? err}`);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearQrExpiryTimer(): void {
    if (this.qrExpiryTimer) {
      clearTimeout(this.qrExpiryTimer);
      this.qrExpiryTimer = null;
    }
  }

  private setConnectionState(
    status: WhatsappConnectionStatus,
    error = '',
  ): void {
    this.connectionStatus = status;
    this.lastConnectionError = error;
    this.connectionUpdatedAt = new Date();
    this.connectionUpdates$.next({
      ...this.getConnectionDto(),
      sequence: ++this.connectionSequence,
    } as any);
  }

  private getConnectionDto(): WhatsappConnectionDto {
    const showQr = this.connectionStatus === 'qr';
    return {
      status: this.connectionStatus,
      qr: showQr ? (this.currentQr ?? undefined) : undefined,
      qrDataUrl: showQr ? (this.currentQrDataUrl ?? undefined) : undefined,
      connectedJid: this.connectedJid ?? undefined,
      connectedName: this.connectedName ?? undefined,
      lastError: this.lastConnectionError || undefined,
      updatedAt: this.connectionUpdatedAt.toISOString(),
    };
  }

  private baileysAuthDir(): string {
    return (
      this.config.get<string>('WHATSAPP_SESSION_DIR') ||
      join(process.cwd(), '.session', 'baileys-auth')
    );
  }

  private async ensureWhatsappSchema(): Promise<void> {
    await this.chatRepo.query(`
      ALTER TABLE IF EXISTS public.whatsapp_chats
        ALTER COLUMN phone TYPE varchar(100),
        ADD COLUMN IF NOT EXISTS jid varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS profile_picture_url text NULL,
        ADD COLUMN IF NOT EXISTS operational_status varchar(30) NOT NULL DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS operational_status_updated_at timestamp NULL,
        ADD COLUMN IF NOT EXISTS assignment_mode varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS fixed_advisor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL
    `);
    await this.chatRepo.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_chats_jid_unique
      ON public.whatsapp_chats(jid)
      WHERE jid IS NOT NULL
    `);
    await this.messageRepo.query(`
      ALTER TABLE IF EXISTS public.whatsapp_messages
        ADD COLUMN IF NOT EXISTS participant_jid varchar(100) NULL
    `);
    await this.messageRepo.query(`
      ALTER TABLE IF EXISTS public.whatsapp_messages
        ADD COLUMN IF NOT EXISTS reply_to_message_id varchar(255) NULL
    `);
    await this.chatRepo.query(`
      ALTER TABLE IF EXISTS public.whatsapp_chats
        ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'normal'
    `);
    await this.chatRepo.query(`
      ALTER TABLE IF EXISTS public.whatsapp_chats
        ADD COLUMN IF NOT EXISTS closed_at timestamp NULL
    `);
  }

  async handleIncomingMessage(
    raw: IncomingWhatsappMessage,
    connectedAdvisorIds: string[],
  ): Promise<IncomingHandlingResult> {
    const duplicate = await this.messageRepo.findOne({
      where: { metaMessageId: raw.messageId },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (duplicate) {
      return {
        chat: await this.toChatDto(duplicate.chat, true),
        message: this.toMessageDto(duplicate),
        assignedAdvisorId: duplicate.chat.assignedAdvisor?.id,
        duplicate: true,
      };
    }

    let chat = await this.findOrCreateChatForRaw(raw);
    const isGroup = !!raw.isGroup;

    const assignmentExpired =
      !isGroup &&
      chat.status === 'active' &&
      this.isWindowExpired(chat.lastClientMessageAt);

    chat.name = raw.fromName || chat.name || chat.phone;
    if (raw.chatJid && !chat.jid) chat.jid = this.normalizeJid(raw.chatJid);
    chat.isGroup = isGroup;
    this.refreshProfilePicture(chat);
    if (isGroup) {
      chat.role = 'Grupo WhatsApp';
      chat.institution = 'Grupo';
      chat.status = 'active';
      chat.operationalStatus = 'in_progress';
      if (!chat.assignedAdvisor) {
        chat.assignedAdvisor = null;
        chat.assignedAt = null;
        chat.assignmentMode = null;
      }
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
    }
    if (raw.type !== 'reaction') {
      chat.lastMessageAt = new Date();
      chat.lastClientMessageAt = new Date(raw.timestamp || Date.now());
      const chatOpen = [...this.openChatByUser.values()].includes(chat.id);
      if (!chatOpen) chat.unreadCount = (chat.unreadCount ?? 0) + 1;
    }

    if (!isGroup && (chat.status === 'closed' || assignmentExpired)) {
      chat.status = 'waiting';
      chat.operationalStatus = 'new';
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
    }

    chat = await this.chatRepo.save(chat);
    this.refreshProfilePicture(chat);

    let savedMessage: WhatsappMessage;
    try {
      savedMessage =
        raw.type === 'reaction'
          ? await this.saveReactionMessage(chat, raw, false)
          : await this.messageRepo.save(
              this.messageRepo.create({
                chat,
                metaMessageId: raw.messageId,
                body: this.messageBody(raw),
                fromMe: false,
                senderName: raw.senderName || chat.name,
                participantJid: raw.participantJid ?? null,
                status: 'delivered',
                isAuto: false,
                type: raw.type || 'text',
                mediaId: raw.mediaId ?? null,
                mimeType: raw.mimeType ?? null,
                fileName: raw.fileName ?? null,
                replyToMessageId: raw.replyToMessageId ?? null,
              }),
            );
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const existing = await this.messageRepo.findOne({
        where: { metaMessageId: raw.messageId },
        relations: ['chat', 'chat.assignedAdvisor'],
      });
      if (!existing) throw err;
      return {
        chat: await this.toChatDto(existing.chat, true),
        message: await this.toMessageDtoWithQuote(existing),
        assignedAdvisorId: existing.chat.assignedAdvisor?.id,
      };
    }

    savedMessage = await this.attachIncomingMedia(savedMessage, raw);

    if (isGroup) {
      let assignedAdvisorId: string | undefined = chat.assignedAdvisor?.id;
      if (!assignedAdvisorId && chat.fixedAdvisor) {
        const fixedAdvisor = await this.findFixedAdvisorIfAvailable(
          chat,
          connectedAdvisorIds,
        );
        if (fixedAdvisor) {
          chat.assignedAdvisor = fixedAdvisor;
          chat.assignedAt = new Date();
          chat.assignmentMode = 'fixed';
          chat = await this.chatRepo.save(chat);
          assignedAdvisorId = fixedAdvisor.id;
        }
      }
      return {
        chat: await this.toChatDto(chat, true),
        message: await this.toMessageDtoWithQuote(savedMessage),
        assignedAdvisorId,
      };
    }

    const horarioEstado = await this.configuracionService.getHorarioEstado();
    if (!horarioEstado.enJornada) {
      const outOfHoursMessage = await this.sendOutOfHoursNoticeIfNeeded(
        chat.id,
        horarioEstado,
      );
      const pausedChat = await this.findChatOrFail(chat.id);
      return {
        chat: await this.toChatDto(pausedChat, true),
        message: await this.toMessageDtoWithQuote(savedMessage),
        queueMessage: outOfHoursMessage
          ? this.toMessageDto(outOfHoursMessage)
          : null,
      };
    }

    if (chat.outOfHoursNoticeSent) {
      chat.outOfHoursNoticeSent = false;
      await this.chatRepo.save(chat);
    }

    if (chat.status === 'active' && chat.assignedAdvisor?.id) {
      const assignedAdvisorId = chat.assignedAdvisor.id;
      if (chat.operationalStatus === 'assigned') {
        chat.operationalStatus = 'in_progress';
        chat = await this.chatRepo.save(chat);
      }
      return {
        chat: await this.toChatDto(chat, true),
        message: await this.toMessageDtoWithQuote(savedMessage),
        assignedAdvisorId,
      };
    }

    const assignment = await this.assignChatIfPossible(
      chat.id,
      connectedAdvisorIds,
    );
    if (assignment) {
      return {
        chat: assignment.chat,
        message: await this.toMessageDtoWithQuote(savedMessage),
        assignment,
      };
    }

    const queueMessage = await this.sendQueueNoticeIfNeeded(chat.id);
    const queuedChat = await this.findChatOrFail(chat.id);

    return {
      chat: await this.toChatDto(queuedChat, true),
      message: await this.toMessageDtoWithQuote(savedMessage),
      queueMessage: queueMessage ? this.toMessageDto(queueMessage) : null,
    };
  }

  async assignWaitingChats(
    connectedAdvisorIds: string[],
  ): Promise<AssignmentResult[]> {
    const run = this.assignWaitQueue.then(() =>
      this.assignWaitingChatsInner(connectedAdvisorIds),
    );
    this.assignWaitQueue = run.catch(() => undefined);
    return run;
  }

  private async assignWaitingChatsInner(
    connectedAdvisorIds: string[],
  ): Promise<AssignmentResult[]> {
    const assignments: AssignmentResult[] = [];
    const horarioEstado = await this.configuracionService.getHorarioEstado();
    if (!horarioEstado.enJornada) return assignments;

    await this.releaseExpiredActiveChats();
    await this.releaseFixedChatsForInactiveAdvisors();

    // 1. Asignar primero los chats con advisor fijo (solo su advisor puede tomarlos)
    const fixedChats = await this.chatRepo.find({
      where: {
        status: 'waiting',
        isGroup: false,
        operationalStatus: In(['new', 'queued']) as any,
        fixedAdvisor: Not(IsNull()),
      },
      order: { lastMessageAt: 'ASC' },
      relations: ['assignedAdvisor', 'fixedAdvisor'],
    });
    fixedChats.sort(this.byPriorityThenFifo);

    for (const chat of fixedChats) {
      const assignment = await this.assignChatIfPossible(
        chat.id,
        connectedAdvisorIds,
      );
      if (assignment) assignments.push(assignment);
    }

    // 2. Asignar el resto de chats en espera (sin asesor fijo)
    //    por prioridad/SLA y luego FIFO
    while (true) {
      const advisor = await this.findAvailableAdvisor(connectedAdvisorIds);
      if (!advisor) break;

      const waitingChats = await this.chatRepo.find({
        where: {
          status: 'waiting',
          isGroup: false,
          operationalStatus: In(['new', 'queued']) as any,
          fixedAdvisor: IsNull(),
        },
        order: { lastMessageAt: 'ASC' },
        relations: ['assignedAdvisor'],
      });
      if (!waitingChats.length) break;
      waitingChats.sort(this.byPriorityThenFifo);
      const chat = waitingChats[0];

      const assignment = await this.assignChatToAdvisor(chat, advisor);
      if (assignment) assignments.push(assignment);
    }

    return assignments;
  }

  async takeQueuedChat(
    chatId: string,
    advisorId: string,
    role: string,
  ): Promise<AssignmentResult> {
    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    if (!advisor || !advisor.active) {
      throw new ForbiddenException('No puedes tomar chats con este usuario');
    }

    if (advisor.role !== 'advisor' && advisor.role !== 'admin') {
      throw new ForbiddenException(
        'Solo un agente o administrador puede tomar chats de la cola',
      );
    }

    if (role !== 'admin') {
      const [enAlmuerzo, enAlmuerzoRedis] = await Promise.all([
        this.configuracionService.estaEnAlmuerzo(advisor.id).catch(() => false),
        this.redisState.isOnLunch(advisor.id).catch(() => false),
      ]);
      if (enAlmuerzo || enAlmuerzoRedis) {
        throw new ForbiddenException(
          'No puedes tomar chats mientras estas en almuerzo',
        );
      }
    }

    if (role !== 'admin') {
      const chatCheck = await this.chatRepo.findOne({
        where: { id: chatId },
        relations: ['fixedAdvisor'],
      });
      if (chatCheck?.fixedAdvisor) {
        throw new ForbiddenException(
          'Este chat tiene un agente fijo asignado. Solo un administrador puede reasignarlo.',
        );
      }
    }

    const assignedChatId = await this.chatRepo.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(WhatsappChat);
        const chat = await repo
          .createQueryBuilder('chat')
          .where('chat.id = :chatId', { chatId })
          .andWhere('chat.status = :status', { status: 'waiting' })
          .andWhere('chat.is_group = false')
          .setLock('pessimistic_write')
          .getOne();

        if (!chat) throw new ConflictException('Este chat ya no esta en cola');

        chat.status = 'active';
        chat.operationalStatus = 'in_progress';
        chat.assignedAdvisor = advisor;
        chat.assignedAt = new Date();
        chat.assignmentMode = role === 'admin' ? 'admin' : 'manual';
        chat.queueNoticeSent = false;
        chat.outOfHoursNoticeSent = false;
        const saved = await repo.save(chat);
        return saved.id;
      },
    );

    return this.finishChatAssignment(assignedChatId, advisor);
  }

  async reassignChatsForDisconnectedAdvisor(
    advisorId: string,
    connectedAdvisorIds: string[],
  ): Promise<AssignmentResult[]> {
    const activeChats = await this.chatRepo.find({
      where: {
        status: 'active',
        assignedAdvisor: { id: advisorId },
        isGroup: false,
      },
      relations: ['assignedAdvisor'],
    });

    const results: AssignmentResult[] = [];
    for (const chat of activeChats) {
      chat.status = 'waiting';
      chat.operationalStatus = 'queued';
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
      await this.chatRepo.save(chat);

      const assignment = await this.assignChatIfPossible(
        chat.id,
        connectedAdvisorIds,
      );
      if (assignment) results.push(assignment);
    }

    return results;
  }

  async getChatById(id: string): Promise<WhatsappChat> {
    const chat = await this.chatRepo.findOne({ where: { id } });
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');
    return chat;
  }

  async listChats(
    advisorId: string,
    role: string,
    page?: number,
    limit?: number,
  ): Promise<
    WaChatDto[] | { chats: WaChatDto[]; total: number; hasMore: boolean }
  > {
    const qb = this.chatRepo
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.assignedAdvisor', 'advisor')
      .leftJoinAndSelect('chat.fixedAdvisor', 'fixedAdvisor')
      .orderBy('chat.lastMessageAt', 'DESC');

    // Restricción por asesor: cada asesor ve sus chats asignados/fijos y la cola
    // (chats sin asesor). Los admins ven todos los chats.
    if (role !== 'admin') {
      qb.andWhere(
        '(advisor.id = :advisorId OR fixedAdvisor.id = :advisorId OR advisor.id IS NULL)',
        { advisorId },
      );
    }

    const isPaginated = page !== undefined && limit !== undefined;

    if (isPaginated) {
      const total = await qb.getCount();
      const chats = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      if (!chats.length) {
        return { chats: [], total, hasMore: false };
      }

      const chatIds = chats.map((c) => c.id);
      const allMessages = await this.messageRepo
        .createQueryBuilder('msg')
        .leftJoinAndSelect('msg.chat', 'chat')
        .leftJoinAndSelect('msg.advisor', 'advisor')
        .where('msg.chat_id IN (:...chatIds)', { chatIds })
        .orderBy('msg.created_at', 'ASC')
        .getMany();

      const messagesByChat = new Map<string, WhatsappMessage[]>();
      for (const msg of allMessages) {
        const list = messagesByChat.get(msg.chat.id) ?? [];
        list.push(msg);
        messagesByChat.set(msg.chat.id, list);
      }

      const quickReplies = await this.getQuickReplyTexts();
      const dtos = chats.map((chat) =>
        this.toChatDtoWithPreload(
          chat,
          messagesByChat.get(chat.id) ?? [],
          quickReplies,
        ),
      );

      return {
        chats: dtos,
        total,
        hasMore: page * limit < total,
      };
    }

    const chats = await qb.getMany();
    if (!chats.length) return [];

    const chatIds = chats.map((c) => c.id);
    const allMessages = await this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.chat', 'chat')
      .leftJoinAndSelect('msg.advisor', 'advisor')
      .where('msg.chat_id IN (:...chatIds)', { chatIds })
      .orderBy('msg.created_at', 'ASC')
      .getMany();

    const messagesByChat = new Map<string, WhatsappMessage[]>();
    for (const msg of allMessages) {
      const list = messagesByChat.get(msg.chat.id) ?? [];
      list.push(msg);
      messagesByChat.set(msg.chat.id, list);
    }

    const quickReplies = await this.getQuickReplyTexts();
    return chats.map((chat) =>
      this.toChatDtoWithPreload(
        chat,
        messagesByChat.get(chat.id) ?? [],
        quickReplies,
      ),
    );
  }

  async getUnreadTotal(
    advisorId: string,
    role: string,
  ): Promise<{ total: number }> {
    const qb = this.chatRepo
      .createQueryBuilder('chat')
      .leftJoin('chat.assignedAdvisor', 'advisor')
      .leftJoin('chat.fixedAdvisor', 'fixedAdvisor');

    // Mismo scope que listChats: chats asignados/fijos y la cola sin asesor.
    if (role !== 'admin') {
      qb.andWhere(
        '(advisor.id = :advisorId OR fixedAdvisor.id = :advisorId OR advisor.id IS NULL)',
        { advisorId },
      );
    }

    const row = await qb
      .select('COALESCE(SUM(chat.unread_count), 0)', 'total')
      .getRawOne();

    return { total: Number(row?.total ?? 0) };
  }

  async getAdminDashboard(role: string): Promise<WhatsappAdminDashboardDto> {
    this.assertAdminRole(role);
    await this.releaseExpiredActiveChats();

    const chats = await this.chatRepo.find({
      relations: ['assignedAdvisor', 'fixedAdvisor'],
      order: { lastMessageAt: 'DESC' },
    });
    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      order: { name: 'ASC' },
    });
    const messages = await this.messageRepo.find({
      relations: ['chat', 'advisor'],
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    const advisorStats = advisors.map((advisor) =>
      this.buildAdvisorStats(advisor, chats, messages),
    );
    const alerts = this.buildAdminAlerts(chats, advisorStats, messages);
    const quickReplies = await this.getQuickReplyTexts();
    const dtoChats = chats.map((chat) =>
      this.toChatDtoWithPreload(chat, [], quickReplies),
    );

    const avgResponseMinutes = advisorStats.length
      ? Math.round(
          advisorStats.reduce((sum, a) => sum + a.avgResponseMinutes, 0) /
            advisorStats.length,
        )
      : 0;
    const activeNonGroup = chats.filter(
      (chat) => chat.status === 'active' && !chat.isGroup,
    ).length;
    const slaScopeChats = chats.filter(
      (chat) =>
        chat.status === 'active' &&
        !chat.isGroup &&
        chat.operationalStatus !== 'waiting_customer' &&
        chat.operationalStatus !== 'waiting_technical' &&
        chat.operationalStatus !== 'resolved',
    );
    const slaBreached = chats.filter(
      (chat) => !chat.isGroup && this.isSlaBreached(chat, messages),
    ).length;
    const porVencer = chats.filter(
      (chat) =>
        !chat.isGroup &&
        chat.status === 'active' &&
        this.computeChatSla(chat, messages).slaState === 'por_vencer',
    ).length;
    const frozenChats = chats.filter(
      (chat) =>
        chat.status === 'active' &&
        this.computeChatSla(chat, messages).frozen,
    ).length;
    const slaComplianceDenominator = slaScopeChats.length;
    const slaCompliancePercent = slaComplianceDenominator
      ? Math.max(
          0,
          Math.round(
            ((slaComplianceDenominator - slaBreached) /
              slaComplianceDenominator) *
              100,
          ),
        )
      : 100;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const closedToday = chats.filter(
      (chat) => chat.status === 'closed' && chat.updatedAt >= startOfToday,
    ).length;
    const todayClientChatIds = new Set(
      messages
        .filter((m) => !m.fromMe && m.createdAt >= startOfToday)
        .map((m) => m.chat?.id)
        .filter(Boolean),
    );
    const uniqueClientsToday = todayClientChatIds.size;

    const summary = {
      totalChats: chats.length,
      activeChats: chats.filter(
        (chat) => chat.status === 'active' && !chat.isGroup,
      ).length,
      queuedChats: chats.filter(
        (chat) =>
          chat.status === 'waiting' &&
          chat.operationalStatus !== 'waiting_customer' &&
          !chat.fixedAdvisor &&
          !!chat.lastClientMessageAt,
      ).length,
      waitingCustomerChats: chats.filter(
        (chat) => chat.operationalStatus === 'waiting_customer',
      ).length,
      waitingTechnicalChats: chats.filter(
        (chat) => chat.operationalStatus === 'waiting_technical',
      ).length,
      closedChats: chats.filter((chat) => chat.status === 'closed').length,
      fixedClients: chats.filter((chat) => !!chat.fixedAdvisor).length,
      manualChats: chats.filter(
        (chat) =>
          chat.assignmentMode === 'manual' || chat.assignmentMode === 'admin',
      ).length,
      slaBreached,
      porVencer,
      frozenChats: frozenChats,
      avgResponseMinutes,
      slaCompliancePercent,
      slaComplianceDenominator,
      enGestion: chats.filter(
        (chat) =>
          chat.status === 'active' &&
          !chat.isGroup &&
          this.computeChatSla(chat, messages).categoria === 'gestion',
      ).length,
      esperandoRespuesta: chats.filter(
        (chat) =>
          chat.status === 'active' &&
          !chat.isGroup &&
          this.computeChatSla(chat, messages).categoria ===
            'espera_respuesta',
      ).length,
      soporteChats: chats.filter(
        (chat) => chat.operationalStatus === 'waiting_technical',
      ).length,
      closedToday,
      uniqueClientsToday,
    };

    return {
      summary,
      advisors: advisorStats,
      chats: dtoChats,
      alerts,
    };
  }

  async generateReport(role: string, from?: string, to?: string): Promise<Buffer> {
    this.assertAdminRole(role);
    await this.releaseExpiredActiveChats();

    const fromDate = from && !isNaN(new Date(from).getTime()) ? new Date(from) : null;
    const toDate = to && !isNaN(new Date(to).getTime()) ? new Date(to) : null;
    const toEnd = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : null;

    const chats = await this.chatRepo.find({
      relations: ['assignedAdvisor', 'fixedAdvisor'],
      order: { lastMessageAt: 'DESC' },
    });
    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      order: { name: 'ASC' },
    });
    const messages = await this.messageRepo.find({
      relations: ['chat', 'advisor'],
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    const inRange = (chat: WhatsappChat): boolean => {
      if (!fromDate && !toEnd) return true;
      const t = new Date(chat.createdAt).getTime();
      if (fromDate && t < fromDate.getTime()) return false;
      if (toEnd && t >= toEnd.getTime()) return false;
      return true;
    };
    const rangeChats = chats.filter(inRange);

    const slaBreached = chats.filter(
      (chat) => !chat.isGroup && this.isSlaBreached(chat, messages),
    );
    const porVencer = chats.filter(
      (chat) =>
        !chat.isGroup &&
        chat.status === 'active' &&
        this.computeChatSla(chat, messages).slaState === 'por_vencer',
    );
    const frozen = chats.filter(
      (chat) =>
        chat.status === 'active' && this.computeChatSla(chat, messages).frozen,
    );

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const closedToday = chats.filter(
      (chat) => chat.status === 'closed' && chat.updatedAt >= startOfToday,
    ).length;
    const uniqueClientsToday = new Set(
      messages
        .filter((m) => !m.fromMe && m.createdAt >= startOfToday)
        .map((m) => m.chat?.id)
        .filter(Boolean),
    ).size;

    const workbook = new ExcelJS.Workbook();

    const resumen = workbook.addWorksheet('Resumen');
    resumen.columns = [
      { header: 'Metrica', key: 'metrica', width: 40 },
      { header: 'Valor', key: 'valor', width: 18 },
    ];
    resumen.addRows([
      { metrica: 'Fecha de generacion', valor: now.toISOString() },
      ...(fromDate
        ? [
            { metrica: 'Desde', valor: fromDate.toISOString() },
            { metrica: 'Hasta', valor: toDate?.toISOString() ?? '' },
          ]
        : []),
      { metrica: 'Clientes unicos hoy', valor: uniqueClientsToday },
      { metrica: 'Chats cerrados hoy', valor: closedToday },
      { metrica: 'Chats activos', valor: chats.filter((c) => c.status === 'active' && !c.isGroup).length },
      { metrica: 'Chats en cola', valor: chats.filter((c) => c.status === 'waiting' && c.operationalStatus !== 'waiting_customer').length },
      { metrica: 'SLA vencidos', valor: slaBreached.length },
      { metrica: 'Por vencer (80% del plazo)', valor: porVencer.length },
      { metrica: 'Chats congelados', valor: frozen.length },
      { metrica: 'Cumplimiento SLA (%)', valor: this.computeSlaCompliance(chats, slaBreached) },
    ]);
    resumen.getColumn('metrica').font = { bold: true };

    const detail = workbook.addWorksheet('Detalle chats');
    detail.columns = [
      { header: 'Cliente', key: 'name', width: 28 },
      { header: 'Telefono', key: 'phone', width: 20 },
      { header: 'Asesor', key: 'advisor', width: 22 },
      { header: 'Prioridad', key: 'priority', width: 12 },
      { header: 'Estado', key: 'estado', width: 18 },
      { header: 'Categoria', key: 'categoria', width: 20 },
      { header: 'Espera (min)', key: 'waiting', width: 14 },
      { header: 'Plazo SLA (min)', key: 'deadline', width: 16 },
      { header: 'Tiempo restante (min)', key: 'remaining', width: 18 },
    ];
    const rows: any[] = [];
    for (const chat of rangeChats) {
      if (chat.isGroup) continue;
      const sla = this.computeChatSla(chat, messages);
      rows.push({
        name: chat.name,
        phone: chat.phone,
        advisor: chat.assignedAdvisor?.name ?? chat.fixedAdvisor?.name ?? '',
        priority: chat.priority ?? 'normal',
        estado: sla.slaState,
        categoria: sla.categoriaLabel,
        waiting: sla.slaMinutesWaiting,
        deadline: sla.slaDeadlineMinutes,
        remaining: sla.slaRemainingMinutes,
      });
    }
    detail.addRows(rows);

    if (rangeChats.length) {
      const serie = workbook.addWorksheet('Serie');
      const serieData = this.buildReportSeries(rangeChats, fromDate, toDate);
      serie.columns = [
        { header: 'Periodo', key: 'periodo', width: 16 },
        { header: 'Recibidos', key: 'recibidos', width: 14 },
        { header: 'Asignados', key: 'asignados', width: 14 },
        { header: 'Cerrados', key: 'cerrados', width: 14 },
      ];
      serie.addRows(serieData);
      serie.getColumn('periodo').font = { bold: true };

      const asesores = workbook.addWorksheet('Asesores');
      const advisorRows = this.buildReportAdvisors(
        rangeChats,
        advisors,
        messages,
      );
      asesores.columns = [
        { header: 'Asesor', key: 'name', width: 22 },
        { header: 'Chats asignados', key: 'asignados', width: 18 },
        { header: 'Cerrados', key: 'cerrados', width: 14 },
        { header: 'Mensajes enviados', key: 'mensajes', width: 20 },
        { header: 'Respuesta prom (min)', key: 'respuesta', width: 22 },
      ];
      asesores.addRows(advisorRows);
      asesores.getColumn('name').font = { bold: true };
    }

    resumen.getCell('A1').value = 'Reporte del Centro de Operaciones';

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  async getReportData(
    role: string,
    from: string,
    to: string,
    granularity: 'day' | 'month' | 'year' = 'day',
  ): Promise<WhatsappReportDataDto> {
    this.assertAdminRole(role);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toEnd = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

    const chats = await this.chatRepo.find({
      relations: ['assignedAdvisor', 'fixedAdvisor'],
      order: { lastMessageAt: 'DESC' },
    });
    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      order: { name: 'ASC' },
    });
    const messages = await this.messageRepo.find({
      relations: ['chat', 'advisor'],
      order: { createdAt: 'DESC' },
      take: 2000,
    });

    const rangeChats = chats.filter((chat) => {
      if (chat.isGroup) return false;
      const t = new Date(chat.createdAt).getTime();
      return t >= fromDate.getTime() && t < toEnd.getTime();
    });
    const rangeMessages = messages.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t >= fromDate.getTime() && t < toEnd.getTime();
    });

    const uniqueClients = new Set(
      rangeMessages.filter((m) => !m.fromMe).map((m) => m.chat?.id).filter(Boolean),
    ).size;
    const cerrados = chats.filter((chat) => {
      if (chat.isGroup) return false;
      const closedAt = chat.closedAt ?? (chat.status === 'closed' ? chat.updatedAt : null);
      if (!closedAt) return false;
      const t = new Date(closedAt).getTime();
      return t >= fromDate.getTime() && t < toEnd.getTime();
    });
    const asignados = rangeChats.filter((chat) => chat.assignedAt).length;
    const mensajesTotales = rangeMessages.length;
    const mensajesAsesor = rangeMessages.filter((m) => m.fromMe).length;

    const avgResponseMinutes = this.averageResponseMinutesInRange(rangeMessages);

    const slaScope = rangeChats.filter(
      (chat) =>
        chat.operationalStatus !== 'waiting_customer' &&
        chat.operationalStatus !== 'waiting_technical' &&
        chat.operationalStatus !== 'resolved',
    );
    const breachedInRange = slaScope.filter(
      (chat) => this.isSlaBreached(chat, messages),
    ).length;
    const slaDenominador = slaScope.length;
    const slaCumplimiento = slaDenominador
      ? Math.max(0, Math.round(((slaDenominador - breachedInRange) / slaDenominador) * 100))
      : 100;

    const serie = this.buildReportSeries(rangeChats, fromDate, toDate, granularity);
    const perAdvisor = this.buildReportAdvisors(rangeChats, advisors, messages);

    const categoriaCounts = new Map<string, number>();
    for (const chat of rangeChats) {
      const sla = this.computeChatSla(chat, messages);
      categoriaCounts.set(
        sla.categoria,
        (categoriaCounts.get(sla.categoria) ?? 0) + 1,
      );
    }
    const porCategoria = [...categoriaCounts.entries()].map(
      ([categoria, total]) => ({
        categoria,
        label: this.categoriaLabel(categoria as Parameters<typeof this.categoriaLabel>[0]),
        total,
      }),
    );

    const chatRows = rangeChats.map((chat) => {
      const sla = this.computeChatSla(chat, messages);
      return {
        id: chat.id,
        name: chat.name,
        phone: chat.phone,
        advisor: chat.assignedAdvisor?.name ?? chat.fixedAdvisor?.name ?? '',
        priority: chat.priority ?? 'normal',
        categoria: sla.categoria,
        estado: sla.categoriaLabel,
        creado: chat.createdAt.toISOString(),
        cerrado: chat.closedAt?.toISOString() ?? null,
        mensajes: rangeMessages.filter((m) => m.chat?.id === chat.id).length,
      };
    });

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      granularity,
      summary: {
        chatsRecibidos: rangeChats.length,
        clientesUnicos: uniqueClients,
        asignados,
        cerrados: cerrados.length,
        mensajesTotales,
        mensajesAsesor,
        tiempoPromedioRespuestaMin: avgResponseMinutes,
        slaCumplimiento,
        slaDenominador,
      },
      series: serie,
      perAdvisor,
      porCategoria,
      chats: chatRows.slice(0, 300),
    };
  }

  private buildReportSeries(
    chats: WhatsappChat[],
    fromDate: Date | null,
    toDate: Date | null,
    granularity: 'day' | 'month' | 'year' = 'day',
  ): Array<{ periodo: string; recibidos: number; asignados: number; cerrados: number }> {
    const keyFn = (date: Date): string => {
      if (granularity === 'year') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      if (granularity === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const received = new Map<string, number>();
    const assigned = new Map<string, number>();
    const closed = new Map<string, number>();
    for (const chat of chats) {
      received.set(keyFn(chat.createdAt), (received.get(keyFn(chat.createdAt)) ?? 0) + 1);
      if (chat.assignedAt)
        assigned.set(keyFn(chat.assignedAt), (assigned.get(keyFn(chat.assignedAt)) ?? 0) + 1);
      const closedAt = chat.closedAt ?? (chat.status === 'closed' ? chat.updatedAt : null);
      if (closedAt)
        closed.set(keyFn(closedAt), (closed.get(keyFn(closedAt)) ?? 0) + 1);
    }

    const keys = new Set([...received.keys(), ...assigned.keys(), ...closed.keys()]);
    const sortedKeys = [...keys].sort();
    return sortedKeys.map((periodo) => ({
      periodo,
      recibidos: received.get(periodo) ?? 0,
      asignados: assigned.get(periodo) ?? 0,
      cerrados: closed.get(periodo) ?? 0,
    }));
  }

  private buildReportAdvisors(
    chats: WhatsappChat[],
    advisors: Array<{ id: string; name: string }>,
    messages: WhatsappMessage[],
  ): Array<{
    id: string;
    name: string;
    chatsAsignados: number;
    cerrados: number;
    mensajesEnviados: number;
    promRespuestaMin: number;
  }> {
    return advisors.map((advisor) => {
      const advisorChats = chats.filter(
        (chat) => chat.assignedAdvisor?.id === advisor.id,
      );
      const advisorMessages = messages.filter(
        (m) => m.fromMe && m.advisor?.id === advisor.id,
      );
      return {
        id: advisor.id,
        name: advisor.name,
        chatsAsignados: advisorChats.length,
        cerrados: advisorChats.filter(
          (chat) => chat.status === 'closed',
        ).length,
        mensajesEnviados: advisorMessages.length,
        promRespuestaMin: this.averageAdvisorResponseMinutes(
          advisor.id,
          messages,
        ),
      };
    });
  }

  private averageResponseMinutesInRange(
    messages: WhatsappMessage[],
  ): number {
    const ordered = [...messages]
      .filter((message) => message.chat?.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    const pendingByChat = new Map<string, Date>();
    const responseMinutes: number[] = [];

    for (const message of ordered) {
      const chatId = message.chat.id;
      if (!message.fromMe) {
        pendingByChat.set(chatId, message.createdAt);
        continue;
      }
      if (!pendingByChat.has(chatId)) continue;
      const started = pendingByChat.get(chatId)!;
      responseMinutes.push(
        Math.max(
          0,
          Math.round(
            (new Date(message.createdAt).getTime() -
              new Date(started).getTime()) /
              60000,
          ),
        ),
      );
      pendingByChat.delete(chatId);
    }

    if (!responseMinutes.length) return 0;
    return Math.round(
      responseMinutes.reduce((sum, value) => sum + value, 0) /
        responseMinutes.length,
    );
  }

  private computeSlaCompliance(
    chats: WhatsappChat[],
    slaBreached: WhatsappChat[],
  ): number {
    const scope = chats.filter(
      (chat) =>
        chat.status === 'active' &&
        !chat.isGroup &&
        chat.operationalStatus !== 'waiting_customer' &&
        chat.operationalStatus !== 'waiting_technical' &&
        chat.operationalStatus !== 'resolved',
    ).length;
    return scope
      ? Math.max(
          0,
          Math.round(((scope - slaBreached.length) / scope) * 100),
        )
      : 100;
  }

  async adminAssignChat(
    chatId: string,
    advisorId: string,
    role: string,
    mode: WhatsappAssignmentMode = 'admin',
    customMessage?: string,
  ): Promise<AssignmentResult> {
    this.assertAdminRole(role);
    const advisor = await this.userRepo.findOne({
      where: { id: advisorId, role: 'advisor', active: true },
    });
    if (!advisor)
      throw new NotFoundException('Asesor no encontrado o inactivo');
    const chat = await this.findChatOrFail(chatId);

    if (mode !== 'fixed') {
      const [enAlmuerzo, enAlmuerzoRedis, activeCount, maxChats] =
        await Promise.all([
          this.configuracionService.estaEnAlmuerzo(advisor.id).catch(() => false),
          this.redisState.isOnLunch(advisor.id).catch(() => false),
          this.countActiveChatsByAdvisorExcludingFixed(advisor.id),
          this.getMaxActiveChatsPerAdvisor(),
        ]);
      if (enAlmuerzo || enAlmuerzoRedis) {
        throw new BadRequestException(
          'Este agente esta en almuerzo y no puede recibir el chat',
        );
      }
      if (activeCount >= maxChats) {
        throw new BadRequestException(
          `Este agente ya alcanzo su capacidad maxima de ${maxChats} chats activos`,
        );
      }
    }

    const claimed = await this.claimChatForAdvisor(chatId, advisor, {
      mode,
      operationalStatus:
        chat.isGroup
          ? 'in_progress'
          : mode === 'temporary'
            ? 'assigned'
            : 'in_progress',
      admin: true,
    });
    if (!claimed) {
      throw new ConflictException('Este chat no se puede asignar en este momento');
    }

    const skipAutoMessage = claimed.isGroup && !customMessage?.trim();
    return this.finishChatAssignment(
      claimed.id,
      advisor,
      customMessage,
      skipAutoMessage,
    );
  }

  async adminUnassignChat(
    chatId: string,
    role: string,
  ): Promise<WaChatDto> {
    this.assertAdminRole(role);
    const chat = await this.findChatOrFail(chatId);
    if (chat.status === 'closed') {
      throw new ConflictException('Este chat ya esta cerrado');
    }
    if (chat.isGroup) {
      throw new ConflictException(
        'Los grupos se liberan con la opcion Liberar',
      );
    }
    chat.status = 'closed';
    chat.operationalStatus = 'closed';
    chat.closedAt = new Date();
    chat.assignedAdvisor = null;
    chat.assignedAt = null;
    chat.assignmentMode = null;
    chat.queueNoticeSent = false;
    chat.outOfHoursNoticeSent = false;
    chat.unreadCount = 0;
    await this.chatRepo.save(chat);
    return this.toChatDto(chat, false);
  }

  async setFixedAdvisor(
    chatId: string,
    advisorId: string,
    role: string,
  ): Promise<AssignmentResult> {
    this.assertAdminRole(role);
    const advisor = await this.userRepo.findOne({
      where: { id: advisorId, role: 'advisor', active: true },
    });
    if (!advisor)
      throw new NotFoundException('Asesor fijo no encontrado o inactivo');
    const chat = await this.findChatOrFail(chatId);

    chat.fixedAdvisor = advisor;
    chat.status = 'active';
    chat.operationalStatus = chat.isGroup ? 'in_progress' : 'assigned';
    chat.assignedAdvisor = advisor;
    chat.assignedAt = new Date();
    chat.assignmentMode = 'fixed';
    chat.queueNoticeSent = false;
    chat.outOfHoursNoticeSent = false;
    await this.chatRepo.save(chat);

    const dto = await this.toChatDto(await this.findChatOrFail(chatId), true);
    return {
      advisorId: advisor.id,
      advisorName: advisor.name,
      chat: dto,
      autoMessage: null,
    };
  }

  async clearFixedAdvisor(chatId: string, role: string): Promise<WaChatDto> {
    this.assertAdminRole(role);
    const chat = await this.findChatOrFail(chatId);

    if (chat.isGroup) {
      chat.fixedAdvisor = null;
      chat.assignmentMode = null;
      chat.status = 'active';
      chat.operationalStatus = 'in_progress';
      await this.chatRepo.save(chat);
      return this.toChatDto(await this.findChatOrFail(chatId), true);
    }

    chat.fixedAdvisor = null;
    chat.status = 'closed';
    chat.operationalStatus = 'closed';
    chat.closedAt = new Date();
    chat.assignedAdvisor = null;
    chat.assignedAt = null;
    chat.assignmentMode = null;
    chat.unreadCount = 0;
    chat.queueNoticeSent = false;
    chat.outOfHoursNoticeSent = false;
    await this.chatRepo.save(chat);

    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  async updateOperationalStatus(
    chatId: string,
    operationalStatus: WhatsappOperationalStatus,
    advisorId: string,
    role: string,
  ): Promise<WaChatDto> {
    const allowed: WhatsappOperationalStatus[] = [
      'new',
      'queued',
      'assigned',
      'in_progress',
      'waiting_customer',
      'waiting_technical',
      'resolved',
      'closed',
    ];
    if (!allowed.includes(operationalStatus)) {
      throw new BadRequestException('Estado de WhatsApp no valido');
    }
    const chat = await this.findChatOrFail(chatId);
    if (role !== 'admin' && chat.assignedAdvisor?.id !== advisorId) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }
    chat.operationalStatus = operationalStatus;
    chat.operationalStatusUpdatedAt = new Date();
    if (operationalStatus === 'closed') {
      chat.status = 'closed';
      chat.closedAt = new Date();
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
    } else if (chat.assignedAdvisor) {
      chat.status = 'active';
    }
    await this.chatRepo.save(chat);
    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  async updateChatPriority(
    chatId: string,
    priority: 'low' | 'normal' | 'high' | 'critical',
    role: string,
  ): Promise<WaChatDto> {
    this.assertAdminRole(role);
    const chat = await this.findChatOrFail(chatId);
    const allowed: string[] = ['low', 'normal', 'high', 'critical'];
    if (!allowed.includes(priority)) {
      throw new BadRequestException(
        'Prioridad no valida. Use: low, normal, high, critical',
      );
    }
    chat.priority = priority;
    await this.chatRepo.save(chat);
    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  async getMessages(
    chatId: string,
    page = 1,
    limit = 50,
    advisorId?: string,
    role?: string,
    anchor?: string,
  ): Promise<WaMessageDto[]> {
    if (advisorId && role)
      await this.assertCanViewChat(chatId, advisorId, role);
    return this.getMessagesInternal(chatId, page, limit, anchor);
  }

  async getChatForAdvisor(
    chatId: string,
    advisorId: string,
    role: string,
  ): Promise<WaChatDto> {
    this.assertWhatsappUserRole(role);
    const chat = await this.assertCanViewChat(chatId, advisorId, role);
    return this.toChatDto(chat, true);
  }

  private async getMessagesInternal(
    chatId: string,
    page = 1,
    limit = 50,
    anchor?: string,
  ): Promise<WaMessageDto[]> {
    let targetPage = Math.max(page, 1);

    if (anchor) {
      const anchorMsg = await this.messageRepo.findOne({
        where: { chat: { id: chatId }, metaMessageId: anchor },
      });
      if (anchorMsg) {
        const beforeCount = await this.messageRepo.count({
          where: {
            chat: { id: chatId },
            createdAt: MoreThan(anchorMsg.createdAt),
          },
        });
        targetPage = Math.max(1, Math.floor(beforeCount / limit) + 1);
      }
    }

    const count = await this.messageRepo.count({
      where: { chat: { id: chatId } },
    });
    const totalPages = Math.max(1, Math.ceil(count / limit));
    targetPage = Math.min(targetPage, totalPages);
    const skip = (targetPage - 1) * limit;

    const rawMessages = await this.messageRepo.find({
      where: { chat: { id: chatId } },
      relations: ['chat', 'advisor'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const messages = rawMessages.reverse();

    const replyIds = [
      ...new Set(
        messages
          .map((m) => m.replyToMessageId)
          .filter((id): id is string => !!id),
      ),
    ];

    const quotedMap = new Map<string, { body: string; senderName: string }>();
    if (replyIds.length) {
      const quotedMsgs = await this.messageRepo.find({
        where: replyIds.map((id) => ({ metaMessageId: id })),
        select: ['metaMessageId', 'body', 'senderName'],
      });
      for (const q of quotedMsgs) {
        if (q.metaMessageId)
          quotedMap.set(q.metaMessageId, {
            body: q.body,
            senderName: q.senderName,
          });
      }
    }

    return messages.map((message) => this.toMessageDto(message, quotedMap));
  }

  async editAdvisorMessage(
    chatId: string,
    messageId: string,
    advisorId: string,
    role: string,
    text: string,
  ): Promise<WaChatDto> {
    this.assertWhatsappUserRole(role);
    const cleanText = sanitizeOutboundText(text, this.maxTextLength);
    if (!cleanText) throw new BadRequestException('Mensaje requerido');

    const message = await this.messageRepo.findOne({
      where: { id: messageId, chat: { id: chatId } },
      relations: ['chat', 'advisor'],
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (!message.fromMe || message.isAuto || message.type !== 'text') {
      throw new BadRequestException(
        'Solo se pueden editar mensajes de texto enviados por el agente',
      );
    }
    if (role !== 'admin' && message.advisor?.id !== advisorId) {
      throw new ForbiddenException('No puedes editar mensajes de otro agente');
    }
    if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60_000) {
      throw new BadRequestException(
        'WhatsApp solo permite editar mensajes durante 15 minutos',
      );
    }

    await this.editRemoteMessage(message, cleanText).catch((err) => {
      this.logger.warn(
        `No se pudo editar el mensaje en WhatsApp: ${err?.message ?? err}`,
      );
    });

    message.body = cleanText;
    message.editedAt = new Date();
    await this.messageRepo.save(message);

    const chat = await this.findChatOrFail(chatId);
    chat.lastMessageAt = new Date();
    await this.chatRepo.save(chat);
    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  async deleteAdvisorMessage(
    chatId: string,
    messageId: string,
    advisorId: string,
    role: string,
  ): Promise<WaChatDto> {
    this.assertWhatsappUserRole(role);
    const message = await this.messageRepo.findOne({
      where: { id: messageId, chat: { id: chatId } },
      relations: ['chat', 'advisor'],
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (!message.fromMe || message.isAuto) {
      throw new BadRequestException(
        'Solo se pueden eliminar mensajes enviados por el agente',
      );
    }
    if (role !== 'admin' && message.advisor?.id !== advisorId) {
      throw new ForbiddenException(
        'No puedes eliminar mensajes de otro agente',
      );
    }
    if (Date.now() - new Date(message.createdAt).getTime() > 60 * 60 * 60_000) {
      throw new BadRequestException(
        'WhatsApp solo permite eliminar para todos durante 2 dias y 12 horas',
      );
    }

    await this.deleteRemoteMessage(message).catch((err) => {
      this.logger.warn(
        `No se pudo eliminar el mensaje en WhatsApp: ${err?.message ?? err}`,
      );
    });

    await this.messageRepo.delete(message.id);
    const chat = await this.findChatOrFail(chatId);
    chat.lastMessageAt = new Date();
    await this.chatRepo.save(chat);
    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  async sendAdvisorText(
    advisorId: string,
    role: string,
    to: string,
    text: string,
  ): Promise<{ chat: WaChatDto; message: WaMessageDto }> {
    this.assertWhatsappUserRole(role);
    await this.assertNoLunch(advisorId, role);
    const cleanText = sanitizeOutboundText(text, this.maxTextLength);
    if (!cleanText) throw new BadRequestException('Mensaje requerido');

    const chat = await this.findChatByAddressOrFail(to);
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');

    if (
      role !== 'admin' &&
      chat.assignedAdvisor &&
      chat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }
    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    const result = await this.sendTextMessage(this.getChatJid(chat), cleanText);
    const metaMessageId = result.messages?.[0]?.id ?? null;

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        chat,
        metaMessageId,
        body: cleanText,
        fromMe: true,
        senderName: advisor?.name ?? 'Asesor',
        participantJid: this.connectedJid,
        advisor: advisor ?? null,
        status: 'sent',
        isAuto: false,
        type: 'text',
      }),
    );

    chat.lastMessageAt = new Date();
    if (!chat.isGroup && chat.status === 'active') {
      chat.operationalStatus = 'in_progress';
    }
    await this.chatRepo.save(chat);

    return {
      chat: await this.toChatDto(chat, true),
      message: this.toMessageDto(message),
    };
  }

  async replyToMessage(
    advisorId: string,
    role: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<{ chat: WaChatDto; message: WaMessageDto }> {
    this.assertWhatsappUserRole(role);
    await this.assertNoLunch(advisorId, role);
    const cleanText = sanitizeOutboundText(text, this.maxTextLength);
    if (!cleanText) throw new BadRequestException('Mensaje requerido');

    const target = await this.messageRepo.findOne({
      where: { id: messageId, chat: { id: chatId } },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (!target) throw new NotFoundException('Mensaje no encontrado');

    const chat = target.chat;
    if (
      role !== 'admin' &&
      chat.assignedAdvisor &&
      chat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }

    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    const jid = this.getChatJid(chat);

    const contextInfo: any = {};
    if (target.metaMessageId) {
      contextInfo.stanzaId = target.metaMessageId;
      const body = target.body || '';
      const t = (target.type || 'text').toLowerCase();
      if (t === 'image') {
        contextInfo.quotedMessage = { imageMessage: { caption: body } };
      } else if (t === 'video') {
        contextInfo.quotedMessage = { videoMessage: { caption: body } };
      } else if (t === 'audio') {
        contextInfo.quotedMessage = { audioMessage: {} };
      } else if (t === 'document') {
        contextInfo.quotedMessage = {
          documentMessage: { fileName: target.fileName || 'archivo' },
        };
      } else {
        contextInfo.quotedMessage = { conversation: body };
      }
      if (chat.isGroup && target.participantJid) {
        contextInfo.participant = target.participantJid;
      }
    }

    const sock = await this.getReadySocket();
    const payload: any = { text: cleanText };
    if (Object.keys(contextInfo).length) payload.contextInfo = contextInfo;
    const sent = await sock.sendMessage(jid, payload);

    const metaMessageId = sent?.key?.id ?? null;
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        chat,
        metaMessageId,
        body: cleanText,
        fromMe: true,
        senderName: advisor?.name ?? 'Asesor',
        participantJid: this.connectedJid,
        advisor: advisor ?? null,
        status: 'sent',
        isAuto: false,
        type: 'text',
        replyToMessageId: target.metaMessageId ?? target.id,
      }),
    );

    chat.lastMessageAt = new Date();
    if (!chat.isGroup && chat.status === 'active') {
      chat.operationalStatus = 'in_progress';
    }
    await this.chatRepo.save(chat);

    return {
      chat: await this.toChatDto(chat, true),
      message: this.toMessageDto(
        message,
        new Map([
          [
            message.replyToMessageId!,
            { body: target.body, senderName: target.senderName },
          ],
        ]),
      ),
    };
  }

  async forwardMessage(
    advisorId: string,
    role: string,
    chatId: string,
    messageId: string,
    targetChatId: string,
  ): Promise<{ chat: WaChatDto; message: WaMessageDto }> {
    this.assertWhatsappUserRole(role);
    await this.assertNoLunch(advisorId, role);

    const sourceMsg = await this.messageRepo.findOne({
      where: { id: messageId, chat: { id: chatId } },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (!sourceMsg) throw new NotFoundException('Mensaje no encontrado');

    const sourceChat = sourceMsg.chat;
    if (
      role !== 'admin' &&
      sourceChat.assignedAdvisor &&
      sourceChat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }

    const targetChat = await this.findChatOrFail(targetChatId);
    if (
      role !== 'admin' &&
      targetChat.assignedAdvisor &&
      targetChat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException(
        'El chat destino esta asignado a otro agente',
      );
    }

    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    const jid = this.getChatJid(targetChat);

    const sock = await this.getReadySocket();
    let sent: any;

    if (sourceMsg.mediaUrl && sourceMsg.type !== 'text') {
      const mediaBuffer = await this.downloadMediaFromUrl(
        sourceMsg.mediaUrl,
      ).catch(() => null);
      if (mediaBuffer) {
        const payload: any = {};
        if (sourceMsg.type === 'image') {
          payload.image = mediaBuffer;
          if (sourceMsg.mimeType) payload.mimetype = sourceMsg.mimeType;
        } else if (sourceMsg.type === 'video') {
          payload.video = mediaBuffer;
          if (sourceMsg.mimeType) payload.mimetype = sourceMsg.mimeType;
        } else if (sourceMsg.type === 'audio') {
          payload.audio = mediaBuffer;
          payload.mimetype = sourceMsg.mimeType || 'audio/ogg';
        } else {
          payload.document = mediaBuffer;
          payload.mimetype = sourceMsg.mimeType || 'application/octet-stream';
          payload.fileName = sourceMsg.fileName || `archivo-${Date.now()}`;
        }
        payload.contextInfo = { forwardingScore: 1, isForwarded: true };
        sent = await sock.sendMessage(jid, payload);
      }
    }

    if (!sent) {
      sent = await sock.sendMessage(jid, {
        text: sourceMsg.body || '[Mensaje reenviado]',
        contextInfo: { forwardingScore: 1, isForwarded: true },
      });
    }

    const metaMessageId = sent?.key?.id ?? null;
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        chat: targetChat,
        metaMessageId,
        body: sourceMsg.body || '[Mensaje reenviado]',
        fromMe: true,
        senderName: advisor?.name ?? 'Asesor',
        participantJid: this.connectedJid,
        advisor: advisor ?? null,
        status: 'sent',
        isAuto: false,
        type: sourceMsg.type || 'text',
        mediaUrl: sourceMsg.mediaUrl,
        mimeType: sourceMsg.mimeType,
        fileName: sourceMsg.fileName,
        fileSize: sourceMsg.fileSize,
        replyToMessageId: null,
      }),
    );

    targetChat.lastMessageAt = new Date();
    if (!targetChat.isGroup && targetChat.status === 'active') {
      targetChat.operationalStatus = 'in_progress';
    }
    await this.chatRepo.save(targetChat);

    return {
      chat: await this.toChatDto(targetChat, true),
      message: this.toMessageDto(message),
    };
  }

  private async downloadMediaFromUrl(url: string): Promise<Buffer | null> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch {
      return null;
    }
  }

  async sendAdvisorMedia(
    advisorId: string,
    role: string,
    to: string,
    file: Express.Multer.File,
    caption = '',
    seconds = 0,
  ): Promise<{ chat: WaChatDto; message: WaMessageDto }> {
    this.assertWhatsappUserRole(role);
    if (!file?.buffer?.length)
      throw new BadRequestException('Archivo requerido');
    this.assertAllowedMedia(file);

    const chat = await this.findChatByAddressOrFail(to);
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');

    if (
      role !== 'admin' &&
      chat.assignedAdvisor &&
      chat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }
    const mimeType = this.normalizeMimeType(file.mimetype);
    const mediaType = this.mediaTypeFromMime(mimeType);
    const cleanCaption = sanitizeOutboundText(caption, this.maxCaptionLength);
    const safeFileName = sanitizeFileName(file.originalname, mimeType);
    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    const result = await this.sendMediaMessage(
      this.getChatJid(chat),
      mediaType,
      file.buffer,
      cleanCaption,
      safeFileName,
      mimeType,
      seconds,
    );
    const metaMessageId = result.messages?.[0]?.id ?? null;
    const mediaUrl = await this.saveLocalMedia(file);
    const body = cleanCaption;

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        chat,
        metaMessageId,
        body,
        fromMe: true,
        senderName: advisor?.name ?? 'Asesor',
        participantJid: this.connectedJid,
        advisor: advisor ?? null,
        status: 'sent',
        isAuto: false,
        type: mediaType,
        mediaId: metaMessageId,
        mediaUrl,
        mimeType,
        fileName: safeFileName,
        fileSize: file.size,
      }),
    );

    chat.lastMessageAt = new Date();
    if (!chat.isGroup && chat.status === 'active') {
      chat.operationalStatus = 'in_progress';
    }
    await this.chatRepo.save(chat);

    return {
      chat: await this.toChatDto(chat, true),
      message: this.toMessageDto(message),
    };
  }

  async sendAdvisorTemplate(
    advisorId: string,
    role: string,
    to: string,
    templateName: string,
    langCode = 'es_CO',
    components: any[] = [],
  ): Promise<{ chat: WaChatDto; message: WaMessageDto; messageId?: string }> {
    this.assertWhatsappUserRole(role);
    const chat = await this.findChatByAddressOrFail(to);
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');

    if (
      role !== 'admin' &&
      chat.assignedAdvisor &&
      chat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }

    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });
    const result = await this.sendTemplateMessage(
      this.getChatJid(chat),
      templateName,
      langCode,
      components,
    );
    const metaMessageId = result.messages?.[0]?.id ?? null;

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        chat,
        metaMessageId,
        body: `[Plantilla: ${templateName}]`,
        fromMe: true,
        senderName: advisor?.name ?? 'Asesor',
        participantJid: this.connectedJid,
        advisor: advisor ?? null,
        status: 'sent',
        isAuto: false,
        type: 'template',
      }),
    );

    chat.lastMessageAt = new Date();
    await this.chatRepo.save(chat);

    return {
      chat: await this.toChatDto(chat, true),
      message: this.toMessageDto(message),
      messageId: metaMessageId ?? undefined,
    };
  }

  async addNote(
    chatId: string,
    note: string,
    advisorId?: string,
    role?: string,
  ): Promise<WaChatDto> {
    const chat =
      advisorId && role
        ? await this.assertCanManageMetadata(chatId, advisorId, role)
        : await this.findChatOrFail(chatId);
    const cleanNote = cleanText(note);
    if (!cleanNote) return this.toChatDto(chat, true);
    chat.notes = [cleanNote, ...(chat.notes ?? [])];
    await this.chatRepo.save(chat);
    return this.toChatDto(chat, true);
  }

  async deleteNote(
    chatId: string,
    index: number,
    advisorId?: string,
    role?: string,
  ): Promise<WaChatDto> {
    const chat =
      advisorId && role
        ? await this.assertCanManageMetadata(chatId, advisorId, role)
        : await this.findChatOrFail(chatId);
    chat.notes = (chat.notes ?? []).filter((_, i) => i !== index);
    await this.chatRepo.save(chat);
    return this.toChatDto(chat, true);
  }

  async updateTags(
    chatId: string,
    tags: string[],
    advisorId?: string,
    role?: string,
  ): Promise<WaChatDto> {
    const chat =
      advisorId && role
        ? await this.assertCanManageMetadata(chatId, advisorId, role)
        : await this.findChatOrFail(chatId);
    chat.tags = Array.isArray(tags)
      ? tags.map((tag) => cleanText(tag)).filter(Boolean)
      : [];
    await this.chatRepo.save(chat);
    return this.toChatDto(chat, true);
  }

  async updateContactInfo(
    chatId: string,
    input: UpdateWhatsappContactInput = {},
    advisorId?: string,
    role?: string,
  ): Promise<WaChatDto> {
    const chat =
      advisorId && role
        ? await this.assertCanManageMetadata(chatId, advisorId, role)
        : await this.findChatOrFail(chatId);

    const nextPhone = cleanText(input.phone);
    if (nextPhone && !chat.isGroup) {
      const normalizedPhone = this.normalizePhone(nextPhone);
      if (normalizedPhone !== chat.phone) {
        const existing = await this.chatRepo.findOne({
          where: { phone: normalizedPhone },
        });
        if (existing && existing.id !== chat.id) {
          throw new ForbiddenException('Ya existe otro chat con este telefono');
        }
        chat.phone = normalizedPhone;
      }
    }

    const name = cleanText(input.name);
    const contactRole = cleanText(input.role);
    const institution = cleanText(input.institution);
    const institutionUrl = this.normalizeUrl(input.institutionUrl);
    const city = cleanText(input.city);
    const email = cleanText(input.email ?? '');
    const plan = cleanText(input.plan);

    if (name) chat.name = name;
    if (contactRole) chat.role = contactRole;
    if (institution) chat.institution = institution;
    chat.institutionUrl = institutionUrl;
    chat.city = city;
    chat.email = email || null;
    if (plan) chat.plan = plan;
    if (Array.isArray(input.modules)) {
      const modules = input.modules
        .map((module) => cleanText(module))
        .filter(Boolean);
      chat.modules = modules.length ? modules : ['Atencion'];
    }

    await this.chatRepo.save(chat);
    return this.toChatDto(chat, true);
  }

  async markRead(
    chatId: string,
    advisorId?: string,
    role?: string,
  ): Promise<void> {
    const chat =
      advisorId && role
        ? await this.assertCanViewChat(chatId, advisorId, role)
        : await this.findChatOrFail(chatId);
    chat.unreadCount = 0;
    await this.chatRepo.save(chat);
  }

  async openChat(
    chatId: string,
    userId: string,
    role: string,
  ): Promise<WaChatDto> {
    const chat = await this.assertCanViewChat(chatId, userId, role);
    this.openChatByUser.set(userId, chatId);
    if (chat.unreadCount) {
      chat.unreadCount = 0;
      await this.chatRepo.save(chat);
    }
    return this.toChatDto(chat, true);
  }

  closeChatView(userId: string): void {
    this.openChatByUser.delete(userId);
  }

  async closeChat(
    chatId: string,
    advisorId: string,
    role: string,
  ): Promise<WaChatDto> {
    const chat = await this.findChatOrFail(chatId);
    if (chat.isGroup) {
      if (role !== 'admin') {
        throw new ForbiddenException(
          'Solo un administrador puede liberar la asignacion de un grupo',
        );
      }
      chat.status = 'active';
      chat.operationalStatus = 'in_progress';
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
      chat.unreadCount = 0;
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
      await this.chatRepo.save(chat);
      return this.toChatDto(await this.findChatOrFail(chatId), true);
    }
    if (role !== 'admin' && chat.assignedAdvisor?.id !== advisorId) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }

    if (role !== 'admin' && chat.fixedAdvisor) {
      throw new ForbiddenException(
        'Este chat tiene un agente fijo. Solo un administrador puede cerrarlo.',
      );
    }

    chat.status = 'closed';
    chat.operationalStatus = 'closed';
    chat.closedAt = new Date();
    chat.assignedAdvisor = null;
    chat.assignedAt = null;
    chat.assignmentMode = null;
    chat.unreadCount = 0;
    chat.queueNoticeSent = false;
    chat.outOfHoursNoticeSent = false;
    await this.chatRepo.save(chat);

    return this.toChatDto(chat, true);
  }

  async updateMessageStatus(update: WhatsappStatusUpdate): Promise<{
    advisorId?: string;
    message: WaMessageDto;
    chat: WaChatDto;
  } | null> {
    const message = await this.messageRepo.findOne({
      where: { metaMessageId: update.messageId },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (!message) return null;

    message.status = update.status;
    await this.messageRepo.save(message);

    return {
      advisorId: message.chat.assignedAdvisor?.id,
      message: this.toMessageDto(message),
      chat: await this.toChatDto(message.chat, true),
    };
  }

  async getQuickReplies() {
    const config = await this.configuracionService
      .getGlobal()
      .catch(() => null);
    const replies = this.normalizeQuickReplies(config?.whatsappQuickReplies);
    return replies.map((reply, index) => ({
      id: `reply-${index + 1}`,
      name: reply.name,
      content: reply.content,
      shortcut: this.quickReplyShortcut(reply.name, index),
    }));
  }

  async sendTextMessage(to: string, text: string) {
    const sock = await this.getReadySocket();
    const jid = this.normalizeTargetJid(to);
    const cleanText = sanitizeOutboundText(text, this.maxTextLength);
    if (!cleanText) throw new BadRequestException('Mensaje requerido');
    // Timeout para que una sesión de WhatsApp degradada no bloquee la
    // respuesta de /take o /admin-assign (la asignación debe sentirse
    // inmediata aunque el envío del mensaje de bienvenida tarde).
    const sent = await this.withTimeout(
      sock.sendMessage(jid, { text: cleanText }),
      this.whatsappSendTimeoutMs,
      'Timeout enviando mensaje por WhatsApp',
    );
    this.logger.log(
      `Mensaje enviado por Baileys a ${jid}: "${this.compactLogText(cleanText)}"`,
    );
    return { messages: [{ id: sent?.key?.id ?? null }] };
  }

  async reactToMessage(
    chatId: string,
    messageId: string,
    advisorId: string,
    role: string,
    emoji: string,
  ): Promise<WaChatDto> {
    this.assertWhatsappUserRole(role);
    const cleanEmoji = this.cleanReactionEmoji(emoji);
    const target = await this.messageRepo.findOne({
      where: { id: messageId, chat: { id: chatId } },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (!target) throw new NotFoundException('Mensaje no encontrado');
    if (!target.metaMessageId) {
      throw new BadRequestException(
        'Este mensaje aun no tiene id de WhatsApp para reaccionar',
      );
    }
    if (target.type === 'reaction') {
      throw new BadRequestException('No se puede reaccionar a una reaccion');
    }
    if (
      role !== 'admin' &&
      target.chat.assignedAdvisor &&
      target.chat.assignedAdvisor.id !== advisorId
    ) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }

    const jid = this.getChatJid(target.chat);
    const advisor = await this.userRepo.findOne({ where: { id: advisorId } });

    if (!target.chat.isGroup) {
      const sock = await this.getReadySocket();
      const key: WAMessageKey = {
        remoteJid: jid,
        id: target.metaMessageId,
        fromMe: target.fromMe,
      };

      await sock.sendMessage(jid, {
        react: {
          text: cleanEmoji,
          key,
        },
      });
    }

    const raw: IncomingWhatsappMessage = {
      messageId: `local-reaction:${target.metaMessageId}:${advisorId}`,
      chatJid: jid,
      from: jid,
      fromName: target.chat.name,
      senderName: advisor?.name || 'Asesor',
      participantJid: target.chat.isGroup
        ? advisorId
        : (this.connectedJid ?? advisorId),
      isGroup: target.chat.isGroup,
      type: 'reaction',
      text: cleanEmoji,
      mediaId: target.metaMessageId,
      reactionToMessageId: target.metaMessageId,
      timestamp: new Date().toISOString(),
    };
    await this.saveReactionMessage(target.chat, raw, true);

    target.chat.lastMessageAt = new Date();
    await this.chatRepo.save(target.chat);
    return this.toChatDto(await this.findChatOrFail(chatId), true);
  }

  private async editRemoteMessage(
    message: WhatsappMessage,
    text: string,
  ): Promise<void> {
    if (!message.metaMessageId) return;
    const sock = await this.getReadySocket();
    const jid = this.getChatJid(message.chat);
    await sock.sendMessage(jid, {
      text,
      edit: {
        remoteJid: jid,
        fromMe: true,
        id: message.metaMessageId,
      },
    });
  }

  private async deleteRemoteMessage(message: WhatsappMessage): Promise<void> {
    if (!message.metaMessageId) return;
    const sock = await this.getReadySocket();
    const jid = this.getChatJid(message.chat);
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe: true,
        id: message.metaMessageId,
      },
    });
  }

  async sendMediaMessage(
    to: string,
    mediaType: WhatsappMediaType,
    buffer: Buffer,
    caption = '',
    fileName = '',
    mimeType = '',
    seconds = 0,
  ) {
    const sock = await this.getReadySocket();
    const jid = this.normalizeTargetJid(to);
    const payload: any = {};
    const cleanCaption = sanitizeOutboundText(caption, this.maxCaptionLength);
    const cleanFileName = sanitizeFileName(fileName, mimeType);

    if (mediaType === 'image') {
      payload.image = buffer;
      if (cleanCaption) payload.caption = cleanCaption;
      if (mimeType) payload.mimetype = mimeType;
    } else if (mediaType === 'video') {
      payload.video = buffer;
      if (cleanCaption) payload.caption = cleanCaption;
      if (mimeType) payload.mimetype = mimeType;
    } else if (mediaType === 'audio') {
      payload.audio = buffer;
      payload.mimetype = mimeType || 'audio/ogg';
      payload.ptt = this.isVoiceNoteMime(payload.mimetype);
      if (Number.isFinite(seconds) && seconds > 0) {
        payload.seconds = Math.round(seconds);
      }
    } else {
      payload.document = buffer;
      payload.mimetype = mimeType || 'application/octet-stream';
      payload.fileName =
        cleanFileName || `archivo-${Date.now()}${this.extFromMime(mimeType)}`;
      if (cleanCaption) payload.caption = cleanCaption;
    }

    const sent = await sock.sendMessage(jid, payload);
    return { messages: [{ id: sent?.key?.id ?? null }] };
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    langCode = 'es_CO',
    components: any[] = [],
  ) {
    const componentText = components.length
      ? `\n${JSON.stringify(components)}`
      : '';
    return this.sendTextMessage(
      to,
      `[Plantilla ${langCode}: ${templateName}]${componentText}`,
    );
  }

  async markAsRead(messageId: string) {
    const message = await this.messageRepo.findOne({
      where: { metaMessageId: messageId },
      relations: ['chat'],
    });
    if (!message?.chat) return { ok: false };
    await this.readBaileysMessage({
      remoteJid: this.getChatJid(message.chat),
      id: messageId,
      fromMe: false,
      participant: message.participantJid ?? undefined,
    });
    return { ok: true };
  }

  parseIncomingMessages(body: any): IncomingWhatsappMessage[] {
    const results: IncomingWhatsappMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const messages = value?.messages ?? [];
        for (const msg of messages) {
          const contact = value.contacts?.find(
            (c: any) => c.wa_id === msg.from,
          );
          const media = this.extractIncomingMedia(msg);
          results.push({
            messageId: msg.id,
            from: msg.from,
            fromName: contact?.profile?.name ?? msg.from,
            type: msg.type,
            text:
              msg.type === 'reaction'
                ? (msg.reaction?.emoji ?? '')
                : (msg.text?.body ?? media.caption ?? ''),
            mediaId: media.id,
            mimeType: media.mimeType,
            fileName: media.fileName,
            caption: media.caption,
            reactionToMessageId: msg.reaction?.message_id,
            timestamp: new Date(
              parseInt(msg.timestamp, 10) * 1000,
            ).toISOString(),
            phoneNumberId: value.metadata?.phone_number_id,
          });
        }
      }
    }
    return results;
  }

  parseStatusUpdates(body: any): WhatsappStatusUpdate[] {
    const results: WhatsappStatusUpdate[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          results.push({
            messageId: status.id,
            status: status.status,
            timestamp: new Date(
              parseInt(status.timestamp, 10) * 1000,
            ).toISOString(),
          });
        }
      }
    }
    return results;
  }

  private async handleBaileysMessages(
    messages: WAMessage[],
    type?: string,
  ): Promise<void> {
    if (type && type !== 'notify') return;

    for (const message of messages) {
      try {
        const raw = await this.baileysMessageToIncoming(message);
        if (!raw) continue;

        if (message.key.fromMe) {
          const saved = await this.saveBaileysOutgoingMessage(raw);
          if (saved) {
            this.incomingResults$.next({
              chat: saved.chat,
              message: saved.message,
              assignedAdvisorId: saved.chat.assignedTo,
            });
          }
          continue;
        }

        const result = await this.handleIncomingMessage(raw, [
          ...this.connectedAdvisorIds,
        ]);
        this.incomingResults$.next(result);
        if (raw.messageKey) await this.readBaileysMessage(raw.messageKey);
      } catch (err) {
        this.logger.warn(
          `Error procesando mensaje de Baileys (${message.key?.id ?? 'desconocido'}): ${err?.message ?? err}`,
        );
      }
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as any)?.code === '23505'
    );
  }

  private async handleBaileysMessageUpdates(updates: any[]): Promise<void> {
    for (const item of updates ?? []) {
      const messageId = item.key?.id;
      const status = this.mapBaileysStatus(item.update?.status);
      if (!messageId || !status) continue;

      const updated = await this.updateMessageStatus({
        messageId,
        status,
        timestamp: new Date().toISOString(),
      });
      if (updated) this.messageStatusUpdates$.next(updated);
    }
  }

  private async handleBaileysCalls(calls: WACallEvent[] = []): Promise<void> {
    for (const call of calls) {
      if (call.status !== 'offer' || call.isGroup || !call.id || !call.from)
        continue;
      if (this.handledCallIds.has(call.id)) continue;

      this.handledCallIds.add(call.id);
      setTimeout(() => this.handledCallIds.delete(call.id), 10 * 60 * 1000);

      const from = this.normalizeJid(call.from);
      await this.sock?.rejectCall(call.id, from).catch((err) => {
        this.logger.warn(
          `No se pudo rechazar llamada ${call.id}: ${err?.message ?? err}`,
        );
      });

      const config = await this.configuracionService
        .getGlobal()
        .catch(() => null);
      const text =
        sanitizeOutboundText(
          config?.whatsappCallUnavailableMsg ||
            this.defaultCallUnavailableMessage,
          this.maxTextLength,
        ) || this.defaultCallUnavailableMessage;

      await this.sendTextMessage(from, text).catch((err) => {
        this.logger.warn(
          `No se pudo enviar aviso de llamada a ${from}: ${err?.message ?? err}`,
        );
      });
    }
  }

  private async baileysMessageToIncoming(
    message: WAMessage,
  ): Promise<IncomingWhatsappMessage | null> {
    const remoteJid = this.normalizeJid(message.key.remoteJid ?? '');
    if (
      !remoteJid ||
      remoteJid === 'status@broadcast' ||
      remoteJid.endsWith('@broadcast')
    ) {
      return null;
    }

    const content = this.unwrapBaileysContent(message.message);
    if (!content || this.isIgnorableBaileysContent(content)) return null;

    const typeInfo = this.extractBaileysBody(content);
    if (!typeInfo.text && !typeInfo.mediaId && typeInfo.type === 'text')
      return null;

    const isGroup = this.isGroupJid(remoteJid);
    const participantJid = isGroup
      ? this.normalizeJid(message.key.participant ?? '')
      : remoteJid;
    const fromName = isGroup
      ? await this.getGroupName(remoteJid)
      : this.getContactName(remoteJid, message.pushName);
    const senderName = message.key.fromMe
      ? (this.connectedName ?? 'WhatsApp')
      : isGroup
        ? this.getContactName(participantJid, message.pushName)
        : fromName;

    return {
      messageId: message.key.id ?? `${remoteJid}-${Date.now()}`,
      chatJid: remoteJid,
      from: isGroup ? remoteJid : this.jidToPhone(remoteJid),
      fromName,
      senderName,
      participantJid: isGroup ? participantJid : undefined,
      isGroup,
      type: typeInfo.type,
      text: typeInfo.text,
      mediaId:
        typeInfo.type !== 'text'
          ? typeInfo.type === 'reaction'
            ? typeInfo.mediaId
            : (message.key.id ?? typeInfo.mediaId)
          : undefined,
      mimeType: typeInfo.mimeType,
      fileName: typeInfo.fileName,
      caption: typeInfo.caption,
      reactionToMessageId: typeInfo.reactionToMessageId,
      replyToMessageId: typeInfo.replyToMessageId,
      timestamp: this.baileysTimestampToIso(message.messageTimestamp),
      messageKey: message.key,
      rawMessage: message,
    };
  }

  private async saveBaileysOutgoingMessage(
    raw: IncomingWhatsappMessage,
  ): Promise<{ chat: WaChatDto; message: WaMessageDto } | null> {
    const duplicate = await this.messageRepo.findOne({
      where: { metaMessageId: raw.messageId },
      relations: ['chat', 'chat.assignedAdvisor'],
    });
    if (duplicate) return null;

    let chat = await this.findOrCreateChatForRaw(raw);
    if (raw.isGroup) {
      chat.status = 'active';
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.role = 'Grupo WhatsApp';
      chat.institution = 'Grupo';
    }
    chat.lastMessageAt = new Date();
    try {
      chat = await this.chatRepo.save(chat);
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const existing = await this.findChatByAddress(chat.jid, chat.phone);
      if (!existing) throw err;
      chat = existing;
    }

    let savedMessage: WhatsappMessage;
    try {
      savedMessage =
        raw.type === 'reaction'
          ? await this.saveReactionMessage(chat, raw, true)
          : await this.messageRepo.save(
              this.messageRepo.create({
                chat,
                metaMessageId: raw.messageId,
                body: this.messageBody(raw),
                fromMe: true,
                senderName: raw.senderName || this.connectedName || 'WhatsApp',
                participantJid: raw.participantJid ?? this.connectedJid,
                status: 'sent',
                isAuto: false,
                type: raw.type || 'text',
                mediaId: raw.mediaId ?? null,
                mimeType: raw.mimeType ?? null,
                fileName: raw.fileName ?? null,
                replyToMessageId: raw.replyToMessageId ?? null,
              }),
            );
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      return null;
    }
    savedMessage = await this.attachIncomingMedia(savedMessage, raw);

    return {
      chat: await this.toChatDto(chat, true),
      message: await this.toMessageDtoWithQuote(savedMessage),
    };
  }

  private extractBaileysBody(content: proto.IMessage): {
    type: string;
    text: string;
    mediaId?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    reactionToMessageId?: string;
    replyToMessageId?: string;
  } {
    const type = getContentType(content);
    const data: any = type ? (content as any)[type] : null;

    if (type === 'conversation') {
      return {
        type: 'text',
        text: String(data ?? ''),
        ...this.extractReplyContext(data),
      };
    }
    if (type === 'extendedTextMessage') {
      return {
        type: 'text',
        text: data?.text ?? '',
        ...this.extractReplyContext(data),
      };
    }
    if (type === 'imageMessage') {
      return {
        type: 'image',
        text: data?.caption ?? '',
        caption: data?.caption ?? '',
        mediaId: data?.mediaKeyTimestamp?.toString?.() ?? data?.directPath,
        mimeType: data?.mimetype ?? 'image/jpeg',
      };
    }
    if (type === 'videoMessage') {
      return {
        type: 'video',
        text: data?.caption ?? '',
        caption: data?.caption ?? '',
        mediaId: data?.mediaKeyTimestamp?.toString?.() ?? data?.directPath,
        mimeType: data?.mimetype ?? 'video/mp4',
      };
    }
    if (type === 'audioMessage') {
      return {
        type: 'audio',
        text: '',
        mediaId: data?.mediaKeyTimestamp?.toString?.() ?? data?.directPath,
        mimeType: data?.mimetype ?? 'audio/ogg',
      };
    }
    if (type === 'documentMessage') {
      return {
        type: 'document',
        text: data?.caption ?? data?.title ?? '',
        caption: data?.caption ?? '',
        mediaId: data?.mediaKeyTimestamp?.toString?.() ?? data?.directPath,
        mimeType: data?.mimetype ?? '',
        fileName: data?.fileName ?? data?.title,
      };
    }
    if (type === 'stickerMessage') {
      return {
        type: 'sticker',
        text: '',
        mediaId: data?.mediaKeyTimestamp?.toString?.() ?? data?.directPath,
        mimeType: data?.mimetype ?? 'image/webp',
        fileName: 'sticker.webp',
      };
    }
    if (type === 'buttonsResponseMessage') {
      return {
        type: 'text',
        text: data?.selectedDisplayText ?? data?.selectedButtonId ?? '',
      };
    }
    if (type === 'listResponseMessage') {
      return {
        type: 'text',
        text: data?.title ?? data?.singleSelectReply?.selectedRowId ?? '',
      };
    }
    if (type === 'interactiveResponseMessage') {
      return {
        type: 'text',
        text: data?.body?.text ?? data?.nativeFlowResponseMessage?.name ?? '',
      };
    }
    if (type === 'reactionMessage') {
      return {
        type: 'reaction',
        text: data?.text ?? '',
        mediaId: data?.key?.id,
        reactionToMessageId: data?.key?.id,
      };
    }

    return { type: 'text', text: `[Mensaje ${type ?? 'no soportado'}]` };
  }

  private extractReplyContext(data: any): { replyToMessageId?: string } {
    const ctx = data?.contextInfo;
    if (!ctx) return {};
    const quotedId =
      typeof ctx.stanzaId === 'string' ? ctx.stanzaId : undefined;
    return { replyToMessageId: quotedId };
  }

  private unwrapBaileysContent(
    message?: proto.IMessage | null,
  ): proto.IMessage | undefined {
    let content: any = message;
    for (let i = 0; i < 5; i += 1) {
      if (!content) return undefined;
      if (content.ephemeralMessage?.message) {
        content = content.ephemeralMessage.message;
        continue;
      }
      if (content.viewOnceMessage?.message) {
        content = content.viewOnceMessage.message;
        continue;
      }
      if (content.viewOnceMessageV2?.message) {
        content = content.viewOnceMessageV2.message;
        continue;
      }
      if (content.documentWithCaptionMessage?.message) {
        content = content.documentWithCaptionMessage.message;
        continue;
      }
      break;
    }
    return content;
  }

  private isIgnorableBaileysContent(content: proto.IMessage): boolean {
    const type = getContentType(content);
    return (
      !type ||
      type === 'senderKeyDistributionMessage' ||
      type === 'messageContextInfo' ||
      type === 'protocolMessage'
    );
  }

  private mapBaileysStatus(status: unknown): WhatsappMessageStatus | null {
    const numeric = Number(status);
    if (Number.isNaN(numeric)) return null;
    if (numeric <= 0) return 'failed';
    if (numeric >= 4) return 'read';
    if (numeric === 3) return 'delivered';
    return 'sent';
  }

  private async readBaileysMessage(key: WAMessageKey): Promise<void> {
    if (!this.sock || !key.remoteJid || !key.id) return;
    await this.sock.readMessages([key]).catch(() => undefined);
  }

  private async findOrCreateChatForRaw(
    raw: IncomingWhatsappMessage,
  ): Promise<WhatsappChat> {
    const jid = raw.chatJid
      ? this.normalizeJid(raw.chatJid)
      : raw.from.includes('@')
        ? this.normalizeJid(raw.from)
        : this.phoneToJid(raw.from);
    const isGroup = !!raw.isGroup || this.isGroupJid(jid);
    const phone = isGroup
      ? jid
      : this.normalizePhone(raw.from || this.jidToPhone(jid));
    let chat = await this.findChatByAddress(jid, phone);

    if (!chat) {
      chat = this.chatRepo.create({
        phone,
        jid,
        isGroup,
        name: raw.fromName || (isGroup ? 'Grupo WhatsApp' : phone),
        role: isGroup ? 'Grupo WhatsApp' : 'Cliente WhatsApp',
        institution: isGroup ? 'Grupo' : 'WhatsApp',
        status: isGroup ? 'active' : 'waiting',
        operationalStatus: isGroup ? 'in_progress' : 'new',
        unreadCount: 0,
        notes: [],
        tags: [],
      });
      this.refreshProfilePicture(chat);
      return chat;
    }

    if (jid && !chat.jid) chat.jid = jid;
    chat.isGroup = isGroup;
    this.refreshProfilePicture(chat);
    if (isGroup) {
      chat.phone = jid;
      chat.role = 'Grupo WhatsApp';
      chat.institution = 'Grupo';
    } else if (phone && phone !== chat.phone) {
      chat.phone = phone;
    }
    return chat;
  }

  private async saveReactionMessage(
    chat: WhatsappChat,
    raw: IncomingWhatsappMessage,
    fromMe: boolean,
  ): Promise<WhatsappMessage> {
    const targetId = raw.reactionToMessageId || raw.mediaId;
    if (!targetId) {
      return this.messageRepo.save(
        this.messageRepo.create({
          chat,
          metaMessageId: raw.messageId,
          body: this.messageBody(raw),
          fromMe,
          senderName: raw.senderName || chat.name,
          participantJid: raw.participantJid ?? null,
          status: fromMe ? 'sent' : 'delivered',
          isAuto: false,
          type: 'reaction',
          mediaId: null,
        }),
      );
    }

    const participantJid =
      raw.participantJid ?? (fromMe ? this.connectedJid : null);
    const existing = await this.messageRepo.findOne({
      where: {
        chat: { id: chat.id },
        type: 'reaction',
        mediaId: targetId,
        participantJid: participantJid ?? IsNull(),
      },
      relations: ['chat'],
    });
    const reaction =
      existing ??
      this.messageRepo.create({
        chat,
        type: 'reaction',
        mediaId: targetId,
        participantJid,
      });

    reaction.metaMessageId = raw.messageId;
    const emoji = this.cleanReactionEmoji(raw.text);
    reaction.body = emoji || this.removedReactionBody;
    reaction.fromMe = fromMe;
    reaction.senderName =
      raw.senderName || (fromMe ? (this.connectedName ?? 'Asesor') : chat.name);
    reaction.status = fromMe ? 'sent' : 'delivered';
    reaction.isAuto = false;
    reaction.mimeType = null;
    reaction.fileName = null;
    reaction.fileSize = null;
    reaction.mediaUrl = null;

    return this.messageRepo.save(reaction);
  }

  private async findChatByAddressOrFail(value: string): Promise<WhatsappChat> {
    const jid = value?.includes('@')
      ? this.normalizeJid(value)
      : this.phoneToJid(value);
    const phone = value?.includes('@')
      ? this.jidToPhone(value)
      : this.normalizePhone(value);
    const chat = await this.findChatByAddress(jid, phone);
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');
    return chat;
  }

  private async findChatByAddress(
    jid?: string | null,
    phone?: string | null,
  ): Promise<WhatsappChat | null> {
    const normalizedJid = jid ? this.normalizeJid(jid) : '';
    const normalizedPhone = phone ? this.normalizePhone(phone) : '';

    if (normalizedJid) {
      const byJid = await this.chatRepo.findOne({
        where: { jid: normalizedJid },
        relations: ['assignedAdvisor'],
      });
      if (byJid) return byJid;
    }

    if (normalizedPhone) {
      const byPhone = await this.chatRepo.findOne({
        where: { phone: normalizedPhone },
        relations: ['assignedAdvisor'],
      });
      if (byPhone) return byPhone;
    }

    return null;
  }

  private async getReadySocket(): Promise<WASocket> {
    await this.ensureBaileysConnection();
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error(
        'WhatsApp no esta conectado. Escanea el QR antes de enviar mensajes.',
      );
    }
    return this.sock;
  }

  private getChatJid(chat: WhatsappChat): string {
    if (chat.jid) return this.normalizeJid(chat.jid);
    return this.normalizeTargetJid(chat.phone);
  }

  private normalizeTargetJid(value: string): string {
    const raw = cleanText(value);
    if (!raw) throw new BadRequestException('Destino de WhatsApp requerido');
    if (raw.includes('@')) return this.normalizeJid(raw);
    return this.phoneToJid(raw);
  }

  private phoneToJid(phone: string): string {
    return `${this.normalizePhone(phone)}@s.whatsapp.net`;
  }

  private jidToPhone(jid: string): string {
    const normalized = this.normalizeJid(jid);
    return normalized.includes('@s.whatsapp.net')
      ? normalized.replace('@s.whatsapp.net', '')
      : normalized;
  }

  private normalizeJid(jid: string): string {
    if (!jid) return '';
    try {
      return jidNormalizedUser(jid.trim());
    } catch {
      return jid.trim();
    }
  }

  private isGroupJid(jid: string): boolean {
    return this.normalizeJid(jid).endsWith('@g.us');
  }

  private async getGroupName(jid: string): Promise<string> {
    const normalized = this.normalizeJid(jid);
    const cached = this.groupNameCache.get(normalized);
    if (cached) return cached;

    const subject = await this.sock
      ?.groupMetadata(normalized)
      .then((metadata) => metadata.subject)
      .catch(() => '');
    if (subject) {
      this.groupNameCache.set(normalized, subject);
      return subject;
    }
    return 'Grupo WhatsApp';
  }

  private rememberContact(contact: any): void {
    const jid = this.normalizeJid(contact?.id ?? contact?.jid ?? '');
    const name =
      cleanText(contact?.notify) ||
      cleanText(contact?.name) ||
      cleanText(contact?.verifiedName);
    if (jid && name) this.contactNameCache.set(jid, name);
  }

  private getContactName(jid: string, pushName?: string | null): string {
    const normalized = this.normalizeJid(jid);
    const name = cleanText(pushName) || this.contactNameCache.get(normalized);
    return name || this.jidToPhone(normalized);
  }

  private async profilePictureForChat(
    chat: WhatsappChat,
  ): Promise<string | null> {
    if (chat.profilePictureUrl) return chat.profilePictureUrl;
    const jid = this.getChatJid(chat);
    if (!this.sock || !jid) return null;
    return this.sock
      .profilePictureUrl(jid, 'image')
      .then((url) => url ?? null)
      .catch(() => null);
  }

  private refreshProfilePicture(chat: WhatsappChat): void {
    if (chat.profilePictureUrl || !this.sock) return;
    const chatId = chat.id;
    this.profilePictureForChat(chat)
      .then(async (url) => {
        if (!url || !chatId) return;
        await this.chatRepo
          .update(chatId, { profilePictureUrl: url })
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }

  private baileysTimestampToIso(value: unknown): string {
    const raw =
      typeof value === 'number'
        ? value
        : Number((value as any)?.toNumber?.() ?? value ?? Date.now());
    const millis = raw > 10_000_000_000 ? raw : raw * 1000;
    return new Date(
      Number.isFinite(millis) ? millis : Date.now(),
    ).toISOString();
  }

  private async assignChatIfPossible(
    chatId: string,
    connectedAdvisorIds: string[],
  ): Promise<AssignmentResult | null> {
    const horarioEstado = await this.configuracionService.getHorarioEstado();
    if (!horarioEstado.enJornada) return null;

    const chat = await this.findChatOrFail(chatId);
    if (chat.isGroup) return null;

    const fixedAdvisor = await this.findFixedAdvisorIfAvailable(
      chat,
      connectedAdvisorIds,
    );
    if (chat.fixedAdvisor && !fixedAdvisor) return null;
    const advisor =
      fixedAdvisor ?? (await this.findAvailableAdvisor(connectedAdvisorIds));
    if (!advisor) return null;
    return this.assignChatToAdvisor(
      chat,
      advisor,
      fixedAdvisor ? 'fixed' : 'auto',
    );
  }

  private async assignChatToAdvisor(
    chat: WhatsappChat,
    advisor: User,
    mode: WhatsappAssignmentMode = 'auto',
  ): Promise<AssignmentResult | null> {
    const claimed = await this.claimChatForAdvisor(chat.id, advisor, {
      mode,
      operationalStatus: 'assigned',
      fixedAdvisorId: chat.fixedAdvisor?.id ?? null,
    });
    if (!claimed) return null;

    return this.finishChatAssignment(claimed.id, advisor);
  }

  private async claimChatForAdvisor(
    chatId: string,
    advisor: User,
    opts: {
      mode: WhatsappAssignmentMode;
      operationalStatus: WhatsappOperationalStatus;
      admin?: boolean;
      fixedAdvisorId?: string | null;
    },
  ): Promise<WhatsappChat | null> {
    return this.chatRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(WhatsappChat);
      const builder = repo
        .createQueryBuilder('chat')
        .where('chat.id = :chatId', { chatId });

      if (!opts.admin) {
        builder
          .andWhere('chat.status = :waiting', { waiting: 'waiting' })
          .andWhere('chat.is_group = false');
        if (opts.fixedAdvisorId) {
          builder.andWhere('chat.fixed_advisor_id = :fixedId', {
            fixedId: opts.fixedAdvisorId,
          });
        }
      }

      const chat = await builder.setLock('pessimistic_write').getOne();
      if (!chat) return null;

      chat.status = 'active';
      chat.operationalStatus = opts.operationalStatus;
      chat.operationalStatusUpdatedAt = new Date();
      chat.assignedAdvisor = advisor;
      chat.assignedAt = new Date();
      chat.assignmentMode = opts.mode;
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;

      return repo.save(chat);
    });
  }

  private async finishChatAssignment(
    chatId: string,
    advisor: User,
    customMessage?: string,
    skipAutoMessage = false,
  ): Promise<AssignmentResult> {
    const chat = await this.findChatOrFail(chatId);
    let autoMessage: WhatsappMessage | null = null;
    if (!skipAutoMessage) {
      const template =
        customMessage?.trim() ||
        (
          await this.configuracionService.getGlobal().catch(() => null)
        )?.whatsappAssignmentMsg?.trim() ||
        this.defaultAssignmentMessage;
      const text = this.renderTemplate(template, advisor.name);
      autoMessage = await this.sendSystemMessage(chat, text, advisor);
    }
    const updatedChat = await this.findChatOrFail(chat.id);

    return {
      advisorId: advisor.id,
      advisorName: advisor.name,
      chat: await this.toChatDto(updatedChat, true),
      autoMessage: autoMessage ? this.toMessageDto(autoMessage) : null,
    };
  }

  private async sendQueueNoticeIfNeeded(
    chatId: string,
  ): Promise<WhatsappMessage | null> {
    const result = await this.chatRepo
      .createQueryBuilder()
      .update(WhatsappChat)
      .set({
        status: 'waiting',
        operationalStatus: 'queued',
        operationalStatusUpdatedAt: new Date(),
        assignedAdvisor: null,
        assignedAt: null,
        assignmentMode: null,
        queueNoticeSent: true,
        outOfHoursNoticeSent: false,
      })
      .where('id = :chatId', { chatId })
      .andWhere('status = :waiting', { waiting: 'waiting' })
      .andWhere('queue_notice_sent = false')
      .execute();
    if (!result.affected) return null;

    const chat = await this.findChatOrFail(chatId);
    const config = await this.configuracionService
      .getGlobal()
      .catch(() => null);
    const text = config?.whatsappQueueMsg?.trim() || this.defaultQueueMessage;
    return this.sendSystemMessage(chat, text, null);
  }

  private async sendOutOfHoursNoticeIfNeeded(
    chatId: string,
    horarioEstado: HorarioEstado,
  ): Promise<WhatsappMessage | null> {
    const result = await this.chatRepo
      .createQueryBuilder()
      .update(WhatsappChat)
      .set({
        status: 'waiting',
        operationalStatus: 'queued',
        operationalStatusUpdatedAt: new Date(),
        assignedAdvisor: null,
        assignedAt: null,
        assignmentMode: null,
        queueNoticeSent: false,
        outOfHoursNoticeSent: true,
      })
      .where('id = :chatId', { chatId })
      .andWhere('out_of_hours_notice_sent = false')
      .execute();
    if (!result.affected) return null;

    const chat = await this.findChatOrFail(chatId);
    const config = await this.configuracionService
      .getGlobal()
      .catch(() => null);
    const template =
      config?.whatsappOutOfHoursMsg?.trim() || this.defaultOutOfHoursMessage;
    const text = this.renderTemplate(template, undefined, horarioEstado);

    return this.sendSystemMessage(chat, text, null);
  }

  private async sendSystemMessage(
    chat: WhatsappChat,
    text: string,
    advisor: User | null,
  ): Promise<WhatsappMessage | null> {
    if (chat.isGroup) return null;

    let metaMessageId: string | null = null;
    let status: WhatsappMessageStatus = 'sent';

    try {
      const result = await this.sendTextMessage(this.getChatJid(chat), text);
      metaMessageId = result.messages?.[0]?.id ?? null;
    } catch (err: any) {
      status = 'failed';
      this.logger.error(
        `No se pudo enviar mensaje automatico a ${chat.phone}: ${err?.response?.data?.error?.message ?? err.message}`,
      );
    }

    let message: WhatsappMessage;
    try {
      message = await this.messageRepo.save(
        this.messageRepo.create({
          chat,
          metaMessageId,
          body: text,
          fromMe: true,
          senderName: advisor?.name ?? 'Sistema',
          participantJid: this.connectedJid,
          advisor,
          status,
          isAuto: true,
          type: 'text',
        }),
      );
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const existing = metaMessageId
        ? await this.messageRepo.findOne({ where: { metaMessageId } })
        : null;
      if (!existing) throw err;
      message = existing;
    }

    chat.lastMessageAt = new Date();
    await this.chatRepo.save(chat);
    return message;
  }

  private async findAvailableAdvisor(
    connectedAdvisorIds: string[],
  ): Promise<User | null> {
    const uniqueConnected = [...new Set(connectedAdvisorIds)].filter(Boolean);
    if (!uniqueConnected.length) return null;

    const maxChats = await this.getMaxActiveChatsPerAdvisor();
    const activeChats = await this.chatRepo.find({
      where: { status: 'active' },
      relations: ['assignedAdvisor'],
    });
    const activeCountByAdvisor = activeChats.reduce((acc, chat) => {
      if (chat.assignmentMode === 'fixed') return acc;
      const id = chat.assignedAdvisor?.id;
      if (!id) return acc;
      acc.set(id, (acc.get(id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    const lastAssignedByAdvisor = activeChats.reduce((acc, chat) => {
      const id = chat.assignedAdvisor?.id;
      if (!id || !chat.assignedAt) return acc;
      const time = new Date(chat.assignedAt).getTime();
      acc.set(id, Math.max(acc.get(id) ?? 0, time));
      return acc;
    }, new Map<string, number>());

    const advisors = await this.userRepo.find({
      where: {
        id: In(uniqueConnected),
        role: 'advisor',
        active: true,
        status: In(['online', 'Disponible']) as any,
      },
    });

    const available: User[] = [];
    for (const advisor of advisors) {
      const activeCount = activeCountByAdvisor.get(advisor.id) ?? 0;
      if (activeCount >= maxChats) continue;
      const [enAlmuerzo, enAlmuerzoRedis] = await Promise.all([
        this.configuracionService.estaEnAlmuerzo(advisor.id).catch(() => false),
        this.redisState.isOnLunch(advisor.id).catch(() => false),
      ]);
      if (enAlmuerzo || enAlmuerzoRedis) continue;
      available.push(advisor);
    }

    available.sort((a, b) => {
      const loadDiff =
        (activeCountByAdvisor.get(a.id) ?? 0) -
        (activeCountByAdvisor.get(b.id) ?? 0);
      if (loadDiff !== 0) return loadDiff;
      const assignedDiff =
        (lastAssignedByAdvisor.get(a.id) ?? 0) -
        (lastAssignedByAdvisor.get(b.id) ?? 0);
      if (assignedDiff !== 0) return assignedDiff;
      return a.name.localeCompare(b.name);
    });
    if (!available.length) return null;
    return available[0];
  }

  private async releaseExpiredActiveChats(): Promise<void> {
    const activeChats = await this.chatRepo.find({
      where: { status: 'active', isGroup: false },
      relations: ['assignedAdvisor'],
    });

    for (const chat of activeChats) {
      if (chat.operationalStatus !== 'resolved') continue;
      if (
        !this.shouldReleaseForCustomerIdle(
          chat.operationalStatusUpdatedAt ?? chat.updatedAt,
        )
      )
        continue;
      chat.status = 'closed';
      chat.operationalStatus = 'closed';
      chat.closedAt = new Date();
      chat.operationalStatusUpdatedAt = new Date();
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
      await this.chatRepo.save(chat);
    }
  }

  async countActiveChatsByAdvisor(advisorId: string): Promise<number> {
    return this.chatRepo.count({
      where: {
        status: 'active',
        assignedAdvisor: { id: advisorId },
      },
    });
  }

  async countActiveChatsByAdvisorExcludingFixed(
    advisorId: string,
  ): Promise<number> {
    return this.chatRepo.count({
      where: {
        status: 'active',
        assignedAdvisor: { id: advisorId },
        assignmentMode: Not('fixed'),
      },
    });
  }

  private async releaseFixedChatsForInactiveAdvisors(): Promise<void> {
    const chats = await this.chatRepo.find({
      where: {
        fixedAdvisor: Not(IsNull()),
        status: In(['waiting', 'active']),
      },
      relations: ['fixedAdvisor'],
    });
    for (const chat of chats) {
      const fa = chat.fixedAdvisor;
      if (!fa) continue;
      const stillValid = await this.userRepo.findOne({
        where: { id: fa.id, role: 'advisor', active: true },
      });
      if (stillValid) continue;
      chat.fixedAdvisor = null;
      chat.assignedAdvisor = null;
      chat.assignedAt = null;
      chat.assignmentMode = null;
      chat.status = 'waiting';
      chat.operationalStatus = 'queued';
      chat.queueNoticeSent = false;
      chat.outOfHoursNoticeSent = false;
      await this.chatRepo.save(chat);
    }
  }

  private async getMaxActiveChatsPerAdvisor(): Promise<number> {
    const config = await this.configuracionService.getGlobal().catch(() => null);
    const raw = Number(config?.whatsappMaxActiveChatsPerAdvisor);
    if (!Number.isFinite(raw) || raw < 1) return this.maxActiveChatsPerAdvisor;
    return Math.max(1, Math.min(50, Math.floor(raw)));
  }

  private priorityWeight(priority?: string | null): number {
    switch (priority) {
      case 'critical':
        return 0;
      case 'high':
        return 1;
      case 'low':
        return 3;
      case 'normal':
      default:
        return 2;
    }
  }

  private readonly byPriorityThenFifo = (
    a: WhatsappChat,
    b: WhatsappChat,
  ): number => {
    const pa = this.priorityWeight(a.priority);
    const pb = this.priorityWeight(b.priority);
    if (pa !== pb) return pa - pb;
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return ta - tb;
  };

  private async findFixedAdvisorIfAvailable(
    chat: WhatsappChat,
    connectedAdvisorIds: string[],
  ): Promise<User | null> {
    const fixedId = chat.fixedAdvisor?.id;
    if (!fixedId || !connectedAdvisorIds.includes(fixedId)) return null;

    const advisor = await this.userRepo.findOne({
      where: {
        id: fixedId,
        role: 'advisor',
        active: true,
        status: In(['online', 'Disponible']) as any,
      },
    });
    if (!advisor) return null;

    const [enAlmuerzo, enAlmuerzoRedis] = await Promise.all([
      this.configuracionService.estaEnAlmuerzo(advisor.id).catch(() => false),
      this.redisState.isOnLunch(advisor.id).catch(() => false),
    ]);
    return enAlmuerzo || enAlmuerzoRedis ? null : advisor;
  }

  private buildAdvisorStats(
    advisor: User,
    chats: WhatsappChat[],
    messages: WhatsappMessage[],
  ): WhatsappAdvisorStatsDto {
    const advisorChats = chats.filter(
      (chat) => chat.assignedAdvisor?.id === advisor.id,
    );
    const fixedClients = chats.filter(
      (chat) => chat.fixedAdvisor?.id === advisor.id,
    ).length;
    const advisorMessages = messages.filter(
      (message) => message.advisor?.id === advisor.id,
    );
    const lastMessageAt = advisorMessages[0]?.createdAt ?? advisor.createdAt;
    const idleMinutes = this.minutesSince(lastMessageAt);
    const closedChatIds = new Set(
      messages
        .filter(
          (message) =>
            message.advisor?.id === advisor.id &&
            message.chat?.status === 'closed',
        )
        .map((message) => message.chat.id),
    );
    const closedChats = closedChatIds.size;
    const manualChats = advisorChats.filter(
      (chat) =>
        chat.assignmentMode === 'manual' || chat.assignmentMode === 'admin',
    ).length;
    const avgResponseMinutes = this.averageAdvisorResponseMinutes(
      advisor.id,
      messages,
    );
    const activeChats = advisorChats.filter(
      (chat) => chat.status === 'active',
    ).length;
    const breached = advisorChats.filter((chat) =>
      this.isSlaBreached(chat, messages),
    ).length;
    const slaBreachedChats = advisorChats.filter(
      (chat) => !chat.isGroup && this.isSlaBreached(chat, messages),
    ).length;
    const frozenChats = advisorChats.filter(
      (chat) => chat.status === 'active' && this.computeChatSla(chat, messages).frozen,
    ).length;

    return {
      id: advisor.id,
      name: advisor.name,
      email: advisor.email,
      profilePhotoUrl: advisor.profilePhotoUrl ?? null,
      status: advisor.status,
      active: advisor.active,
      activeChats,
      closedChats,
      waitingCustomerChats: chats.filter(
        (chat) =>
          chat.operationalStatus === 'waiting_customer' &&
          chat.fixedAdvisor?.id === advisor.id,
      ).length,
      manualChats,
      fixedClients,
      avgResponseMinutes,
      idleMinutes,
      connectedMinutes:
        advisor.status === 'offline' || !advisor.active
          ? 0
          : Math.max(0, idleMinutes),
      pauseMinutes: ['Pausa', 'Almuerzo', 'Capacitacion'].includes(
        advisor.status,
      )
        ? idleMinutes
        : 0,
      slaPercent: activeChats
        ? Math.max(
            0,
            Math.round(((activeChats - breached) / activeChats) * 100),
          )
        : 100,
      slaBreachedChats,
      frozenChats,
      lastActivity: lastMessageAt?.toISOString(),
    };
  }

  private buildAdminAlerts(
    chats: WhatsappChat[],
    advisors: WhatsappAdvisorStatsDto[],
    messages: WhatsappMessage[],
  ): WhatsappAdminDashboardDto['alerts'] {
    const alerts: WhatsappAdminDashboardDto['alerts'] = [];
    for (const advisor of advisors) {
      if (
        advisor.active &&
        advisor.status !== 'offline' &&
        advisor.idleMinutes * 60000 >= this.advisorIdleWarningMs
      ) {
        alerts.push({
          type: 'advisor_idle',
          severity: advisor.idleMinutes >= 10 ? 'critical' : 'warning',
          title: 'Asesor idle',
          detail: `${advisor.name} lleva ${advisor.idleMinutes} min sin actividad.`,
          advisorId: advisor.id,
          timestamp: advisor.lastActivity,
        });
      }
      if (advisor.activeChats > this.maxActiveChatsPerAdvisor) {
        alerts.push({
          type: 'too_many_open',
          severity: 'warning',
          title: 'Demasiados chats abiertos',
          detail: `${advisor.name} tiene ${advisor.activeChats} chats activos.`,
          advisorId: advisor.id,
        });
      }
    }

    const queued = chats.filter(
      (chat) =>
        chat.status === 'waiting' &&
        chat.operationalStatus !== 'waiting_customer',
    );
    if (queued.length >= 5) {
      alerts.push({
        type: 'long_queue',
        severity: queued.length >= 10 ? 'critical' : 'warning',
        title: 'Cola larga',
        detail: `${queued.length} clientes esperan asignacion.`,
      });
    }

    for (const chat of chats) {
      const sla = this.computeChatSla(chat, messages);
      if (sla.slaBreached) {
        alerts.push({
          type: 'sla_breached',
          severity: 'critical',
          title: 'SLA vencido',
          detail: `${chat.name} espera respuesta hace ${this.formatDuration(sla.slaMinutesWaiting)} (plazo ${this.formatDuration(sla.slaDeadlineMinutes)}).`,
          chatId: chat.id,
          advisorId: chat.assignedAdvisor?.id,
          timestamp: (chat.lastClientMessageAt ?? chat.lastMessageAt)?.toISOString(),
        });
      } else if (sla.categoria === 'espera_respuesta') {
        alerts.push({
          type: 'espera_respuesta',
          severity: 'info',
          title: 'Esperando respuesta',
          detail: `${chat.name} espera respuesta hace ${this.formatDuration(sla.slaMinutesWaiting)} (plazo ${this.formatDuration(sla.slaDeadlineMinutes)}).`,
          chatId: chat.id,
          advisorId: chat.assignedAdvisor?.id,
          timestamp: chat.lastClientMessageAt?.toISOString(),
        });
      } else if (sla.categoria === 'soporte') {
        alerts.push({
          type: 'en_soporte',
          severity: 'info',
          title: 'En soporte tecnico',
          detail: `${chat.name} esta en soporte tecnico y no puede recibir respuesta del agente.`,
          chatId: chat.id,
          advisorId: chat.assignedAdvisor?.id,
          timestamp: chat.lastMessageAt?.toISOString(),
        });
      }
      if (sla.frozen) {
        alerts.push({
          type: 'frozen_chat',
          severity: 'warning',
          title: 'Chat congelado',
          detail: `${chat.name} no registra movimiento hace ${this.formatDuration(sla.frozenMinutes)}.`,
          chatId: chat.id,
          advisorId: chat.assignedAdvisor?.id,
          timestamp: chat.lastMessageAt?.toISOString(),
        });
      }
    }
    return alerts.slice(0, 30);
  }

  private averageAdvisorResponseMinutes(
    advisorId: string,
    messages: WhatsappMessage[],
  ): number {
    const ordered = [...messages]
      .filter((message) => message.chat?.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    const pendingByChat = new Map<string, Date>();
    const responseMinutes: number[] = [];

    for (const message of ordered) {
      const chatId = message.chat.id;
      if (!message.fromMe) {
        pendingByChat.set(chatId, message.createdAt);
        continue;
      }
      if (message.advisor?.id !== advisorId || !pendingByChat.has(chatId))
        continue;
      const started = pendingByChat.get(chatId)!;
      responseMinutes.push(
        Math.max(
          0,
          Math.round(
            (new Date(message.createdAt).getTime() -
              new Date(started).getTime()) /
              60000,
          ),
        ),
      );
      pendingByChat.delete(chatId);
    }

    if (!responseMinutes.length) return 0;
    return Math.round(
      responseMinutes.reduce((sum, value) => sum + value, 0) /
        responseMinutes.length,
    );
  }

  private isSlaBreached(
    chat: WhatsappChat,
    messages: WhatsappMessage[],
  ): boolean {
    return this.computeChatSla(chat, messages).slaBreached;
  }

  private slaDeadlineMinutes(chat: WhatsappChat): number {
    return this.slaMinutesByPriority[chat.priority ?? 'normal'] ?? 7;
  }

  private clientWroteLast(chat: WhatsappChat): boolean {
    if (!chat.lastClientMessageAt) return false;
    const lastClientAt = new Date(chat.lastClientMessageAt).getTime();
    const lastMessageAt = chat.lastMessageAt
      ? new Date(chat.lastMessageAt).getTime()
      : 0;
    return lastClientAt > 0 && lastMessageAt <= lastClientAt;
  }

  private computeChatCategoria(
    chat: WhatsappChat,
    lastClientAt: number,
    clientIsLast: boolean,
  ): 'cola' | 'gestion' | 'espera_respuesta' | 'sla_vencido' | 'esperando_cliente' | 'soporte' | 'resuelto' | 'cerrado' | 'grupo' {
    if (chat.status === 'closed') return 'cerrado';
    if (chat.isGroup) return 'grupo';
    if (chat.operationalStatus === 'resolved') return 'resuelto';
    if (chat.operationalStatus === 'waiting_customer') return 'esperando_cliente';
    if (chat.operationalStatus === 'waiting_technical') return 'soporte';
    if (chat.status === 'waiting' && !chat.fixedAdvisor && !!chat.lastClientMessageAt)
      return 'cola';
    if (clientIsLast) {
      const waitingMs = Date.now() - lastClientAt;
      return waitingMs >= this.slaDeadlineMinutes(chat) * 60 * 1000
        ? 'sla_vencido'
        : 'espera_respuesta';
    }
    return 'gestion';
  }

  private categoriaLabel(
    categoria:
      | 'cola'
      | 'gestion'
      | 'espera_respuesta'
      | 'sla_vencido'
      | 'esperando_cliente'
      | 'soporte'
      | 'resuelto'
      | 'cerrado'
      | 'grupo',
  ): string {
    const labels = {
      cola: 'En cola',
      gestion: 'En gestion',
      espera_respuesta: 'Esperando respuesta',
      sla_vencido: 'SLA vencido',
      esperando_cliente: 'Esperando cliente',
      soporte: 'Soporte tecnico',
      resuelto: 'Resuelto',
      cerrado: 'Cerrado',
      grupo: 'Grupo',
    } as const;
    return labels[categoria];
  }

  private computeChatSla(
    chat: WhatsappChat,
    _messages: Array<{ fromMe: boolean; createdAt?: Date; timestamp?: Date; chat?: { id?: string } }>,
  ): {
    slaState: 'in_time' | 'por_vencer' | 'vencido';
    slaBreached: boolean;
    slaMinutesWaiting: number;
    slaWaitingSince?: string;
    slaDeadlineMinutes: number;
    slaRemainingMinutes: number;
    frozen: boolean;
    frozenMinutes: number;
    clientWrote: boolean;
    categoria: string;
    categoriaLabel: string;
  } {
    const deadlineMinutes = this.slaDeadlineMinutes(chat);
    const base: {
      slaState: 'in_time' | 'por_vencer' | 'vencido';
      slaBreached: boolean;
      slaMinutesWaiting: number;
      slaWaitingSince?: string;
      slaDeadlineMinutes: number;
      slaRemainingMinutes: number;
      frozen: boolean;
      frozenMinutes: number;
      clientWrote: boolean;
      categoria: string;
      categoriaLabel: string;
    } = {
      slaState: 'in_time',
      slaBreached: false,
      slaMinutesWaiting: 0,
      slaWaitingSince: undefined,
      slaDeadlineMinutes: deadlineMinutes,
      slaRemainingMinutes: deadlineMinutes,
      frozen: false,
      frozenMinutes: 0,
      clientWrote: false,
      categoria: 'gestion',
      categoriaLabel: 'En gestion',
    };

    if (chat.isGroup) {
      base.categoria = 'grupo';
      base.categoriaLabel = 'Grupo';
      return base;
    }

    if (chat.status !== 'active' || !chat.lastClientMessageAt) {
      if (chat.status === 'closed') {
        base.categoria = 'cerrado';
        base.categoriaLabel = 'Cerrado';
      } else if (chat.status === 'waiting') {
        base.clientWrote = !!chat.lastClientMessageAt;
        if (!chat.fixedAdvisor && base.clientWrote) {
          base.categoria = 'cola';
          base.categoriaLabel = 'En cola';
          if (chat.lastClientMessageAt) {
            const cAt = new Date(chat.lastClientMessageAt).getTime();
            const mAt = chat.lastMessageAt
              ? new Date(chat.lastMessageAt).getTime()
              : 0;
            const refAt = Math.max(cAt, mAt);
            base.slaWaitingSince = new Date(refAt).toISOString();
            base.slaMinutesWaiting = Math.max(
              0,
              Math.floor((Date.now() - refAt) / 60000),
            );
          }
        }
      }
      return base;
    }

    const lastClientAt = new Date(chat.lastClientMessageAt).getTime();
    const lastMessageAt = chat.lastMessageAt
      ? new Date(chat.lastMessageAt).getTime()
      : 0;
    const clientIsLast = this.clientWroteLast(chat);
    base.clientWrote = true;

    const categoria = this.computeChatCategoria(
      chat,
      lastClientAt,
      clientIsLast,
    );
    base.categoria = categoria;
    base.categoriaLabel = this.categoriaLabel(categoria);

    const refAt = Math.max(lastMessageAt, lastClientAt);
    const waitingMs = Math.max(0, Date.now() - refAt);
    base.slaMinutesWaiting = Math.floor(waitingMs / 60000);
    base.slaWaitingSince = new Date(refAt).toISOString();

    const inSlaScope =
      categoria === 'espera_respuesta' || categoria === 'sla_vencido';

    if (inSlaScope) {
      const deadlineMs = deadlineMinutes * 60 * 1000;
      const slaWaitingMs = Math.max(0, Date.now() - lastClientAt);
      base.slaBreached = categoria === 'sla_vencido';
      base.slaState = base.slaBreached
        ? 'vencido'
        : slaWaitingMs >= deadlineMs * 0.8
          ? 'por_vencer'
          : 'in_time';
      base.slaRemainingMinutes = base.slaBreached
        ? -Math.floor((slaWaitingMs - deadlineMs) / 60000)
        : Math.ceil((deadlineMs - slaWaitingMs) / 60000);
    }

    if (chat.status === 'active') {
      base.frozenMinutes = this.minutesSince(chat.lastMessageAt);
      base.frozen =
        base.frozenMinutes >= this.frozenChatWarningMs / 60000;
    }

    return base;
  }

  private minutesSince(date?: Date | null): number {
    if (!date) return 0;
    return Math.max(
      0,
      Math.floor((Date.now() - new Date(date).getTime()) / 60000),
    );
  }

  private formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    if (m < 1) return 'menos de 1 min';
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const min = m % 60;
    const parts: string[] = [];
    if (d > 0) parts.push(d === 1 ? '1 día' : `${d} días`);
    if (h > 0) parts.push(`${h} h`);
    if (min > 0) parts.push(`${min} min`);
    return parts.length ? parts.join(' ') : '1 min';
  }

  private shouldReleaseForCustomerIdle(date?: Date | null): boolean {
    if (!date) return false;
    return Date.now() - new Date(date).getTime() >= this.customerIdleReleaseMs;
  }

  private async findChatOrFail(id: string): Promise<WhatsappChat> {
    const chat = await this.chatRepo.findOne({
      where: { id },
      relations: ['assignedAdvisor', 'fixedAdvisor'],
    });
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');
    return chat;
  }

  private async assertCanViewChat(
    chatId: string,
    advisorId: string,
    role: string,
  ): Promise<WhatsappChat> {
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      relations: ['assignedAdvisor', 'fixedAdvisor'],
    });
    if (!chat) throw new NotFoundException('Chat de WhatsApp no encontrado');
    if (role === 'admin') return chat;
    if (role !== 'advisor') {
      throw new ForbiddenException('No tienes permisos para ver este chat');
    }
    const assignedId = chat.assignedAdvisor?.id;
    const fixedId = chat.fixedAdvisor?.id;
    if (assignedId && assignedId !== advisorId && fixedId !== advisorId) {
      throw new ForbiddenException('Este chat esta asignado a otro agente');
    }
    return chat;
  }

  private async assertCanManageMetadata(
    chatId: string,
    _advisorId: string,
    _role: string,
  ): Promise<WhatsappChat> {
    return this.findChatOrFail(chatId);
  }

  private assertWhatsappUserRole(role: string): void {
    if (role !== 'advisor' && role !== 'admin') {
      throw new ForbiddenException(
        'Solo asesores o administradores pueden enviar mensajes de WhatsApp',
      );
    }
  }

  private async assertNoLunch(advisorId: string, role: string): Promise<void> {
    if (role === 'admin') return;
    const [enAlmuerzo, enAlmuerzoRedis] = await Promise.all([
      this.configuracionService.estaEnAlmuerzo(advisorId).catch(() => false),
      this.redisState.isOnLunch(advisorId).catch(() => false),
    ]);
    if (enAlmuerzo || enAlmuerzoRedis) {
      throw new ForbiddenException(
        'No puedes enviar mensajes mientras estas en almuerzo',
      );
    }
  }

  private assertAdminRole(role: string): void {
    if (role !== 'admin') {
      throw new ForbiddenException(
        'Solo administradores pueden ejecutar esta accion',
      );
    }
  }

  private assertWindowOpen(chat: WhatsappChat): void {
    if (!chat.lastClientMessageAt) {
      throw new ForbiddenException(
        'No hay ventana activa de WhatsApp para responder con texto libre',
      );
    }

    if (this.isWindowExpired(chat.lastClientMessageAt)) {
      throw new ForbiddenException(
        'La ventana de 24 horas esta cerrada. Usa una plantilla para reabrir la conversacion.',
      );
    }
  }

  private isWindowExpired(date?: Date | null): boolean {
    if (!date) return true;
    return (Date.now() - new Date(date).getTime()) / 3_600_000 >= 24;
  }

  private async toChatDto(
    chat: WhatsappChat,
    includeMessages = false,
  ): Promise<WaChatDto> {
    const messages = includeMessages
      ? await this.getMessagesInternal(chat.id, 1, 50)
      : [];
    const last =
      [...messages].reverse().find((message) => message.type !== 'reaction') ??
      messages[messages.length - 1];
    const lastPreview = last ? this.messagePreview(last) : '';
    const preview =
      chat.isGroup && last && !last.fromMe && last.senderName
        ? `${last.senderName}: ${lastPreview}`
        : lastPreview;
    const assigned = chat.assignedAdvisor;
    const assignmentStatus = chat.status;
    const isWaiting = !chat.isGroup && assignmentStatus === 'waiting';
    const isClosed = assignmentStatus === 'closed';

    return {
      id: chat.id,
      name: chat.name,
      role: chat.isGroup ? 'Grupo WhatsApp' : chat.role || 'Cliente WhatsApp',
      institution: chat.isGroup ? 'Grupo' : chat.institution || 'WhatsApp',
      institutionUrl: chat.institutionUrl || '',
      city: chat.city || '',
      avatar: chat.profilePictureUrl || this.avatarFor(chat.name || chat.phone),
      phone: chat.phone,
      jid: chat.jid ?? undefined,
      isGroup: chat.isGroup,
      email: chat.email || '',
      plan: chat.plan || 'WhatsApp',
      modules: chat.modules?.length ? chat.modules : ['Atencion'],
      stage: isClosed ? 'Cerrado' : isWaiting ? 'Pendiente' : 'Asignado',
      stageIdx: isClosed ? 2 : isWaiting ? 0 : 1,
      tag: isClosed ? 'cerrado' : isWaiting ? 'pendiente' : 'asignado',
      assignmentStatus,
      operationalStatus:
        chat.operationalStatus ?? this.inferOperationalStatus(chat),
      operationalStatusLabel: this.operationalStatusLabel(
        chat.operationalStatus ?? this.inferOperationalStatus(chat),
      ),
      assignmentMode: chat.assignmentMode ?? undefined,
      assignedTo: assigned?.id ?? '',
      assignedToName: assigned?.name ?? '',
      fixedAdvisorId: chat.fixedAdvisor?.id ?? null,
      fixedAdvisorName: chat.fixedAdvisor?.name ?? null,
      unread: chat.unreadCount ?? 0,
      preview,
      time: this.formatTime(chat.lastMessageAt ?? chat.updatedAt),
      status: isClosed ? 'offline' : isWaiting ? 'away' : 'online',
      notes: chat.notes ?? [],
      quickReplies: await this.getQuickReplyTexts(),
      lastClientMsg: chat.lastClientMessageAt ?? chat.updatedAt,
      messages,
      priority: chat.priority ?? 'normal',
      ...this.computeChatSla(chat, messages),
    };
  }

  private toChatDtoWithPreload(
    chat: WhatsappChat,
    messages: WhatsappMessage[],
    quickReplies: Array<{ name: string; content: string }>,
  ): WaChatDto {
    const dtos = messages.map((m) => this.toMessageDto(m));
    const last =
      [...dtos].reverse().find((message) => message.type !== 'reaction') ??
      dtos[dtos.length - 1];
    const lastPreview = last ? this.messagePreview(last) : '';
    const preview =
      chat.isGroup && last && !last.fromMe && last.senderName
        ? `${last.senderName}: ${lastPreview}`
        : lastPreview;
    const assigned = chat.assignedAdvisor;
    const assignmentStatus = chat.status;
    const isWaiting = !chat.isGroup && assignmentStatus === 'waiting';
    const isClosed = assignmentStatus === 'closed';

    return {
      id: chat.id,
      name: chat.name,
      role: chat.isGroup ? 'Grupo WhatsApp' : chat.role || 'Cliente WhatsApp',
      institution: chat.isGroup ? 'Grupo' : chat.institution || 'WhatsApp',
      institutionUrl: chat.institutionUrl || '',
      city: chat.city || '',
      avatar: chat.profilePictureUrl || this.avatarFor(chat.name || chat.phone),
      phone: chat.phone,
      jid: chat.jid ?? undefined,
      isGroup: chat.isGroup,
      email: chat.email || '',
      plan: chat.plan || 'WhatsApp',
      modules: chat.modules?.length ? chat.modules : ['Atencion'],
      stage: isClosed ? 'Cerrado' : isWaiting ? 'Pendiente' : 'Asignado',
      stageIdx: isClosed ? 2 : isWaiting ? 0 : 1,
      tag: isClosed ? 'cerrado' : isWaiting ? 'pendiente' : 'asignado',
      assignmentStatus,
      operationalStatus:
        chat.operationalStatus ?? this.inferOperationalStatus(chat),
      operationalStatusLabel: this.operationalStatusLabel(
        chat.operationalStatus ?? this.inferOperationalStatus(chat),
      ),
      assignmentMode: chat.assignmentMode ?? undefined,
      assignedTo: assigned?.id ?? '',
      assignedToName: assigned?.name ?? '',
      fixedAdvisorId: chat.fixedAdvisor?.id ?? null,
      fixedAdvisorName: chat.fixedAdvisor?.name ?? null,
      unread: chat.unreadCount ?? 0,
      preview,
      time: this.formatTime(chat.lastMessageAt ?? chat.updatedAt),
      status: isClosed ? 'offline' : isWaiting ? 'away' : 'online',
      notes: chat.notes ?? [],
      quickReplies,
      lastClientMsg: chat.lastClientMessageAt ?? chat.updatedAt,
      messages: dtos,
      priority: chat.priority ?? 'normal',
      ...this.computeChatSla(chat, messages),
    };
  }

  private toMessageDto(
    message: WhatsappMessage,
    quotedMap?: Map<string, { body: string; senderName: string }>,
  ): WaMessageDto {
    const quoted = message.replyToMessageId
      ? quotedMap?.get(message.replyToMessageId)
      : undefined;
    return {
      id: message.id,
      chatId: message.chat?.id,
      body:
        message.type === 'reaction' && message.body === this.removedReactionBody
          ? ''
          : message.body,
      fromMe: message.fromMe,
      timestamp: message.createdAt,
      status: message.status,
      isAuto: message.isAuto,
      type: message.type,
      senderName: message.senderName,
      advisorId: message.advisor?.id,
      participantJid: message.participantJid ?? undefined,
      mediaId: message.mediaId ?? undefined,
      mediaUrl: message.mediaUrl ?? undefined,
      mimeType: message.mimeType ?? undefined,
      fileName: message.fileName ?? undefined,
      fileSize: message.fileSize ?? undefined,
      editedAt: message.editedAt ?? undefined,
      metaMessageId: message.metaMessageId ?? undefined,
      reactionToMessageId:
        message.type === 'reaction'
          ? (message.mediaId ?? undefined)
          : undefined,
      reactionByName:
        message.type === 'reaction' ? message.senderName : undefined,
      reactionRemoved:
        message.type === 'reaction'
          ? !message.body || message.body === this.removedReactionBody
          : undefined,
      replyToMessageId: message.replyToMessageId ?? undefined,
      quotedBody: quoted?.body,
      quotedSender: quoted?.senderName,
      isForwarded: message.type === 'forwarded',
    };
  }

  private async toMessageDtoWithQuote(
    message: WhatsappMessage,
  ): Promise<WaMessageDto> {
    const dto = this.toMessageDto(message);
    if (!message.replyToMessageId) return dto;
    try {
      const quoted = await this.messageRepo.findOne({
        where: { metaMessageId: message.replyToMessageId },
        select: ['metaMessageId', 'body', 'senderName'],
      });
      if (quoted?.metaMessageId) {
        return this.toMessageDto(
          message,
          new Map([
            [
              quoted.metaMessageId,
              { body: quoted.body, senderName: quoted.senderName },
            ],
          ]),
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `No se pudo cargar cita para ${message.replyToMessageId}: ${
          err?.message ?? err
        }`,
      );
    }
    return dto;
  }

  private inferOperationalStatus(
    chat: WhatsappChat,
  ): WhatsappOperationalStatus {
    if (chat.status === 'closed') return 'closed';
    if (chat.status === 'active')
      return chat.assignedAt ? 'in_progress' : 'assigned';
    return chat.lastClientMessageAt ? 'queued' : 'new';
  }

  private operationalStatusLabel(status: WhatsappOperationalStatus): string {
    const labels: Record<WhatsappOperationalStatus, string> = {
      new: 'Nuevo',
      queued: 'En cola',
      assigned: 'Asignado',
      in_progress: 'En gestion',
      waiting_customer: 'Esperando cliente',
      waiting_technical: 'Esperando area tecnica',
      resolved: 'Resuelto',
      released: 'En cola',
      closed: 'Cerrado',
    };
    return labels[status] ?? 'Nuevo';
  }

  private safeDisplayText(
    value: unknown,
    maxLength = this.maxCaptionLength,
  ): string {
    return cleanText(value, maxLength);
  }

  private compactLogText(value: string): string {
    const clean = cleanText(value, 4096);
    return clean.length > 120 ? `${clean.slice(0, 120)}...` : clean;
  }

  private assertAllowedMedia(file: Express.Multer.File): void {
    const mimeType = this.normalizeMimeType(file.mimetype);
    const ext = extname(
      sanitizeFileName(file.originalname, mimeType),
    ).toLowerCase();
    const allowedByExt =
      this.isArchiveFileExt(ext) &&
      (mimeType === 'application/octet-stream' || mimeType === '');
    if (!this.allowedMediaMimes.has(mimeType) && !allowedByExt) {
      throw new BadRequestException(
        'Tipo de archivo no permitido para WhatsApp',
      );
    }
    const expected = this.extFromMime(mimeType);
    if (
      expected &&
      ext &&
      ext !== expected &&
      !this.isCompatibleExtension(mimeType, ext)
    ) {
      throw new BadRequestException(
        'La extension del archivo no coincide con su contenido',
      );
    }
  }

  private isArchiveFileExt(ext = ''): boolean {
    return ['.zip', '.rar', '.7z'].includes(ext);
  }

  private normalizeMimeType(mimeType = ''): string {
    return mimeType.toLowerCase().split(';')[0].trim();
  }

  private isCompatibleExtension(mimeType: string, ext: string): boolean {
    const compatible: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'audio/mpeg': ['.mp3', '.mpeg'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx',
      ],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        ['.pptx'],
    };
    return compatible[mimeType]?.includes(ext) ?? false;
  }

  private isVoiceNoteMime(mimeType = ''): boolean {
    const normalized = this.normalizeMimeType(mimeType);
    return (
      normalized === 'audio/ogg' ||
      normalized === 'audio/opus' ||
      normalized === 'audio/webm'
    );
  }

  private messagePreview(message: WaMessageDto): string {
    if (message.type === 'reaction') {
      return message.body ? `Reaccion ${message.body}` : 'Reaccion';
    }
    const body = this.safeDisplayText(message.body);
    if (body && !this.isLegacyMediaFallback(body)) return body;
    if (message.type && message.type !== 'text') {
      return this.mediaFallbackBody(this.normalizeIncomingType(message.type));
    }
    return body;
  }

  private async getQuickReplyTexts(): Promise<
    Array<{ name: string; content: string }>
  > {
    const replies = await this.getQuickReplies();
    return replies.map((reply) => ({
      name: reply.name,
      content: reply.content,
    }));
  }

  private normalizeQuickReplies(
    value: unknown,
  ): Array<{ name: string; content: string }> {
    if (!Array.isArray(value) || !value.length) return this.defaultQuickReplies;

    const first = value[0];

    if (typeof first === 'string') {
      return value
        .map((reply) => {
          const text = cleanText(reply);
          if (!text) return null;
          return { name: text.slice(0, 60), content: text };
        })
        .filter(Boolean) as Array<{ name: string; content: string }>;
    }

    const replies = value
      .filter((r: any) => r?.name && r?.content)
      .map((r: any) => ({
        name: String(r.name).slice(0, 60),
        content: String(r.content).slice(0, 500),
      }));

    return replies.length ? replies : this.defaultQuickReplies;
  }

  private quickReplyShortcut(text: string, index: number): string {
    const firstWord = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)[0];
    return firstWord || `respuesta${index + 1}`;
  }

  private renderTemplate(
    template: string,
    advisorName?: string,
    horarioEstado?: HorarioEstado,
  ): string {
    return template
      .replace(/\{\{\s*(advisor|asesor|agente)\s*\}\}/gi, advisorName ?? 'Agente')
      .replace(
        /\{\{\s*proximaApertura\s*\}\}/gi,
        horarioEstado?.proximaApertura ?? '',
      )
      .replace(
        /\{\{\s*horaApertura\s*\}\}/gi,
        horarioEstado?.horaApertura ?? '',
      );
  }

  private normalizeUrl(value: unknown): string | null {
    const raw = this.safeDisplayText(value, this.maxMetadataLength);
    if (!raw) return null;
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return null;
      return parsed.toString().slice(0, this.maxMetadataLength);
    } catch {
      return null;
    }
  }

  private normalizePhone(phone: string): string {
    return (phone ?? '').replace(/[\s+\-()]/g, '');
  }

  private messageBody(message: IncomingWhatsappMessage): string {
    if (message.type === 'reaction')
      return this.cleanReactionEmoji(message.text) || this.removedReactionBody;
    const clean = sanitizeOutboundText(message.text, this.maxCaptionLength);
    if (clean) return clean;
    return message.type === 'text' ? this.safeDisplayText(message.text) : '';
  }

  private cleanReactionEmoji(value: unknown): string {
    const text = this.safeDisplayText(value, 16).trim();
    if (!text || /^enc:v\d+:/i.test(text)) return '';
    if (text === this.removedReactionBody) return '';
    const map: Record<string, string> = {
      '\u{1F44D}': '\u{1F44D}',
      '\u2705': '\u2705',
      '\u274C': '\u274C',
      '\u2611\uFE0F': '\u2705',
      '\u2714\uFE0F': '\u2705',
      '\u2713': '\u2705',
      x: '\u274C',
      X: '\u274C',
    };
    return map[text] ?? '';
  }

  private async attachIncomingMedia(
    message: WhatsappMessage,
    raw: IncomingWhatsappMessage,
  ): Promise<WhatsappMessage> {
    if (!this.isDownloadableMedia(raw)) return message;

    try {
      const buffer = await downloadMediaMessage(raw.rawMessage, 'buffer', {});
      const fileName = sanitizeFileName(
        raw.fileName ||
          `${raw.type}-${raw.mediaId || raw.messageId}${this.extFromMime(raw.mimeType)}`,
        raw.mimeType,
      );
      message.mediaUrl = await this.saveMediaBuffer(
        buffer,
        fileName,
        raw.mimeType || '',
      );
      message.mediaId = raw.mediaId ?? null;
      message.mimeType = raw.mimeType || '';
      message.fileName = fileName;
      message.fileSize = buffer.length;
      return this.messageRepo.save(message);
    } catch (err: any) {
      this.logger.warn(
        `No se pudo descargar media entrante ${raw.mediaId}: ${err?.message ?? err}`,
      );
      return message;
    }
  }

  private isDownloadableMedia(
    raw: IncomingWhatsappMessage,
  ): raw is IncomingWhatsappMessage & { rawMessage: WAMessage } {
    if (!raw.rawMessage || !raw.mediaId) return false;
    return (
      raw.type === 'image' ||
      raw.type === 'video' ||
      raw.type === 'audio' ||
      raw.type === 'document' ||
      raw.type === 'sticker'
    );
  }

  private async saveLocalMedia(file: Express.Multer.File): Promise<string> {
    const mimeType = this.normalizeMimeType(file.mimetype);
    return this.saveMediaBuffer(
      file.buffer,
      sanitizeFileName(file.originalname, mimeType),
      mimeType,
    );
  }

  private async saveMediaBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType = '',
  ): Promise<string> {
    const uploadsDir = join(process.cwd(), 'uploads', 'whatsapp');
    await mkdir(uploadsDir, { recursive: true });

    const ext =
      this.extFromMime(mimeType) || extname(originalName).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await writeFile(join(uploadsDir, filename), buffer);

    const backendUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:3001';
    return `${backendUrl}/uploads/whatsapp/${filename}`;
  }

  private extractIncomingMedia(msg: any): {
    id?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  } {
    const media = msg.image ?? msg.video ?? msg.audio ?? msg.document ?? null;
    return {
      id: media?.id,
      mimeType: media?.mime_type,
      fileName: media?.filename,
      caption: media?.caption,
    };
  }

  private mediaTypeFromMime(mimeType: string): WhatsappMediaType {
    const normalized = this.normalizeMimeType(mimeType);
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private normalizeIncomingType(type: string): WhatsappMediaType {
    return type === 'image' ||
      type === 'video' ||
      type === 'audio' ||
      type === 'document' ||
      type === 'sticker'
      ? type
      : 'document';
  }

  private mediaFallbackBody(type: WhatsappMediaType, fileName = ''): string {
    const label = {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
      sticker: 'Sticker',
    }[type];
    return fileName ? label : label;
  }

  private isLegacyMediaFallback(value: string): boolean {
    return /^\[(Imagen|Video|Audio|Documento|Sticker)(:|\srecibido|\])/i.test(
      value.trim(),
    );
  }

  private extFromMime(mimeType = ''): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',

      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',

      'audio/aac': '.aac',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/amr': '.amr',
      'audio/webm': '.webm',

      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/csv': '.csv',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        '.pptx',
    };

    return map[this.normalizeMimeType(mimeType)] ?? '';
  }

  private avatarFor(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=25D366&color=fff`;
  }

  private formatTime(date?: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const hh = String(bogota.getUTCHours()).padStart(2, '0');
    const mm = String(bogota.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
