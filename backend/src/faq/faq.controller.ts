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
  Header,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Header('Cache-Control', 'public, max-age=300')
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
  async exportCsv(@Res() res: Response) {
    const csv = await this.faqService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faqs.csv"');
    res.send(csv);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['text/csv', 'application/csv', 'application/vnd.ms-excel'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv'))
          return cb(null, true);
        cb(new BadRequestException('Solo se permiten archivos CSV'), false);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    let csv: string;
    try {
      csv = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      csv = new TextDecoder('latin1').decode(file.buffer);
    }
    csv = csv.replace(/^\uFEFF/, '');
    const result = await this.faqService.importCsv(csv);
    return { imported: result.imported, errors: result.errors, total: result.total };
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
