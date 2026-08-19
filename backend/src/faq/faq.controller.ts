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
  async exportXml(@Res() res: Response) {
    const xml = await this.faqService.exportXml();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faqs.xml"');
    res.send(xml);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['text/xml', 'application/xml', 'text/plain'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xml'))
          return cb(null, true);
        cb(new BadRequestException('Solo se permiten archivos XML'), false);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async importXml(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    let xml: string;
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      xml = new TextDecoder('latin1').decode(file.buffer);
    }
    xml = xml.replace(/^\uFEFF/, '');
    const result = await this.faqService.importXml(xml);
    return { imported: result.imported, skipped: result.skipped, errors: result.errors, total: result.total };
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
