import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { extname, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { Repository, In } from 'typeorm';
import { Subject } from 'rxjs';
import { User } from '../auth/entities/user.entity';
import { InternalConversation } from './entities/internal-conversation.entity';
import { InternalConversationMember } from './entities/internal-conversation-member.entity';
import { InternalMessage } from './entities/internal-message.entity';
import { cleanText, sanitizeFileName } from '../common/security/sanitize.helper';

export interface InternalChatUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePhotoUrl: string | null;
}

export interface InternalMessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderRole: string;
  body: string;
  type: 'text' | 'image' | 'audio' | 'file' | 'system';
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  durationMs: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  replyToMessageId: string | null;
  isForwarded: boolean;
  reactionToMessageId: string | null;
  reactionEmoji: string | null;
  reactions: { userId: string; name: string; emoji: string }[];
  createdAt: Date;
}

export interface InternalConversationDto {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  members: InternalChatUserDto[];
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string;
    senderName: string;
    createdAt: Date;
    type: string;
    deleted: boolean;
  } | null;
}

export interface InternalReactionDto {
  conversationId: string;
  messageId: string;
  reactions: { userId: string; name: string; emoji: string }[];
}

@Injectable()
export class InternalChatService implements OnModuleInit {
  private readonly logger = new Logger(InternalChatService.name);

  readonly conversationUpdates$ = new Subject<{
    conversation: InternalConversationDto;
    memberIds: string[];
  }>();
  readonly newMessages$ = new Subject<{
    conversationId: string;
    message: InternalMessageDto;
    memberIds: string[];
  }>();
  readonly messageEdited$ = new Subject<{
    conversationId: string;
    message: InternalMessageDto;
    memberIds: string[];
  }>();
  readonly messageDeleted$ = new Subject<{
    conversationId: string;
    messageId: string;
    deletedAt: Date;
    memberIds: string[];
  }>();
  readonly reactionUpdated$ = new Subject<{
    reaction: InternalReactionDto;
    memberIds: string[];
  }>();
  readonly unreadUpdates$ = new Subject<{
    conversationId: string;
    userId: string;
    unreadCount: number;
  }>();

  private readonly maxCaptionLength = 1000;
  private readonly maxBodyLength = 4000;
  private readonly maxMediaBytes = 64 * 1024 * 1024;
  private readonly editWindowMs = 15 * 60 * 1000;
  private readonly supportGroupName = 'Grupo de soporte';
  private readonly allowedMediaMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/opus',
    'audio/amr',
    'audio/webm',
    'video/mp4',
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
  ]);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(InternalConversation)
    private readonly conversationRepo: Repository<InternalConversation>,
    @InjectRepository(InternalConversationMember)
    private readonly memberRepo: Repository<InternalConversationMember>,
    @InjectRepository(InternalMessage)
    private readonly messageRepo: Repository<InternalMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInternalChatSchema();
    await this.ensureSupportGroup();
    this.logger.log('Chat interno listo.');
  }

  // ── Schema (prod has synchronize off) ─────────────────────────────────────
  private async ensureInternalChatSchema(): Promise<void> {
    await this.conversationRepo.query(`
      CREATE TABLE IF NOT EXISTS public.internal_conversations (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        type varchar(10) NOT NULL DEFAULT 'group',
        name varchar(120) NULL,
        created_by uuid NULL,
        last_message_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_internal_conversations PRIMARY KEY (id),
        CONSTRAINT fk_internal_conversations_created_by
          FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
      )
    `);
    await this.conversationRepo.query(`
      CREATE TABLE IF NOT EXISTS public.internal_conversation_members (
        conversation_id uuid NOT NULL,
        user_id uuid NOT NULL,
        unread_count integer NOT NULL DEFAULT 0,
        last_read_at timestamptz NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_internal_conversation_members
          PRIMARY KEY (conversation_id, user_id),
        CONSTRAINT fk_internal_members_conversation
          FOREIGN KEY (conversation_id)
          REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_internal_members_user
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
      )
    `);
    await this.conversationRepo.query(`
      CREATE TABLE IF NOT EXISTS public.internal_messages (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL,
        sender_id uuid NULL,
        body text NOT NULL DEFAULT '',
        type varchar(10) NOT NULL DEFAULT 'text',
        media_url text NULL,
        media_mime_type varchar(120) NULL,
        media_name varchar(255) NULL,
        media_size integer NULL,
        duration_ms integer NULL,
        media_width integer NULL,
        media_height integer NULL,
        edited_at timestamptz NULL,
        deleted_at timestamptz NULL,
        reply_to_message_id uuid NULL,
        is_forwarded boolean NOT NULL DEFAULT false,
        reaction_to_message_id uuid NULL,
        reaction_emoji varchar(32) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_internal_messages PRIMARY KEY (id),
        CONSTRAINT fk_internal_messages_conversation
          FOREIGN KEY (conversation_id)
          REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_internal_messages_sender
          FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE SET NULL
      )
    `);
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_conversations_type ON public.internal_conversations(type)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_conversations_last_message_at
       ON public.internal_conversations(last_message_at)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_conversation_members_user_id
       ON public.internal_conversation_members(user_id)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_messages_conversation_id_created_at
       ON public.internal_messages(conversation_id, created_at)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_messages_sender_id
       ON public.internal_messages(sender_id)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_messages_reply_to_id
       ON public.internal_messages(reply_to_message_id)`,
    );
    await this.conversationRepo.query(
      `CREATE INDEX IF NOT EXISTS idx_internal_messages_reaction_to_id
       ON public.internal_messages(reaction_to_message_id)`,
    );
  }

  // ── Support group ──────────────────────────────────────────────────────────
  private async ensureSupportGroup(): Promise<void> {
    let group = await this.conversationRepo.findOne({
      where: { type: 'group', name: this.supportGroupName },
    });
    if (!group) {
      group = await this.conversationRepo.save(
        this.conversationRepo.create({
          type: 'group',
          name: this.supportGroupName,
          lastMessageAt: null,
        }),
      );
      this.logger.log(`Grupo de soporte creado: ${group.id}`);
    }
    const advisors = await this.listAdvisors();
    const existing = await this.memberRepo.find({
      where: { conversationId: group.id },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const missing = advisors
      .map((a) => a.id)
      .filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      await this.memberRepo
        .createQueryBuilder()
        .insert()
        .into(InternalConversationMember)
        .values(
          missing.map((userId) => ({
            conversationId: group.id,
            userId,
            unreadCount: 0,
            joinedAt: new Date(),
          })),
        )
        .orIgnore()
        .execute();
    }
  }

  async listAdvisors(): Promise<InternalChatUserDto[]> {
    const users = await this.userRepo.find({
      where: { active: true, role: In(['advisor', 'admin']) },
      order: { name: 'ASC' },
    });
    return users.map((u) => this.toUserDto(u));
  }

  private async findUserOrFail(id: string): Promise<User> {
    if (!id) throw new BadRequestException('Usuario inválido');
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user || !user.active) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  private toUserDto(user: User): InternalChatUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePhotoUrl: user.profilePhotoUrl,
    };
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async listConversations(
    userId: string,
  ): Promise<InternalConversationDto[]> {
    const members = await this.memberRepo.find({
      where: { userId },
      relations: ['conversation', 'conversation.members', 'conversation.members.user'],
    });
    const result: InternalConversationDto[] = [];
    for (const member of members) {
      const conv = member.conversation;
      result.push(
        await this.toConversationDto(conv, userId, member.unreadCount),
      );
    }
    result.sort((a, b) =>
      (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
    );
    return result;
  }

  async getConversationForUser(
    userId: string,
    conversationId: string,
  ): Promise<InternalConversationDto> {
    const conv = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['members', 'members.user'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    const member = conv.members.find((m) => m.userId === userId);
    if (!member) {
      throw new ForbiddenException('No perteneces a esta conversación');
    }
    return this.toConversationDto(conv, userId, member.unreadCount);
  }

  private async toConversationDto(
    conv: InternalConversation,
    userId: string,
    unreadCount: number,
  ): Promise<InternalConversationDto> {
    const lastMessage = await this.messageRepo.findOne({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      relations: ['sender'],
    });
    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      members: conv.members.map((m) => this.toUserDto(m.user)),
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            body: lastMessage.body,
            senderName: lastMessage.sender?.name ?? 'Sistema',
            createdAt: lastMessage.createdAt,
            type: lastMessage.type,
            deleted: !!lastMessage.deletedAt,
          }
        : null,
    };
  }

  async getOrCreateDirectConversation(
    userId: string,
    otherUserId: string,
  ): Promise<InternalConversationDto> {
    if (otherUserId === userId) {
      throw new BadRequestException('No puedes iniciar un chat contigo mismo');
    }
    await this.findUserOrFail(otherUserId);

    let conv = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('internal_conversation_members', 'm1', 'm1.conversation_id = c.id AND m1.user_id = :u1', { u1: userId })
      .innerJoin('internal_conversation_members', 'm2', 'm2.conversation_id = c.id AND m2.user_id = :u2', { u2: otherUserId })
      .where("c.type = 'direct'")
      .getOne();

    if (conv) {
      return this.getConversationForUser(userId, conv.id);
    }

    conv = await this.conversationRepo.save(
      this.conversationRepo.create({
        type: 'direct',
        name: null,
        lastMessageAt: null,
      }),
    );
    await this.memberRepo.save([
      this.memberRepo.create({ conversationId: conv.id, userId }),
      this.memberRepo.create({ conversationId: conv.id, userId: otherUserId }),
    ]);
    return this.getConversationForUser(userId, conv.id);
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  async getMessages(
    userId: string,
    conversationId: string,
    before?: string,
    limit = 50,
  ): Promise<InternalMessageDto[]> {
    await this.assertMember(userId, conversationId);
    const take = Math.min(Math.max(limit, 1), 100);
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m.conversation_id = :conversationId', { conversationId })
      .orderBy('m.createdAt', 'DESC')
      .take(take);
    if (before) {
      qb.andWhere('m.created_at < :before', { before });
    }
    const rows = await qb.getMany();
    rows.reverse();
    const reactionMap = await this.loadReactionsFor(rows);
    return rows.map((m) => this.toMessageDto(m, reactionMap.get(m.id) ?? []));
  }

  async sendText(
    userId: string,
    conversationId: string,
    input: { body?: string; replyToMessageId?: string | null },
  ): Promise<InternalMessageDto> {
    const body = cleanText(input?.body, this.maxBodyLength);
    if (!body) throw new BadRequestException('El mensaje no puede ir vacío');

    const members = await this.assertMember(userId, conversationId);
    let replyTo: InternalMessage | null = null;
    if (input.replyToMessageId) {
      replyTo = await this.messageRepo.findOne({
        where: { id: input.replyToMessageId, conversationId },
      });
      if (!replyTo || replyTo.deletedAt) {
        throw new BadRequestException('Mensaje a responder no disponible');
      }
    }

    const saved = await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        senderId: userId,
        body,
        type: 'text',
        replyToMessageId: input.replyToMessageId ?? null,
      }),
    );
    await this.touchConversation(conversationId, members, userId);
    const dto = await this.loadMessageDto(saved.id);
    this.emitNewMessage(conversationId, dto, members, userId);
    return dto;
  }

  async sendMedia(
    userId: string,
    conversationId: string,
    file: Express.Multer.File,
    input: { caption?: string; replyToMessageId?: string | null },
  ): Promise<InternalMessageDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido');
    }
    if (file.size > this.maxMediaBytes) {
      throw new BadRequestException('El archivo excede 64MB');
    }
    this.assertAllowedMedia(file);

    const members = await this.assertMember(userId, conversationId);
    if (input.replyToMessageId) {
      const replyTo = await this.messageRepo.findOne({
        where: { id: input.replyToMessageId, conversationId },
      });
      if (!replyTo || replyTo.deletedAt) {
        throw new BadRequestException('Mensaje a responder no disponible');
      }
    }

    const caption = cleanText(input?.caption, this.maxCaptionLength);
    const mimeType = this.normalizeMimeType(file.mimetype);
    const mediaUrl = await this.saveMediaBuffer(file.buffer, file.originalname, mimeType);

    const saved = await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        senderId: userId,
        body: caption || '',
        type: this.mediaTypeOf(mimeType),
        mediaUrl,
        mediaMimeType: mimeType,
        mediaName: sanitizeFileName(file.originalname, mimeType),
        mediaSize: file.size,
        replyToMessageId: input.replyToMessageId ?? null,
      }),
    );
    await this.touchConversation(conversationId, members, userId);
    const dto = await this.loadMessageDto(saved.id);
    this.emitNewMessage(conversationId, dto, members, userId);
    return dto;
  }

  async editMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    input: { body?: string },
  ): Promise<InternalMessageDto> {
    const members = await this.assertMember(userId, conversationId);
    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Mensaje no encontrado');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('Solo el autor puede editar el mensaje');
    }
    if (message.type === 'system') {
      throw new BadRequestException('Este mensaje no se puede editar');
    }
    const elapsed = Date.now() - new Date(message.createdAt).getTime();
    if (elapsed > this.editWindowMs) {
      throw new BadRequestException(
        'Solo puedes editar mensajes dentro de los primeros 15 minutos',
      );
    }
    const body = cleanText(input?.body, this.maxBodyLength);
    if (!body) throw new BadRequestException('El mensaje no puede ir vacío');

    message.body = body;
    message.editedAt = new Date();
    await this.messageRepo.save(message);
    const dto = await this.loadMessageDto(message.id);
    this.messageEdited$.next({
      conversationId,
      message: dto,
      memberIds: members.map((m) => m.userId),
    });
    return dto;
  }

  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    userRole: string,
  ): Promise<{ messageId: string; deletedAt: Date }> {
    const members = await this.assertMember(userId, conversationId);
    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Mensaje no encontrado');
    }
    if (message.type === 'system') {
      throw new BadRequestException('Este mensaje no se puede eliminar');
    }
    const isAdmin = userRole === 'admin';
    if (message.senderId !== userId && !isAdmin) {
      throw new ForbiddenException(
        'Solo el autor o un administrador puede eliminar el mensaje',
      );
    }
    message.deletedAt = new Date();
    await this.messageRepo.save(message);
    await this.messageRepo
      .createQueryBuilder()
      .update(InternalMessage)
      .set({ deletedAt: () => 'CURRENT_TIMESTAMP' })
      .where('reaction_to_message_id = :messageId', { messageId })
      .execute();
    this.messageDeleted$.next({
      conversationId,
      messageId,
      deletedAt: message.deletedAt,
      memberIds: members.map((m) => m.userId),
    });
    return { messageId, deletedAt: message.deletedAt };
  }

  async forwardMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    input: { toConversationId?: string },
  ): Promise<InternalMessageDto> {
    const toConversationId = input?.toConversationId;
    if (!toConversationId) {
      throw new BadRequestException('Conversación destino requerida');
    }
    const sourceMembers = await this.assertMember(userId, conversationId);
    const targetMembers = await this.assertMember(userId, toConversationId);
    const source = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!source || source.deletedAt) {
      throw new NotFoundException('Mensaje a reenviar no encontrado');
    }
    if (source.type === 'system') {
      throw new BadRequestException('Este mensaje no se puede reenviar');
    }
    const saved = await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: toConversationId,
        senderId: userId,
        body: source.body,
        type: source.type,
        mediaUrl: source.mediaUrl,
        mediaMimeType: source.mediaMimeType,
        mediaName: source.mediaName,
        mediaSize: source.mediaSize,
        durationMs: source.durationMs,
        mediaWidth: source.mediaWidth,
        mediaHeight: source.mediaHeight,
        isForwarded: true,
      }),
    );
    await this.touchConversation(toConversationId, targetMembers, userId);
    const dto = await this.loadMessageDto(saved.id);
    this.emitNewMessage(toConversationId, dto, targetMembers, userId);
    return dto;
  }

  async reactToMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    input: { emoji?: string },
  ): Promise<InternalReactionDto> {
    const members = await this.assertMember(userId, conversationId);
    const target = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Mensaje no encontrado');
    }
    const emoji = String(input?.emoji ?? '').trim().slice(0, 8);
    if (!emoji) throw new BadRequestException('Emoji requerido');

    const existing = await this.messageRepo.findOne({
      where: { senderId: userId, reactionToMessageId: messageId },
    });
    if (existing) {
      if (existing.reactionEmoji === emoji) {
        await this.messageRepo.remove(existing);
      } else {
        existing.reactionEmoji = emoji;
        await this.messageRepo.save(existing);
      }
    } else {
      await this.messageRepo.save(
        this.messageRepo.create({
          conversationId,
          senderId: userId,
          body: emoji,
          type: 'system',
          reactionToMessageId: messageId,
          reactionEmoji: emoji,
        }),
      );
    }

    const reaction = await this.buildReactionDto(conversationId, messageId);
    this.reactionUpdated$.next({
      reaction,
      memberIds: members.map((m) => m.userId),
    });
    return reaction;
  }

  // ── Read state / unread ────────────────────────────────────────────────────
  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.assertMember(userId, conversationId);
    await this.memberRepo.update(
      { conversationId, userId },
      { unreadCount: 0, lastReadAt: new Date() },
    );
    this.unreadUpdates$.next({ conversationId, userId, unreadCount: 0 });
  }

  async unreadTotal(userId: string): Promise<number> {
    const row = await this.memberRepo
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.unread_count), 0)', 'total')
      .where('m.user_id = :userId', { userId })
      .getRawOne<{ total: string | number }>();
    return Number(row?.total ?? 0);
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private async assertMember(
    userId: string,
    conversationId: string,
  ): Promise<InternalConversationMember[]> {
    const conv = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['members'],
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    const member = conv.members.find((m) => m.userId === userId);
    if (!member) {
      throw new ForbiddenException('No perteneces a esta conversación');
    }
    return conv.members;
  }

  private async touchConversation(
    conversationId: string,
    members: InternalConversationMember[],
    senderId: string,
  ): Promise<void> {
    await this.conversationRepo.update(
      { id: conversationId },
      { lastMessageAt: new Date() },
    );
    for (const member of members) {
      if (member.userId === senderId) continue;
      await this.memberRepo.increment(
        { conversationId, userId: member.userId },
        'unreadCount',
        1,
      );
      const row = await this.memberRepo.findOne({
        where: { conversationId, userId: member.userId },
      });
      this.unreadUpdates$.next({
        conversationId,
        userId: member.userId,
        unreadCount: row?.unreadCount ?? 0,
      });
    }
    const target = await this.messageRepo.findOne({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      relations: ['sender'],
    });
    if (target) {
      const refreshed = await this.conversationRepo.findOne({
        where: { id: conversationId },
        relations: ['members', 'members.user'],
      });
      if (refreshed) {
        for (const member of members) {
          this.conversationUpdates$.next({
            conversation: await this.toConversationDto(
              refreshed,
              member.userId,
              await this.getUnread(member.userId, conversationId),
            ),
            memberIds: [member.userId],
          });
        }
      }
    }
  }

  private async getUnread(userId: string, conversationId: string): Promise<number> {
    const row = await this.memberRepo.findOne({
      where: { conversationId, userId },
    });
    return row?.unreadCount ?? 0;
  }

  private emitNewMessage(
    conversationId: string,
    message: InternalMessageDto,
    members: InternalConversationMember[],
    senderId: string,
  ): void {
    this.newMessages$.next({
      conversationId,
      message,
      memberIds: members.map((m) => m.userId),
    });
  }

  private async loadMessageDto(id: string): Promise<InternalMessageDto> {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: ['sender'],
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    const reactions = await this.loadReactionsFor([message]);
    return this.toMessageDto(message, reactions.get(message.id) ?? []);
  }

  private async loadReactionsFor(
    messages: InternalMessage[],
  ): Promise<Map<string, { userId: string; name: string; emoji: string }[]>> {
    if (messages.length === 0) return new Map();
    const ids = messages.map((m) => m.id);
    const rows = await this.messageRepo.find({
      where: { reactionToMessageId: In(ids) },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });
    const map = new Map<string, { userId: string; name: string; emoji: string }[]>();
    for (const row of rows) {
      const target = row.reactionToMessageId;
      if (!target) continue;
      const list = map.get(target) ?? [];
      list.push({
        userId: row.senderId ?? '',
        name: row.sender?.name ?? 'Usuario',
        emoji: row.reactionEmoji ?? row.body,
      });
      map.set(target, list);
    }
    return map;
  }

  private toMessageDto(
    message: InternalMessage,
    reactions: { userId: string; name: string; emoji: string }[] = [],
  ): InternalMessageDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender?.name ?? 'Sistema',
      senderRole: message.sender?.role ?? 'system',
      body: message.body,
      type: message.type,
      mediaUrl: message.mediaUrl,
      mediaMimeType: message.mediaMimeType,
      mediaName: message.mediaName,
      mediaSize: message.mediaSize,
      durationMs: message.durationMs,
      mediaWidth: message.mediaWidth,
      mediaHeight: message.mediaHeight,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      replyToMessageId: message.replyToMessageId,
      isForwarded: message.isForwarded,
      reactionToMessageId: message.reactionToMessageId,
      reactionEmoji: message.reactionEmoji,
      reactions,
      createdAt: message.createdAt,
    };
  }

  private async buildReactionDto(
    conversationId: string,
    messageId: string,
  ): Promise<InternalReactionDto> {
    const reactions = await this.messageRepo.find({
      where: { conversationId, reactionToMessageId: messageId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });
    return {
      conversationId,
      messageId,
      reactions: reactions.map((r) => ({
        userId: r.senderId ?? '',
        name: r.sender?.name ?? 'Usuario',
        emoji: r.reactionEmoji ?? r.body,
      })),
    };
  }

  private mediaTypeOf(mimeType: string): 'image' | 'audio' | 'file' {
    const normalized = this.normalizeMimeType(mimeType);
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('audio/')) return 'audio';
    return 'file';
  }

  private assertAllowedMedia(file: Express.Multer.File): void {
    const mimeType = this.normalizeMimeType(file.mimetype);
    if (!this.allowedMediaMimes.has(mimeType)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido en el chat interno',
      );
    }
    const ext = extname(
      sanitizeFileName(file.originalname, mimeType),
    ).toLowerCase();
    const expected = this.extFromMime(mimeType);
    if (
      expected &&
      ext &&
      ext !== expected &&
      !this.isCompatibleExtension(mimeType, ext)
    ) {
      throw new BadRequestException(
        'La extensión del archivo no coincide con su contenido',
      );
    }
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

  private extFromMime(mimeType = ''): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/aac': '.aac',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/amr': '.amr',
      'audio/webm': '.webm',
      'video/mp4': '.mp4',
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

  private async saveMediaBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType = '',
  ): Promise<string> {
    const uploadsDir = join(process.cwd(), 'uploads', 'internal');
    await mkdir(uploadsDir, { recursive: true });

    const ext =
      this.extFromMime(mimeType) || extname(originalName).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await writeFile(join(uploadsDir, filename), buffer);

    const backendUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:3001';
    return `${backendUrl}/uploads/internal/${filename}`;
  }
}
