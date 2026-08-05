import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { Attachment } from './entities/message.entity';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'chat-media');

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/3gpp',
  'video/quicktime',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/opus',
  'audio/amr',
  'audio/webm',
  'audio/wav',
  'audio/x-m4a',
  'audio/flac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-rar',
  'application/x-7z-compressed',
  'application/x-compressed',
]);

const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.7z']);

const MAX_SIZE = 64 * 1024 * 1024;

function normalizeMimeType(value = ''): string {
  return value.toLowerCase().split(';')[0].trim();
}

function isGenericMime(value = ''): boolean {
  const mime = normalizeMimeType(value);
  return mime === '' || mime === 'application/octet-stream';
}

function isArchiveFileName(name = ''): boolean {
  const ext = extname(name.toLowerCase());
  return ARCHIVE_EXTENSIONS.has(ext);
}

@Controller('chat-media')
export class ChatMediaController {
  @Post('upload')
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(UPLOADS_DIR)) {
            mkdirSync(UPLOADS_DIR, { recursive: true });
          }
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${randomUUID()}-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const mimeType = normalizeMimeType(file.mimetype);
        const allowed =
          ALLOWED_MIMES.has(mimeType) ||
          (isGenericMime(file.mimetype) && isArchiveFileName(file.originalname));
        if (!allowed) {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido: ${mimeType || 'desconocido'}`,
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }

    const backendUrl = process.env.APP_URL ?? 'http://localhost:3001';

    return {
      id: randomUUID(),
      fileName: file.filename,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
      size: file.size,
      url: `${backendUrl}/uploads/chat-media/${file.filename}`,
    };
  }
}
