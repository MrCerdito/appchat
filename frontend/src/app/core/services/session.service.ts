import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Session } from '../models/session.model';
import { User } from '../models/user.model';
import { Message } from '../models/message.model';

export interface Colegio {
  id: string;
  nombre: string;
  link: string;
}

export interface RankingAsesor {
  id: string;
  name: string;
  status: string;
  activeChats: number;
  total: number;
  totalCerradas: number;
  totalRatings: number;
  avgEstrellas: number;
  bayesianAvg: number;
}

export interface AdvisorMetrics {
  advisor: {
    id: string;
    name: string;
    email: string;
    status: string;
    activeChats: number;
    createdAt: string;
  };
  hoy: number;
  semana: number;
  total: number;
  totalCerradas: number;
  totalActivas: number;
  tasaResolucion: number;
  avgResolucionMin: number;
  medianaResolucionMin: number;
  p95ResolucionMin: number;
  avgPrimeraRespuestaMin: number;
  medianaPrimeraRespuestaMin: number;
  p95PrimeraRespuestaMin: number;
  totalRatings: number;
  avgEstrellas: number;
  topEtiquetas: { etiqueta: string; count: number }[];
  comentarios: string[];
}

@Injectable({ providedIn: 'root' })
export class SessionService {

  constructor(private http: HttpClient) {}

  create(data: {
    clientName:     string;
    identificacion: string;
    apellido:       string;
    rol:            string;
    colegio:        string;
    colegioLink?:   string | null;
    tipoSolicitud:  string;
  }): Observable<Session> {
    return this.http.post<Session>(`${environment.apiUrl}/sessions`, data);
  }

  findAll(): Observable<Session[]> {
    return this.http.get<Session[]>(`${environment.apiUrl}/sessions`);
  }

  findWaiting(): Observable<Session[]> {
    return this.http.get<Session[]>(`${environment.apiUrl}/sessions/waiting`);
  }

  findOne(id: string): Observable<Session> {
    return this.http.get<Session>(`${environment.apiUrl}/sessions/${id}`);
  }

  getMessages(sessionId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${environment.apiUrl}/sessions/${sessionId}/messages`);
  }

  findAdvisors(): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/sessions/advisors`);
  }

  findAllAdmin(): Observable<Session[]> {
    return this.http.get<Session[]>(`${environment.apiUrl}/sessions/admin/all`);
  }

  findAllAdminPaginated(page: number, limit: number): Observable<{ data: Session[]; total: number; page: number; pages: number }> {
    return this.http.get<{ data: Session[]; total: number; page: number; pages: number }>(
      `${environment.apiUrl}/sessions/admin/all/paginated?page=${page}&limit=${limit}`,
    );
  }

  // Agregar este método al SessionService
  takeOver(sessionId: string): Observable<Session> {
    return this.http.patch<Session>(
      `${environment.apiUrl}/sessions/${sessionId}/takeover`, {}
    );
  }

  getColegios(): Observable<Colegio[]> {
    return this.http.get<Colegio[]>(`${environment.apiUrl}/sessions/colegios/list`);
  }

  getMetricsByAdvisor(advisorId: string): Observable<AdvisorMetrics> {
    return this.http.get<AdvisorMetrics>(
      `${environment.apiUrl}/sessions/metrics/asesor/${advisorId}`
    );
  }

  saveRating(
    sessionId  : string,
    estrellas  : number,
    comentario : string | null,
    etiquetas  : string[],
  ): Observable<any> {
    return this.http.post(
      `${environment.apiUrl}/sessions/${sessionId}/rating`,
      { estrellas, comentario, etiquetas },
    );
  }

  getRankingAsesores(): Observable<RankingAsesor[]> {
    return this.http.get<RankingAsesor[]>(
      `${environment.apiUrl}/sessions/metrics/ranking`
    );
  }

  getComentariosByAdvisor(advisorId: string, page = 1, limit = 10) {
    return this.http.get<{
      data: {
        id        : string;
        estrellas : number;
        comentario: string;
        etiquetas : string[];
        createdAt : string;
        clientName: string;
      }[];
      total: number;
      page : number;
      pages: number;
    }>(`${environment.apiUrl}/sessions/metrics/asesor/${advisorId}/comentarios?page=${page}&limit=${limit}`);
  }

  // ★ NUEVO — actualiza el estado del asesor directamente en BD por HTTP.
  // Se llama desde el dashboard al cambiar de estado y al hacer logout.
  // No depende del socket — garantiza que la BD siempre quede actualizada.
  setAdvisorStatus(status: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(
      `${environment.apiUrl}/sessions/advisor/status`,
      { status },
    );
  }

  getHorarioHoy(): Observable<{
    diaHoy: number; enJornada: boolean; horarios: any[]; mensaje: string 
}> {
  return this.http.get<any>(`${environment.apiUrl}/configuracion/horario-hoy`);
}

close(sessionId: string): Observable<any> {
  return this.http.post(`${environment.apiUrl}/sessions/${sessionId}/close`, {});
}

closeAnonymous(sessionId: string): Observable<any> {
  return this.http.post(`${environment.apiUrl}/sessions/${sessionId}/close-anonymous`, {});
}

getCodigo(sessionId: string): Observable<{ codigo: string }> {
  return this.http.get<{ codigo: string }>(`${environment.apiUrl}/sessions/${sessionId}/codigo`);
}
}