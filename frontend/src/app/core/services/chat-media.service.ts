import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Attachment } from '../models/message.model';
import { environment } from '../../../environments/environment';
import {
  extensionFromName,
  isArchiveExtension,
  isGenericOrEmptyMime,
  normalizeMimeType,
} from '../../shared/utils/media';

const MAX_SIZE = 64 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
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

@Injectable({ providedIn: 'root' })
export class ChatMediaService {
  constructor(private http: HttpClient) {}

  validate(file: File): string | null {
    const mimeType = normalizeMimeType(file.type);
    const allowed =
      ALLOWED_TYPES.has(mimeType) ||
      (isGenericOrEmptyMime(mimeType) && isArchiveExtension(extensionFromName(file.name)));
    if (!allowed) {
      return `Tipo de archivo no permitido: ${mimeType || 'desconocido'}`;
    }
    if (file.size > MAX_SIZE) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return `El archivo pesa ${mb} MB. El limite es 64 MB.`;
    }
    return null;
  }

  upload(file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Attachment>(`${environment.apiUrl}/chat-media/upload`, form);
  }

  isImage(mimeType: string): boolean {
    return normalizeMimeType(mimeType).startsWith('image/');
  }

  isVideo(mimeType: string): boolean {
    return normalizeMimeType(mimeType).startsWith('video/');
  }

  isAudio(mimeType: string): boolean {
    return normalizeMimeType(mimeType).startsWith('audio/');
  }

  isDocument(mimeType: string): boolean {
    const m = normalizeMimeType(mimeType);
    return !m.startsWith('image/') && !m.startsWith('video/') && !m.startsWith('audio/');
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getFileIcon(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'xls';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ppt';
    return 'file';
  }
}
