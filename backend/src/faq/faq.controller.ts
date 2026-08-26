import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Res,
  Req,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqChatDto } from './dto/faq-chat.dto';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('faq')
export class FaqController {
  private readonly logger = new Logger(FaqController.name);

  constructor(private readonly faqService: FaqService) {}

  @SkipThrottle()
  @Get()
  findAll(@Query('colegioId') colegioId?: string, @Query('q') q?: string) {
    return this.faqService.findAll(
      colegioId ? Number(colegioId) : undefined,
      q,
    );
  }

  @SkipThrottle()
  @Get('categorias')
  findCategorias(@Query('colegioId') colegioId?: string) {
    return this.faqService.findCategorias(
      colegioId ? Number(colegioId) : undefined,
    );
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async exportXlsx(@Res() res: Response) {
    const buffer = await this.faqService.exportXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="faqs.xlsx"');
    res.send(buffer);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls'))
          return cb(null, true);
        cb(new BadRequestException('Solo se permiten archivos Excel (.xlsx o .xls)'), false);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async importXlsx(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    const result = await this.faqService.importXlsx(file.buffer);
    return { imported: result.imported, skipped: result.skipped, errors: result.errors, total: result.total };
  }

  @SkipThrottle()
  @Post('upload-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (file.originalname.endsWith('.docx') || file.originalname.endsWith('.doc')) {
          return cb(null, true);
        }
        cb(new BadRequestException('Solo se permiten archivos Word (.docx)'), false);
      },
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    return this.faqService.uploadDocument(file.buffer, file.originalname);
  }

  @SkipThrottle()
  @Get('suggestions')
  getSuggestions() {
    return this.faqService.getSuggestions();
  }

  @SkipThrottle()
  @Get('document-info')
  getDocumentInfo() {
    return this.faqService.getDocumentInfo();
  }

  @SkipThrottle()
  @Post('chat')
  async chat(@Req() req: Request, @Body() body: FaqChatDto, @Res() res: Response) {
    if (!body.query?.trim()) {
      res.status(400).json({ error: 'Query vacía' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: string, data: object) => {
      if (res.writableEnded || res.destroyed || !res.writable) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      } catch {
        /* cliente desconectado */
      }
    };

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      emit('start', { message: 'Buscando en el documento...' });
      await this.faqService.chatWithDocument(
        body.query,
        emit,
        abortController.signal,
      );
      emit('done', { ok: true });
    } catch (err: any) {
      this.logger.error(`[FAQ-CHAT] ${err?.message}`);
      emit('error', { message: err?.message || 'Error al procesar la consulta' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.faqService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFaqDto) {
    return this.faqService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFaqDto) {
    return this.faqService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.faqService.remove(id);
  }

  @Post('delete-bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async removeBulk(@Body() body: { ids: number[] }) {
    return this.faqService.removeBulk(body.ids);
  }
}
