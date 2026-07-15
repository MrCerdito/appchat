import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiResponse {
  reply        : string;
  transfer     : boolean;
  showFeedback : boolean;
  documentos?  : { nombre: string; pdfUrl: string | null; categoria: string | null }[];
}

// Eventos que llegan por SSE
export interface SseEvent {
  event : 'start' | 'metadata' | 'chunk' | 'end' | 'error';
  data  : any;
}

export interface WhatsappDraftImproveRequest {
  draft: string;
  clientName?: string;
  institution?: string;
  role?: string;
}

export interface WhatsappSummaryRequest {
  clientName?: string;
  institution?: string;
  role?: string;
  city?: string;
  phone?: string;
  notes?: string[];
  messages?: { fromMe: boolean; body: string }[];
}

@Injectable({ providedIn: 'root' })
export class AiService {

  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Método original (no se toca) ──────────────────────────────────────────
  chat(
    message       : string,
    history       : AiMessage[],
    clientName    : string,
    colegio       : string,
    tipoSolicitud : string,
    rol           : string = 'estudiante',
  ): Observable<AiResponse> {
    return this.http.post<AiResponse>(`${this.baseUrl}/ai/chat`, {
      message, history, clientName, colegio, tipoSolicitud, rol,
    });
  }

  // ── Nuevo método SSE ──────────────────────────────────────────────────────
  improveWhatsappDraft(payload: WhatsappDraftImproveRequest): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(`${this.baseUrl}/ai/whatsapp/improve`, payload);
  }

  summarizeWhatsappConversation(payload: WhatsappSummaryRequest): Observable<{ summary: string }> {
    return this.http.post<{ summary: string }>(`${this.baseUrl}/ai/whatsapp/summary`, payload);
  }

  chatStream(
    message       : string,
    history       : AiMessage[],
    clientName    : string,
    colegio       : string,
    tipoSolicitud : string,
    rol           : string = 'estudiante',
  ): Observable<SseEvent> {

    return new Observable(observer => {
      const ctrl = new AbortController();

      fetch(`${this.baseUrl}/ai/stream`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ message, history, clientName, colegio, tipoSolicitud, rol }),
        signal : ctrl.signal,
      })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        let   buffer  = '';
        let   currentEvent = 'chunk';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                observer.next({ event: currentEvent as SseEvent['event'], data });
                if (currentEvent === 'end') { observer.complete(); return; }
              } catch { /* ignorar */ }
            }
          }
        }
        observer.complete();
      })
      .catch(err => {
        if (err.name !== 'AbortError') observer.error(err);
        else observer.complete(); // cancelación manual → completar limpiamente
      });

      // Al cancelar el Observable → abortar el fetch
      return () => ctrl.abort();
    });
  }
}
