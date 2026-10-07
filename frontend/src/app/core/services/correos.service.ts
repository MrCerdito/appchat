import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MensajeCorreo {
  id: string;
  graphMessageId: string;
  subject: string | null;
  fromNombre: string | null;
  fromEmail: string | null;
  para: string[];
  cc: string[];
  /** Categorias de Outlook. Vacio = el correo aun no esta clasificado. */
  categorias: string[];
  bodyPreview: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  importance: string;
  conversationId: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  origen: string;
  adjuntos: number;
}

export interface CategoriaConTotal {
  categoria: string;
  total: number;
}

export interface BandejaCorreo {
  mensajes: MensajeCorreo[];
  total: number;
  /** Mensajes de la carpeta sin aplicar el filtro de no leidos. */
  totalCarpeta: number;
  /** No leidos en la carpeta, sin importar el filtro activo. Alimenta el boton. */
  noLeidosTotal: number;
  /** Mensajes sin categoria en toda la carpeta; independiente de otros filtros. */
  sinCategoriaTotal: number;
  carpetaNombre: string;
  folderId: string;
  /** Categorias reales de la carpeta con su conteo, para el filtro lateral. */
  categoriasDisponibles: CategoriaConTotal[];
}

/** Presets de fecha del filtro lateral. */
export type PresetFechaCorreo = 'hoy' | 'ayer' | '7d';

export interface FiltrosBandeja {
  folderId?: string;
  limite?: number;
  offset?: number;
  soloNoLeidos?: boolean;
  buscar?: string;
  categoria?: string;
  sinCategoria?: boolean;
  preset?: PresetFechaCorreo;
  desde?: string;
  hasta?: string;
}

export interface CuerpoCorreo {
  /** Ya viene sanitizado por el backend. Renderizar solo dentro de iframe sandbox. */
  html: string;
  truncado: boolean;
  mensaje: MensajeCorreo;
}

export interface AdjuntoCorreo {
  id: string;
  graphAttachmentId: string;
  nombre: string | null;
  contentType: string | null;
  tamano: number | null;
  isInline: boolean;
}

export interface CarpetaCorreo {
  id: string;
  displayName: string | null;
  totalItemCount?: number;
  unreadItemCount?: number;
}

/** Marca interna del filtro "sin categoría"; nunca se manda como categoría. */
export const SIN_CATEGORIA = '__sin_categoria__';

export interface EstadoCorreos {
  buzon?: string;
  buzonOk?: boolean;
  buzonId?: string;
  carpetaPadre?: string;
  carpetaOk?: boolean;
  carpetaId?: string;
  carpetaNombre?: string;
  carpetaError?: string;
  error?: string;
  mensajesEnEspejo?: number;
  carpetasDisponibles?: string[];
  intervaloMinutos?: number;
  sincronizacionDeshabilitada?: boolean;
}

export interface ResultadoSincronizacion {
  carpetaId: string;
  carpetaNombre: string;
  nuevos: number;
  actualizados: number;
  eliminados: number;
  resincronizado: boolean;
}

@Injectable({ providedIn: 'root' })
export class CorreosService {
  private readonly url = `${environment.apiUrl}/correos`;

  constructor(private http: HttpClient) {}

  /** Diagnóstico: dice si falta el permiso de Microsoft en vez de mostrar vacío. */
  estado(): Observable<EstadoCorreos> {
    return this.http.get<EstadoCorreos>(`${this.url}/estado`);
  }

  listar(opciones: FiltrosBandeja = {}): Observable<BandejaCorreo> {
    let params = new HttpParams().set('limite', opciones.limite ?? 50).set('offset', opciones.offset ?? 0);
    if (opciones.folderId) params = params.set('folderId', opciones.folderId);
    if (opciones.soloNoLeidos) params = params.set('soloNoLeidos', 'true');
    if (opciones.buscar) params = params.set('buscar', opciones.buscar);
    if (opciones.categoria) params = params.set('categoria', opciones.categoria);
    if (opciones.sinCategoria) params = params.set('sinCategoria', 'true');
    if (opciones.preset) params = params.set('preset', opciones.preset);
    if (opciones.desde) params = params.set('desde', opciones.desde);
    if (opciones.hasta) params = params.set('hasta', opciones.hasta);
    return this.http.get<BandejaCorreo>(`${this.url}/mensajes`, { params });
  }

  cuerpo(id: string): Observable<CuerpoCorreo> {
    return this.http.get<CuerpoCorreo>(`${this.url}/mensajes/${id}/cuerpo`);
  }

  adjuntos(id: string): Observable<AdjuntoCorreo[]> {
    return this.http.get<AdjuntoCorreo[]>(`${this.url}/mensajes/${id}/adjuntos`);
  }

  /**
   * Descarga un adjunto. Va con responseType blob porque el backend transmite el
   * binario en streaming desde Microsoft Graph.
   */
  descargarAdjunto(id: string, attachmentId: string): Observable<Blob> {
    return this.http.get(`${this.url}/mensajes/${id}/adjuntos/${attachmentId}`, {
      responseType: 'blob',
    });
  }

  carpetasDisponibles(): Observable<CarpetaCorreo[]> {
    return this.http.get<CarpetaCorreo[]>(`${this.url}/carpetas-disponibles`);
  }

  /**
   * @param manual `true` solo desde el boton "Buscar nuevos". El backend usa
   * esto para decidir si tiene derecho a saltarse el cooldown por falta del
   * permiso Mail.Read: la sincronizacion automatica al abrir la bandeja no debe
   * hacerlo, o cada asesor sin permiso golpearia Graph 60 veces por minuto.
   */
  sincronizar(manual = false): Observable<ResultadoSincronizacion> {
    return this.http.post<ResultadoSincronizacion>(
      `${this.url}/sincronizar`,
      {},
      { params: manual ? { manual: 'true' } : {} },
    );
  }
}
