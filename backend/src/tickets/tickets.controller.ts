import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UploadedFile,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { AddNoteDto } from './dto/add-note.dto';

const TICKET_UPLOADS_DIR = join(process.cwd(), 'uploads', 'tickets');

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'desarrollador', 'advisor')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles('admin', 'advisor', 'desarrollador')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.create(dto, req.user.id);
  }

  @Get()
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: QueryTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.findAll(query, req.user.role, req.user.id);
  }

  @Roles('admin')
  @Get('all')
  findAllSimple() {
    return this.ticketsService.findAllSimple();
  }

  @Get('counts')
  findCounts(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: QueryTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.findCounts(query, req.user.role, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.update(id, dto, req.user.id, req.user.role);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.ticketsService.delete(id);
  }

  @Roles('admin', 'advisor', 'desarrollador')
  @Post(':id/send-close-confirmation')
  sendCloseConfirmation(
    @Param('id') id: string,
    @Body() body: { to?: string } = {},
  ) {
    return this.ticketsService.enviarConfirmacionCierre(id, body?.to);
  }

  @Roles('admin', 'advisor', 'desarrollador')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: AddNoteDto,
    @Request() req: any,
  ) {
    return this.ticketsService.addNote(id, dto, req.user);
  }

  @Roles('admin', 'advisor', 'desarrollador')
  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Request() req: any,
  ) {
    return this.ticketsService.deleteNote(id, noteId, req.user);
  }

  @Roles('admin', 'advisor', 'desarrollador')
  @Post(':id/upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(TICKET_UPLOADS_DIR)) {
            mkdirSync(TICKET_UPLOADS_DIR, { recursive: true });
          }
          cb(null, TICKET_UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
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
  uploadImage(
    @Param('id') _id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return { url: `/uploads/tickets/${file.filename}` };
  }
}
