import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { ConfiguracionService } from './configuracion.service';
import { GuardarConfigGlobalDto } from './dto/guardar-config-global.dto';
import { GuardarConfigTicketMailDto } from './dto/guardar-config-ticket-mail.dto';
import { GuardarConfigAdvisorDto } from './dto/guardar-config-advisor.dto';
import { MailTestDto } from './dto/mail-test.dto';

const MAIL_UPLOADS_DIR = join(process.cwd(), 'uploads', 'email');

@Controller('configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly svc: ConfiguracionService) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('horario-hoy')
  horarioHoy() {
    return this.svc.getHorarioEstado();
  }

  @Get()
  getEfectiva(@Request() req: any) {
    return this.svc.getEfectiva(req.user.id);
  }

  @Get('global')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getGlobal() {
    return this.svc.getGlobal();
  }

  @Get('global/ticket-mail')
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  async getTicketMail() {
    const config = await this.svc.getGlobal();
    return {
      ticketEmailActivo: config.ticketEmailActivo,
      ticketEmailAsunto: config.ticketEmailAsunto,
      ticketEmailCuerpo: config.ticketEmailCuerpo,
      ticketEmailDesign: config.ticketEmailDesign,
      ticketEmailSenderName: config.ticketEmailSenderName,
      ticketEmailIncludeInfo: config.ticketEmailIncludeInfo,
      ticketEmailSendCopy: config.ticketEmailSendCopy,
      ticketEmailAttachments: config.ticketEmailAttachments,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  guardar(@Body() body: GuardarConfigAdvisorDto, @Request() req: any) {
    return this.svc.guardar(body, req.user.id);
  }

  @Post('global')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  guardarGlobal(@Body() body: GuardarConfigGlobalDto) {
    return this.svc.guardar(body, undefined);
  }

  @Post('global/ticket-mail')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  guardarTicketMail(@Body() body: GuardarConfigTicketMailDto) {
    return this.svc.guardar(body, undefined);
  }

  @Post('global/mail-test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  mailTest(@Body() body: MailTestDto) {
    return this.svc.probarConexionSmtp(body);
  }

  @Post('global/mail-image')
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(MAIL_UPLOADS_DIR)) {
            mkdirSync(MAIL_UPLOADS_DIR, { recursive: true });
          }
          cb(null, MAIL_UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'image/avif',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Solo se permiten imagenes (jpg, png, webp, gif, avif)',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  mailImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return { url: `/uploads/email/${file.filename}` };
  }

  @Get('quick-replies')
  async getQuickReplies() {
    const config = await this.svc.getGlobal();
    return config.whatsappQuickReplies ?? [];
  }

  @Post('quick-replies')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  guardarQuickReplies(@Body() body: { whatsappQuickReplies: any[] }) {
    return this.svc.guardar({ whatsappQuickReplies: body.whatsappQuickReplies }, undefined);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  resetear(@Request() req: any) {
    return this.svc.resetearOverride(req.user.id);
  }

  @Get('quick-replies/export')
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  async exportQuickRepliesCsv(@Res() res: Response) {
    const csv = await this.svc.exportQuickRepliesCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="respuestas-rapidas.csv"');
    res.send(csv);
  }

  @Post('quick-replies/import')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importQuickRepliesCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('Archivo no proporcionado');
    let csv: string;
    try {
      csv = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      csv = new TextDecoder('latin1').decode(file.buffer);
    }
    csv = csv.replace(/^\uFEFF/, '');
    return this.svc.importQuickRepliesCsv(csv);
  }

  @Post('quick-replies/import-bulk')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  async importBulkQuickReplies(@Body() items: { name: string; content: string }[]) {
    return this.svc.importBulkQuickReplies(items);
  }

  @Post('quick-replies/delete-bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'advisor')
  async deleteBulkQuickReplies(@Body() ids: string[]) {
    return this.svc.deleteBulkQuickReplies(ids);
  }

  @Get('ticket-categories')
  getTicketCategories() {
    return this.svc.getGlobal().then((c) => c.ticketCategories ?? []);
  }
}
