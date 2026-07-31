import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import {
  InternalChatService,
  InternalChatUserDto,
  InternalConversationDto,
  InternalMessageDto,
  InternalReactionDto,
} from './internal-chat.service';

@Controller('internal-chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('advisor', 'admin')
export class InternalChatController {
  constructor(private readonly internalChatService: InternalChatService) {}

  @Get('advisors')
  listAdvisors(): Promise<InternalChatUserDto[]> {
    return this.internalChatService.listAdvisors();
  }

  @Get('conversations')
  listConversations(@Request() req): Promise<InternalConversationDto[]> {
    return this.internalChatService.listConversations(req.user.id);
  }

  @Post('conversations/direct')
  createDirect(
    @Request() req,
    @Body() body: { userId: string },
  ): Promise<InternalConversationDto> {
    const otherUserId = String(body?.userId ?? '').trim();
    if (!otherUserId) {
      throw new BadRequestException('El id del usuario es requerido');
    }
    return this.internalChatService.getOrCreateDirectConversation(
      req.user.id,
      otherUserId,
    );
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Request() req,
    @Param('id') conversationId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<InternalMessageDto[]> {
    return this.internalChatService.getMessages(
      req.user.id,
      conversationId,
      before,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  sendText(
    @Request() req,
    @Param('id') conversationId: string,
    @Body() body: { body?: string; replyToMessageId?: string | null },
  ): Promise<InternalMessageDto> {
    return this.internalChatService.sendText(req.user.id, conversationId, {
      body: body?.body,
      replyToMessageId: body?.replyToMessageId,
    });
  }

  @Post('conversations/:id/media')
  @Throttle({ default: { limit: 20, ttl: 10_000 } })
  @UseInterceptors(FileInterceptor('file'))
  sendMedia(
    @Request() req,
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { caption?: string; replyToMessageId?: string | null },
  ): Promise<InternalMessageDto> {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    return this.internalChatService.sendMedia(req.user.id, conversationId, file, {
      caption: body?.caption,
      replyToMessageId: body?.replyToMessageId,
    });
  }

  @Patch('conversations/:id/messages/:mid')
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  editMessage(
    @Request() req,
    @Param('id') conversationId: string,
    @Param('mid') messageId: string,
    @Body() body: { body?: string },
  ): Promise<InternalMessageDto> {
    return this.internalChatService.editMessage(
      req.user.id,
      conversationId,
      messageId,
      { body: body?.body },
    );
  }

  @Delete('conversations/:id/messages/:mid')
  deleteMessage(
    @Request() req,
    @Param('id') conversationId: string,
    @Param('mid') messageId: string,
  ): Promise<{ messageId: string; deletedAt: Date }> {
    return this.internalChatService.deleteMessage(
      req.user.id,
      conversationId,
      messageId,
      req.user.role,
    );
  }

  @Post('conversations/:id/messages/:mid/forward')
  forwardMessage(
    @Request() req,
    @Param('id') conversationId: string,
    @Param('mid') messageId: string,
    @Body() body: { toConversationId?: string },
  ): Promise<InternalMessageDto> {
    return this.internalChatService.forwardMessage(
      req.user.id,
      conversationId,
      messageId,
      { toConversationId: body?.toConversationId },
    );
  }

  @Post('conversations/:id/messages/:mid/reaction')
  react(
    @Request() req,
    @Param('id') conversationId: string,
    @Param('mid') messageId: string,
    @Body() body: { emoji?: string },
  ): Promise<InternalReactionDto> {
    return this.internalChatService.reactToMessage(
      req.user.id,
      conversationId,
      messageId,
      { emoji: body?.emoji },
    );
  }

  @Post('conversations/:id/read')
  markRead(
    @Request() req,
    @Param('id') conversationId: string,
  ): Promise<{ ok: true }> {
    return this.internalChatService
      .markRead(req.user.id, conversationId)
      .then(() => ({ ok: true as const }));
  }
}
