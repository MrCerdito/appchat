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
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UploadedFile,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Permiso } from '../accesos/permiso-modulo.guard';
import { TicketsService } from './tickets.service';
import { TicketAuditService } from './ticket-audit.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { AddNoteDto } from './dto/add-note.dto';

/**
 * Las imágenes de tickets se guardan FUERA de `uploads/`, que se sirve como
 * estático sin autenticación. Así no hay forma de que una captura con datos
 * personales del cliente quede accesible por URL directa.
 */
const TICKET_UPLOADS_DIR = join(process.cwd(), 'uploads-private', 'tickets');

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permiso('tickets')
@Roles('admin', 'desarrollador', 'advisor', 'interno')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly auditService: TicketAuditService,
  ) {}

  @Roles('admin', 'advisor', 'desarrollador', 'interno')
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

  /**
   * Sirve una imagen de una nota de ticket.
   *
   * Se declara ANTES de `@Get(':id')` a proposito: en Express gana el orden de
   * declaracion, y si 'imagenes' llegara despues, Express lo interpretaria como
   * un `id` y la ruta casaria con cualquier UUID.
   *
   * Sustituye al estatico `/uploads/tickets/...`, que no comprobaba sesion:
   * estas imagenes son capturas con datos personales del cliente.
   */
  @Get('imagenes/:file')
  async imagen(
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const encontrada = await this.ticketsService.buscarImagenDeTicket(file);
    if (!encontrada) {
      throw new NotFoundException('Imagen no encontrada');
    }
    res.setHeader('Content-Type', encontrada.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // `private` evita que un proxy compartido cachee una imagen con PII.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(encontrada.path);
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
  delete(@Param('id') id: string, @Request() req: any) {
    return this.ticketsService.delete(id, req.user.id);
  }

  /**
   * Historial de auditoría del ticket: quién lo creó, lo reasignó, lo cambió de
   * estado y lo cerró. Solo lectura.
   */
  @Get(':id/auditoria')
  async auditoria(@Param('id') id: string) {
    await this.ticketsService.findById(id);
    return this.auditService.listarPorTicket(id);
  }

  /**
   * Cierre controlado. Sustituye al PATCH `{status:'closed'}` para el flujo
   * normal, y aplica la regla: solo desde `resolved`, opcionalmente enviando el
   * correo de confirmacion, y abortando si ese correo falla.
   *
   * `desarrollador` queda excluido a proposito.
   */
  @Roles('admin', 'advisor', 'interno')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @Param('id') id: string,
    @Body() body: { enviarCorreo?: boolean; to?: string } = {},
    @Request() req: any,
  ) {
    return this.ticketsService.cerrarTicket(
      id,
      {
        enviarCorreo: body?.enviarCorreo === true,
        to: body?.to,
      },
      req.user,
    );
  }

  /**
   * Reenvío manual del correo de confirmación, por si el cliente lo pidió.
   * No cierra nada: el cierre va por `POST :id/close`. Se deja fuera
   * `desarrollador` porque el correo afirma que la solicitud ya fue resuelta.
   */
  @Roles('admin', 'advisor', 'interno')
  @Post(':id/send-close-confirmation')
  sendCloseConfirmation(
    @Param('id') id: string,
    @Body() body: { to?: string } = {},
  ) {
    return this.ticketsService.enviarConfirmacionCierre(id, body?.to);
  }

  @Roles('admin', 'advisor', 'desarrollador', 'interno')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: AddNoteDto,
    @Request() req: any,
  ) {
    return this.ticketsService.addNote(id, dto, req.user);
  }

  @Roles('admin', 'advisor', 'desarrollador', 'interno')
  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Request() req: any,
  ) {
    return this.ticketsService.deleteNote(id, noteId, req.user);
  }

  @Roles('admin', 'advisor', 'desarrollador', 'interno')
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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    // La imagen todavía no está referenciada por ninguna nota, así que se valida
    // que el ticket exista: si no, el archivo quedaría huérfano en disco.
    return this.ticketsService.registrarImagenSubida(id, file.filename).then(
      () => ({
        // Ruta autenticada. Antes era `/uploads/tickets/<uuid>.<ext>`, servido
        // como estático y por tanto accesible sin iniciar sesión.
        url: `/tickets/imagenes/${file.filename}`,
        filename: file.filename,
      }),
    );
  }
}
