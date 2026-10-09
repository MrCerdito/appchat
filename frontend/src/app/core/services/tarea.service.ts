import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Tarea,
  TareaDetalle,
  TareaListResponse,
  TareaProgresoTicket,
  TareaCreateDto,
  TareaUpdateDto,
  TareaQuery,
  TareaDeleteResult,
  TareaComentario,
  TareaEstadisticas,
} from '../models/tarea.model';

/**
 * Cliente HTTP del workspace de tareas.
 *
 * Solo `desarrollador` y `admin` pueden consumir estas rutas: el backend lo
 * exige con `@Permiso('tareas')` y `@Roles('admin','desarrollador')`.
 */
@Injectable({ providedIn: 'root' })
export class TareaService {
  private readonly base = `${environment.apiUrl}/tareas`;

  constructor(private http: HttpClient) {}

  private toParams(query?: TareaQuery): HttpParams {
    let params = new HttpParams();
    if (!query) return params;

    // Los arrays viajan como CSV: es lo que el DTO del backend sabe deshacer
    // con un unico `@Transform`, y evita repetir la clave N veces.
    if (query.status?.length) params = params.set('status', query.status.join(','));
    if (query.prioridad?.length) params = params.set('prioridad', query.prioridad.join(','));
    if (query.tags?.length) params = params.set('tags', query.tags.join(','));
    if (query.ticketId) params = params.set('ticketId', query.ticketId);
    if (query.moduloId) params = params.set('moduloId', query.moduloId);
    if (query.asignadoA) params = params.set('asignadoA', query.asignadoA);
    if (query.creadoPor) params = params.set('creadoPor', query.creadoPor);
    if (query.q?.trim()) params = params.set('q', query.q.trim());
    if (query.soloSinTicket) params = params.set('soloSinTicket', 'true');
    if (query.soloRaiz) params = params.set('soloRaiz', 'true');
    if (query.vista) params = params.set('vista', query.vista);
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);

    return params;
  }

  findAll(query?: TareaQuery): Observable<TareaListResponse> {
    return this.http.get<TareaListResponse>(this.base, { params: this.toParams(query) });
  }

  findOne(id: string): Observable<TareaDetalle> {
    return this.http.get<TareaDetalle>(`${this.base}/${id}`);
  }

  /**
   * Crea una tarea o, si el dto trae `parentTaskId`, una subtarea. El progreso
   * del ticket se pide aparte porque el detalle del ticket lo muestra siempre.
   */
  create(dto: TareaCreateDto): Observable<TareaDetalle> {
    return this.http.post<TareaDetalle>(this.base, dto);
  }

  update(id: string, dto: TareaUpdateDto): Observable<TareaDetalle> {
    return this.http.patch<TareaDetalle>(`${this.base}/${id}`, dto);
  }

  remove(id: string): Observable<TareaDeleteResult> {
    return this.http.delete<TareaDeleteResult>(`${this.base}/${id}`);
  }

  progresoTicket(ticketId: string): Observable<TareaProgresoTicket> {
    return this.http.get<TareaProgresoTicket>(`${this.base}/progreso/${ticketId}`);
  }

  estadisticas(dias = 7): Observable<TareaEstadisticas> {
    return this.http.get<TareaEstadisticas>(`${this.base}/estadisticas`, { params: { dias } });
  }

  setAssignees(id: string, userIds: string[]): Observable<TareaDetalle> {
    return this.http.post<TareaDetalle>(`${this.base}/${id}/asignados`, { userIds });
  }

  addComment(id: string, contenido: string): Observable<TareaComentario> {
    return this.http.post<TareaComentario>(`${this.base}/${id}/comentarios`, { contenido });
  }

  addTime(id: string, dto: { minutos: number; nota?: string }): Observable<{ minutos: number; totalMinutos: number }> {
    return this.http.post<{ minutos: number; totalMinutos: number }>(`${this.base}/${id}/tiempo`, dto);
  }

  removeTime(id: string, entryId: string): Observable<{ totalMinutos: number }> {
    return this.http.delete<{ totalMinutos: number }>(`${this.base}/${id}/tiempo/${entryId}`);
  }

  /** Persiste el orden de una columna del kanban. */
  reorder(dto: { status: string; orden: string[]; parentTaskId?: string }): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/reordenar`, dto);
  }
}