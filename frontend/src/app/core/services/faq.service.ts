import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ObservableInput } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DocumentInfo {
  name: string;
  charCount: number;
  updatedAt: number;
  hasDocument: boolean;
}

export interface ChatMessage {
  text: string;
  isUser: boolean;
  timestamp: number;
}

export interface Faq {
  id: number;
  pregunta: string;
  respuesta: string;
  categoria: string | null;
  keywords: string[] | null;
  colegioId: number | null;
  orden: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFaqDto {
  pregunta: string;
  respuesta: string;
  categoria?: string;
  keywords?: string[];
  colegioId?: number;
  orden?: number;
  activo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FaqService {
  constructor(private http: HttpClient) {}

  getAll(colegioId?: number, q?: string, bustCache = false): Observable<Faq[]> {
    let params = '';
    if (colegioId) params += `colegioId=${colegioId}&`;
    if (q) params += `q=${encodeURIComponent(q)}&`;
    if (bustCache) params += `_t=${Date.now()}`;
    return this.http.get<Faq[]>(`${environment.apiUrl}/faq?${params}`);
  }

  getCategorias(colegioId?: number): Observable<string[]> {
    let params = '';
    if (colegioId) params += `colegioId=${colegioId}`;
    return this.http.get<string[]>(`${environment.apiUrl}/faq/categorias?${params}`);
  }

  create(dto: CreateFaqDto): Observable<Faq> {
    return this.http.post<Faq>(`${environment.apiUrl}/faq`, dto);
  }

  update(id: number, dto: Partial<CreateFaqDto>): Observable<Faq> {
    return this.http.patch<Faq>(`${environment.apiUrl}/faq/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/faq/${id}`);
  }

  importXlsx(file: File): Observable<{ imported: number; skipped: number; errors: string[]; total: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ imported: number; skipped: number; errors: string[]; total: number }>(`${environment.apiUrl}/faq/import`, formData);
  }

  exportXlsx(): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/faq/export`, { responseType: 'blob' });
  }

  removeBulk(ids: number[]): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${environment.apiUrl}/faq/delete-bulk`, { ids });
  }

  // ── Document Chat ────────────────────────────────────────────────────────

  uploadDocument(file: File): Observable<{ name: string; charCount: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ name: string; charCount: number }>(`${environment.apiUrl}/faq/upload-document`, formData);
  }

  getSuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${environment.apiUrl}/faq/suggestions`);
  }

  getDocumentInfo(): Observable<DocumentInfo> {
    return this.http.get<DocumentInfo>(`${environment.apiUrl}/faq/document-info`);
  }

  chatStream(
    query: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (msg: string) => void,
    signal?: AbortSignal,
  ): void {
    const ctrl = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => ctrl.abort());
    }

    fetch(`${environment.apiUrl}/faq/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    })
      .then((resp) => {
        if (!resp.ok) {
          onError(`Error HTTP ${resp.status}`);
          return;
        }
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processBuffer = (): void => {
          // Find complete SSE messages: "event: X\ndata: Y\n\n"
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            let eventType = '';
            let dataStr = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }

            if (!eventType || !dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'chunk' && data.text) {
                onChunk(data.text);
              } else if (eventType === 'done') {
                onDone();
                return;
              } else if (eventType === 'error') {
                onError(data.message || 'Error desconocido');
                return;
              }
            } catch {
              /* ignorar JSON inválido */
            }
          }
        };

        const read = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) {
              processBuffer();
              onDone();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            processBuffer();
            return read();
          });

        return read();
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          onError(err?.message || 'Error de conexión');
        }
      });
  }
}
