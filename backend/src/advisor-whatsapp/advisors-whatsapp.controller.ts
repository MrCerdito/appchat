import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Res,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TicketsService } from '../tickets/tickets.service';
import {
  AdvisorsWhatsappService,
  UpdateWhatsappContactInput,
} from './advisors-whatsapp.service';
import { AdvisorsWhatsappGateway } from './advisors-whatsapp.gateway';
import { TeamsMeetingsService } from './teams-meetings.service';
import { WhatsappMessage } from './entities/whatsapp-message.entity';

@Controller('advisors-whatsapp')
export class AdvisorsWhatsappController {
  private readonly logger = new Logger(AdvisorsWhatsappController.name);

  constructor(
    private readonly whatsappService: AdvisorsWhatsappService,
    private readonly whatsappGateway: AdvisorsWhatsappGateway,
    private readonly teamsService: TeamsMeetingsService,
    private readonly config: ConfigService,
    private readonly ticketsService: TicketsService,
    @InjectRepository(WhatsappMessage)
    private readonly waMessageRepo: Repository<WhatsappMessage>,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken =
      this.config.get<string>('WHATSAPP_VERIFY_TOKEN') ?? 'token2025';

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook de asesores verificado por Meta.');
      return challenge;
    }

    this.logger.warn('Verificacion de webhook fallida.');
    return 'Error validating webhook';
  }

  @Post('webhook')
  @HttpCode(200)
  receiveWebhook(@Body() _body: any) {
    this.logger.warn(
      'Webhook Cloud API ignorado: el transporte activo es Baileys por QR.',
    );
    return { ok: true, transport: 'baileys' };
  }

  @Get('chats')
  @UseGuards(JwtAuthGuard)
  listChats(
    @Req() req: Request & { user: any },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
    const l = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50)) : undefined;
    return this.whatsappService.listChats(req.user.id, req.user.role, p, l);
  }

  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard)
  getAdminDashboard(@Req() req: Request & { user: any }) {
    return this.whatsappService.getAdminDashboard(req.user.role);
  }

  @Get('connection')
  @UseGuards(JwtAuthGuard)
  getConnection() {
    return this.whatsappService.getConnectionStatus();
  }

  @Post('connection/restart')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  restartConnection() {
    return this.whatsappService.restartConnection();
  }

  @Post('connection/logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  logoutConnection() {
    return this.whatsappService.logoutConnection();
  }

  @Get('chats/:chatId/messages')
  @UseGuards(JwtAuthGuard)
  getMessages(
    @Param('chatId') chatId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService.getMessages(
      chatId,
      +page,
      +limit,
      req.user.id,
      req.user.role,
    );
  }

  @Patch('chats/:chatId/messages/:messageId')
  @UseGuards(JwtAuthGuard)
  editMessage(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Body('body') body: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .editAdvisorMessage(chatId, messageId, req.user.id, req.user.role, body)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Delete('chats/:chatId/messages/:messageId')
  @UseGuards(JwtAuthGuard)
  deleteMessage(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .deleteAdvisorMessage(chatId, messageId, req.user.id, req.user.role)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Post('chats/:chatId/messages/:messageId/reaction')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  reactToMessage(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .reactToMessage(
        chatId,
        messageId,
        req.user.id,
        req.user.role,
        emoji ?? '',
      )
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Patch('chats/:chatId/note')
  @UseGuards(JwtAuthGuard)
  saveNote(
    @Param('chatId') chatId: string,
    @Body('note') note: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .addNote(chatId, note, req.user.id, req.user.role)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Post('chats/:chatId/notes/:index/delete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  deleteNote(
    @Param('chatId') chatId: string,
    @Param('index') index: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .deleteNote(chatId, +index, req.user.id, req.user.role)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Patch('chats/:chatId/tags')
  @UseGuards(JwtAuthGuard)
  updateTags(
    @Param('chatId') chatId: string,
    @Body('tags') tags: string[],
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .updateTags(chatId, tags, req.user.id, req.user.role)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Patch('chats/:chatId/contact')
  @UseGuards(JwtAuthGuard)
  updateContact(
    @Param('chatId') chatId: string,
    @Body() body: UpdateWhatsappContactInput,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .updateContactInfo(chatId, body, req.user.id, req.user.role)
      .then((chat) => {
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
      });
  }

  @Post('chats/:chatId/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  markRead(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.whatsappService
      .markRead(chatId, req.user.id, req.user.role)
      .then(() => ({ ok: true }));
  }

  @Post('chats/:chatId/take')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async takeChat(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
  ) {
    const assignment = await this.whatsappService.takeQueuedChat(
      chatId,
      req.user.id,
      req.user.role,
    );
    this.whatsappGateway.emitAssignments([assignment]);
    return assignment.chat;
  }

  @Post('chats/:chatId/admin-assign')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async adminAssignChat(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
    @Body()
    body: { advisorId: string; mode?: 'admin' | 'temporary'; message?: string },
  ) {
    const assignment = await this.whatsappService.adminAssignChat(
      chatId,
      body.advisorId,
      req.user.role,
      body.mode ?? 'admin',
      body.message,
    );
    this.whatsappGateway.emitAssignments([assignment]);
    return assignment.chat;
  }

  @Post('chats/:chatId/fixed-advisor')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async setFixedAdvisor(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
    @Body('advisorId') advisorId: string,
  ) {
    const chat = await this.whatsappService.setFixedAdvisor(
      chatId,
      advisorId,
      req.user.role,
    );
    this.whatsappGateway.emitChatUpdated(chat);
    return chat;
  }

  @Post('chats/:chatId/fixed-advisor/delete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async clearFixedAdvisor(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
  ) {
    const chat = await this.whatsappService.clearFixedAdvisor(
      chatId,
      req.user.role,
    );
    this.whatsappGateway.emitChatUpdated(chat);
    return chat;
  }

  @Patch('chats/:chatId/operational-status')
  @UseGuards(JwtAuthGuard)
  async updateOperationalStatus(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
    @Body('status') status: any,
  ) {
    const chat = await this.whatsappService.updateOperationalStatus(
      chatId,
      status,
      req.user.id,
      req.user.role,
    );
    this.whatsappGateway.emitChatUpdated(chat);
    return chat;
  }

  @Patch('chats/:chatId/priority')
  @UseGuards(JwtAuthGuard)
  async updateChatPriority(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
    @Body('priority') priority: string,
  ) {
    const chat = await this.whatsappService.updateChatPriority(
      chatId,
      priority as any,
      req.user.role,
    );
    this.whatsappGateway.emitChatUpdated(chat);
    return chat;
  }

  @Post('chats/:chatId/close')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async closeChat(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
  ) {
    const closed = await this.whatsappService.closeChat(
      chatId,
      req.user.id,
      req.user.role,
    );
    this.whatsappGateway.emitChatUpdated(closed);
    const assignments = await this.whatsappService.assignWaitingChats(
      this.whatsappGateway.getConnectedAdvisorIds(),
    );
    this.whatsappGateway.emitAssignments(assignments);
    return closed;
  }

  @Get('quick-replies')
  @UseGuards(JwtAuthGuard)
  getQuickReplies() {
    return this.whatsappService.getQuickReplies();
  }

  @Get('teams/status')
  @UseGuards(JwtAuthGuard)
  getTeamsStatus(@Req() req: Request & { user: any }) {
    return this.teamsService.getStatus(req.user.id);
  }

  @Post('teams/auth-url')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  getTeamsAuthUrl(@Req() req: Request & { user: any }) {
    return this.teamsService.createAuthUrl(req.user.id);
  }

  @Get('teams/oauth/callback')
  async completeTeamsAuth(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Query('error_description') oauthErrorDescription: string,
    @Res() res: any,
  ) {
    try {
      if (oauthError) {
        throw new Error(oauthErrorDescription || oauthError);
      }
      await this.teamsService.completeAuth(code, state);
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      );
      res.type('html').send(this.teamsCallbackHtml(true));
    } catch (err: any) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      );
      res
        .type('html')
        .status(400)
        .send(this.teamsCallbackHtml(false, err?.message));
    }
  }

  @Post('chats/:chatId/teams-meeting')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async createTeamsMeeting(
    @Param('chatId') chatId: string,
    @Req() req: Request & { user: any },
    @Body()
    body: {
      subject: string;
      startDateTime: string;
      durationMinutes?: number;
      calendarTarget?: 'personal' | 'shared' | 'none';
    },
  ) {
    const chat = await this.whatsappService.getChatForAdvisor(
      chatId,
      req.user.id,
      req.user.role,
    );
    const meeting = await this.teamsService.createMeeting(req.user.id, body);
    const text = this.teamsWhatsappText(
      meeting.subject,
      meeting.startDateTime,
      meeting.joinUrl,
    );

    const result = await this.whatsappService.sendAdvisorText(
      req.user.id,
      req.user.role,
      chat.jid || chat.phone,
      text,
    );
    this.whatsappGateway.emitIncoming({
      chat: result.chat,
      message: result.message,
      assignedAdvisorId: result.chat.assignedTo,
    });

    if (body.calendarTarget && body.calendarTarget !== 'none') {
      try {
        await this.teamsService.createCalendarEvent(
          req.user.id,
          body.calendarTarget,
          meeting,
          {
            name: chat.name,
            role: chat.role,
            institution: chat.institution,
            phone: chat.phone,
            email: chat.email,
          },
        );
      } catch (err: any) {
        this.logger.warn(
          `No se pudo agendar al calendario: ${err?.message ?? err}`,
        );
      }
    }

    return { ok: true, meeting, chat: result.chat };
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Headers('x-api-key') _apiKey: string,
    @Req() req: Request & { user: any },
    @Body() body: { to: string; text: string },
  ) {
    const { to, text } = body;
    if (!to || !text) {
      return { ok: false, error: 'Los campos "to" y "text" son obligatorios.' };
    }

    try {
      const result = await this.whatsappService.sendAdvisorText(
        req.user.id,
        req.user.role,
        to,
        text,
      );
      this.whatsappGateway.emitIncoming({
        chat: result.chat,
        message: result.message,
        assignedAdvisorId: result.chat.assignedTo,
      });
      return { ok: true, messageId: result.message.id, chat: result.chat };
    } catch (err: any) {
      const metaError = err.response?.data;
      this.logger.error('Error enviando mensaje:', metaError ?? err.message);
      return { ok: false, error: metaError ?? err.message };
    }
  }

  @Post('send-template')
  @UseGuards(JwtAuthGuard)
  async sendTemplate(
    @Headers('x-api-key') _apiKey: string,
    @Req() req: Request & { user: any },
    @Body()
    body: {
      to: string;
      templateName: string;
      langCode?: string;
      components?: any[];
    },
  ) {
    const { to, templateName, langCode = 'es_CO', components = [] } = body;

    if (!to || !templateName) {
      return {
        ok: false,
        error: 'Los campos "to" y "templateName" son obligatorios.',
      };
    }

    try {
      const result = await this.whatsappService.sendAdvisorTemplate(
        req.user.id,
        req.user.role,
        to,
        templateName,
        langCode,
        components,
      );
      return {
        ok: true,
        messageId: result.messageId ?? result.message.id,
        chat: result.chat,
      };
    } catch (err: any) {
      const metaError = err.response?.data;
      this.logger.error('Error enviando plantilla:', metaError ?? err.message);
      return { ok: false, error: metaError ?? err.message };
    }
  }

  @Post('send-media')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'whatsapp');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = file.originalname.split('.').pop() || 'bin';
          cb(null, `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
        },
      }),
      limits: { fileSize: 64 * 1024 * 1024 },
    }),
  )
  async sendMedia(
    @Req() req: Request & { user: any },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { to: string; caption?: string },
  ) {
    if (!body.to || !file) {
      return { ok: false, error: 'Los campos "to" y "file" son obligatorios.' };
    }

    try {
      const result = await this.whatsappService.sendAdvisorMedia(
        req.user.id,
        req.user.role,
        body.to,
        file,
        body.caption ?? '',
      );
      this.whatsappGateway.emitIncoming({
        chat: result.chat,
        message: result.message,
        assignedAdvisorId: result.chat.assignedTo,
      });
      return { ok: true, messageId: result.message.id, chat: result.chat };
    } catch (err: any) {
      const metaError = err.response?.data;
      this.logger.error('Error enviando archivo:', metaError ?? err.message);
      return { ok: false, error: metaError ?? err.message };
    }
  }

  @Post(':id/ticket')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTicketFromWhatsapp(
    @Param('id') id: string,
    @Body()
    body: {
      titulo?: string;
      descripcion?: string;
      priority?: string;
      category?: string;
    },
    @Req() req: Request & { user: any },
  ) {
    const chat = await this.whatsappService.getChatById(id);

    const messages = await this.waMessageRepo.find({
      where: { chat: { id } },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    messages.reverse();

    const conversation = messages.map((m) => ({
      role: m.fromMe ? 'advisor' : 'client',
      name: m.senderName || (m.fromMe ? 'Asesor' : chat.name),
      content: m.body,
      type: m.type || 'text',
      mediaUrl: m.mediaUrl || null,
      timestamp: m.createdAt,
    }));

    const dto = {
      titulo: body.titulo ?? `Ticket desde WhatsApp - ${chat.name}`,
      descripcion: body.descripcion ?? undefined,
      priority: body.priority ?? 'medium',
      category: body.category ?? undefined,
      sourceType: 'whatsapp' as const,
      sourceId: id,
      clientName: chat.name || 'Cliente WhatsApp',
      clientInfo: {
        phone: chat.phone,
        institution: chat.institution,
        role: chat.role,
        city: chat.city,
      },
      conversation,
    };
    return this.ticketsService.create(dto, req.user.id);
  }

  private teamsWhatsappText(
    subject: string,
    startDateTime: string,
    joinUrl: string,
  ): string {
    const formatted = new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(new Date(startDateTime));
    return `Hola, te comparto el enlace para nuestra reunion en Microsoft Teams.\n\nReunion: ${subject}\nHora: ${formatted}\nLink: ${joinUrl}`;
  }

  private teamsCallbackHtml(success: boolean, error = ''): string {
    const title = success ? 'Teams conectado' : 'No se pudo conectar Teams';
    const safeTitle = this.escapeHtml(title);
    const message = success
      ? 'Ya puedes volver a InnovaCloud y crear la reunion.'
      : error || 'Autorizacion fallida';
    const safeMessage = this.escapeHtml(message);
    const payload = JSON.stringify({
      type: 'teams-auth',
      success,
      error: success ? '' : error || 'Autorizacion fallida',
    });
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1219;color:#edf4f7;font-family:Segoe UI,system-ui,sans-serif}main{max-width:460px;padding:28px;text-align:center}h1{font-size:22px}p{color:#93a4af;line-height:1.5}button{height:38px;padding:0 16px;border:0;border-radius:8px;background:#20c997;color:#04110d;font-weight:800;cursor:pointer}</style></head><body><main><h1>${safeTitle}</h1><p>${safeMessage}</p><button onclick="window.close()">Cerrar</button></main><script>try{window.opener&&window.opener.postMessage(${payload},'*')}catch(e){}</script></body></html>`;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
