import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts?: { todos: number; advisor: number; admin: number; desarrollador: number; interno: number; superadmin: number };
}

export interface ConectividadAsesor {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl: string | null;
  estado: 'online' | 'busy' | 'meeting' | 'almuerzo' | 'offline';
  conectado: boolean;
  activeChats: number;
  activo: boolean;
}

export interface ConectividadResult {
  checkedAt: string;
  total: number;
  conectados: number;
  inactivos: number;
  conError: number;
  porcentaje: number;
  asesores: ConectividadAsesor[];
}

export interface Metrics {
  total: number;
  active: number;
  waiting: number;
  closed: number;
  avgMinutes: number;
  medianaMinutos: number;
  p95Minutos: number;
  advisors: User[];
}

export interface PeriodoActividad {
  desde: string;
  hasta: string | null;
  duracionMs: number;
  estado: 'online' | 'busy' | 'meeting' | 'almuerzo' | 'offline';
  almuerzo: boolean;
  tipo: 'conexion' | 'desconexion' | 'status' | 'almuerzo_inicio' | 'almuerzo_fin';
  causa: string | null;
}

export interface ActividadAsesor {
  asesorId: string;
  nombre: string | null;
  email: string | null;
  profilePhotoUrl: string | null;
  rol: string | null;
  resumen: {
    disponibleMin: number;
    ocupadoMin: number;
    reunionMin: number;
    almuerzoMin: number;
    inactivoMin: number;
    desconexiones: number;
    primeraConexion: string | null;
    ultimaAccion: {
      tipo: string;
      estado: string;
      almuerzo: boolean;
      desde: string;
      mensaje: string;
    } | null;
    estadoFinal: 'online' | 'busy' | 'meeting' | 'almuerzo' | 'offline' | null;
    segmentoAbierto: boolean;
    sinActividadAntesDe: string | null;
  };
  periodos: PeriodoActividad[];
}

export interface JornadaDia {
  activa: boolean;
  slots: { inicio: string; fin: string }[];
}

export interface HistorialDia {
  fecha: string;
  esHoy: boolean;
  jornada: JornadaDia;
  asesores: ActividadAsesor[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getAdvisors(
    page = 1,
    limit = 20,
    search?: string,
    role?: 'admin' | 'advisor' | 'desarrollador' | 'interno' | 'superadmin' | 'todos',
    opts?: { activo?: boolean; conectado?: boolean },
  ): Observable<PaginatedResponse<User>> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search) params = params.set('search', search);
    if (role) params = params.set('role', role);
    if (opts?.activo !== undefined) params = params.set('activo', opts.activo);
    if (opts?.conectado !== undefined) params = params.set('conectado', opts.conectado);
    return this.http.get<PaginatedResponse<User>>(`${environment.apiUrl}/advisors`, { params });
  }

  getConectividad(): Observable<ConectividadResult> {
    return this.http.get<ConectividadResult>(`${environment.apiUrl}/advisors/conectividad`);
  }

  getHistorialDia(fecha?: string, asesorId?: string): Observable<HistorialDia> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    if (asesorId) params = params.set('asesor', asesorId);
    return this.http.get<HistorialDia>(`${environment.apiUrl}/advisors/conectividad/historial`, { params });
  }

  getAdvisor(id: string): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/advisors/${id}`);
  }

  createAdvisor(
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'advisor' | 'desarrollador' | 'interno' | 'superadmin' = 'advisor',
  ): Observable<User> {
    return this.http.post<User>(`${environment.apiUrl}/advisors`, { name, email, password, role });
  }

  updateAdvisor(
    id: string,
    data: { name?: string; email?: string; role?: 'admin' | 'advisor' | 'desarrollador' | 'interno' | 'superadmin' },
  ): Observable<User> {
    return this.http.put<User>(`${environment.apiUrl}/advisors/${id}`, data);
  }

  updatePassword(id: string, password: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${environment.apiUrl}/advisors/${id}/password`, { password });
  }

  toggleAdvisor(id: string): Observable<User> {
    return this.http.patch<User>(`${environment.apiUrl}/advisors/${id}/toggle`, {});
  }

  removeAdvisor(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/advisors/${id}`);
  }

  uploadPhoto(id: string, file: File): Observable<{ profilePhotoUrl: string }> {
    const formData = new FormData();
    formData.append('photo', file);
    return this.http.patch<{ profilePhotoUrl: string }>(`${environment.apiUrl}/advisors/${id}/photo`, formData);
  }

  deletePhoto(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${environment.apiUrl}/advisors/${id}/photo`);
  }

  importUsers(file: File): Observable<{ message: string; created: number; updated: number; errors: { row: number; email: string; error: string }[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ message: string; created: number; updated: number; errors: { row: number; email: string; error: string }[] }>(
      `${environment.apiUrl}/advisors/import-excel`,
      formData,
    );
  }

  exportUsers(): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/advisors/export-excel`, { responseType: 'blob' });
  }

  getMetrics(): Observable<Metrics> {
    return this.http.get<Metrics>(`${environment.apiUrl}/sessions/metrics`);
  }

  getAllSessions(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/admin/all`);
  }

  getRanking(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/metrics/ranking`);
  }

  getAllComentarios(page = 1, limit = 10, advisorId?: string) {
    const params = advisorId
      ? `?page=${page}&limit=${limit}&advisorId=${advisorId}`
      : `?page=${page}&limit=${limit}`;
    return this.http.get<{
      data: any[]; total: number; page: number; pages: number;
    }>(`${environment.apiUrl}/sessions/admin/comentarios${params}`);
  }
}
