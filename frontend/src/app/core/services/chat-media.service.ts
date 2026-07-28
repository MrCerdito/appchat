import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Attachment } from '../models/message.model';
import { environment } from '../../../environments/environment';

const MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

@Injectable({ providedIn: 'root' })
export class ChatMediaService {
  constructor(private http: HttpClient) {}

  validate(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) {
      return `Tipo de archivo no permitido: ${file.type || 'desconocido'}`;
    }
    if (file.size > MAX_SIZE) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return `El archivo pesa ${mb} MB. El limite es 5 MB.`;
    }
    return null;
  }

  upload(file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Attachment>(`${environment.apiUrl}/chat-media/upload`, form);
  }

  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  isDocument(mimeType: string): boolean {
    return !mimeType.startsWith('image/') && !mimeType.startsWith('video/');
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
