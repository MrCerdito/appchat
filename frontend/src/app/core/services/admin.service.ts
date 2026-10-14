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

// ── Dashboard de métricas (GET /sessions/metrics/dashboard) ─────────────────
export interface DashboardKpis {
  chatsAtendidos: number;
  cerrados: number;
  activos: number;
  espera: number;
  ia: number;
  avgMinutes: number;
  totalRatings: number;
  promedioEstrellas: number;
}

export interface DashboardSerieItem {
  fecha: string;
  total: number;
  conAsesor: number;
  ia: number;
}

export interface DashboardAsesorItem {
  asesorId: string;
  nombre: string;
  total: number;
  cerrados: number;
  totalRatings: number;
  avgEstrellas: number;
}

export interface DashboardColegioItem {
  colegio: string;
  proyecto: string;
  total: number;
  conAsesor: number;
  ia: number;
}

export interface DashboardProyectoItem {
  proyecto: string;
  total: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  serie: DashboardSerieItem[];
  porAsesor: DashboardAsesorItem[];
  porColegio: DashboardColegioItem[];
  porProyecto: DashboardProyectoItem[];
}

// ── Dashboard por secciones (GET /metrics/dashboard) ────────────────────────
export type MxMarca = 'all' | 'Sian365' | 'ControlAcademic';

export interface MxConteo {
  clave: string;
  count: number;
}

export interface MxConteoPct extends MxConteo {
  pct: number;
}

export interface MxVariacion {
  sesiones: number | null;
  cerrados: number | null;
  ia: number | null;
  ratings: number | null;
  tickets: number | null;
  correos: number | null;
  capacitaciones: number | null;
}

export interface MxSerieDia {
  fecha: string;
  total: number;
  conAsesor: number;
  ia: number;
}

export interface MxFilaAsesor {
  id: string;
  nombre: string;
  atendidas: number;
  cerrados: number;
  activos: number;
  avgMinutes: number | null;
  avgEstrellas: number | null;
  ratings: number;
  tickets: number;
  pctDelTotal: number;
}

export interface MxFilaColegio {
  colegio: string;
  marca: string;
  sesiones: number;
  cerradas: number;
  activas: number;
  ia: number;
  humano: number;
  ratings: number;
  avgEstrellas: number | null;
  tickets: number;
}

export interface MxResumenKpis {
  sesiones: {
    total: number;
    cerrados: number;
    ia: number;
    humano: number;
    pctCierre: number | null;
    pctIa: number | null;
    clasificadas: number;
    avgMinutes: number | null;
  };
  ratings: { total: number; promedio: number | null };
  correos: { total: number; noLeidos: number };
  tickets: { total: number; abiertos: number; resueltos: number };
  capacitaciones: { total: number; virtuales: number; presenciales: number };
  ticketsPorEstado: MxConteo[];
}

export interface MxResumen {
  kpis: MxResumenKpis;
  variacion: MxVariacion;
  serie: MxSerieDia[];
  proyectos: { proyecto: string; total: number }[];
  comentarios: { comentario: string; estrellas: number; fecha: string; colegio: string | null; asesor: string | null }[];
  colegios: MxFilaColegio[];
  asesores: MxFilaAsesor[];
  actividad: {
    capacitaciones: number;
    proximasReuniones: number;
    erroresIa: number;
    cierresError: number;
    solicitudes: number;
    desconexiones: number;
  };
}

export interface MxRequerimientos {
  kpis: {
    cierresRequerimiento: number;
    tickets: { total: number; abiertos: number; resueltos: number };
    clasificadasSesion: number;
  };
  cierresPorTipo: { tipo: string; count: number }[];
  ticketsPorEstado: MxConteo[];
  ticketsPorPrioridad: MxConteo[];
  ticketsPorCategoria: MxConteo[];
  sla: { promResolucionMin: number | null; vencidos: number };
  detalleTickets: { fecha: string; colegio: string | null; asesor: string | null; categoria: string | null; prioridad: string | null; estado: string; resolucionMin: number | null }[];
  detalleRequerimientos: { fecha: string; colegio: string | null; asesor: string | null; notas: string; seguimiento: boolean }[];
}

export interface MxColegios {
  kpis: { colegiosActivos: number; ticketsAsociados: number; sesiones: number; avgEstrellas: number | null };
  tabla: MxFilaColegio[];
  estrellas: { colegio: string; total: number; avg: number }[];
  ticketsPorColegio: { colegio: string; total: number }[];
}

export interface MxAsesoria {
  kpis: { asesoresActivos: number; cerrados: number; activos: number; avgEstrellas: number | null };
  tabla: MxFilaAsesor[];
  topCerrados: { nombre: string; cerrados: number }[];
}

export interface MxCapacitaciones {
  kpis: { capacitaciones: { total: number; virtuales: number; presenciales: number } };
  porModalidad: MxConteo[];
  porMarca: MxConteo[];
  porDia: { fecha: string; count: number }[];
  tabla: { id: string; subject: string; startDateTime: string; modalidad: string; marca: string; organizador: string; duracion: number; joinUrl: string | null }[];
  proximas: number;
}

export interface MxErrores {
  kpis: { erroresIa: number; operacionesIa: number; tasaErrorIa: number | null; cierresError: number; comunicadosFallidos: number };
  serieIa: { fecha: string; count: number }[];
  porTipo: MxConteo[];
  comunicados: { total: number; fallidos: number; enviados: number };
  tabla: { fecha: string; fuente: string; mensaje: string; colegio: string | null; asesor: string | null }[];
}

export interface MxSolicitudes {
  kpis: { total: number; topTipo: string | null; pctClasificadas: number; clasificadas: number };
  distribucion: { clave: string; count: number; pct: number; variacion: number | null }[];
  serie: { fecha: string; count: number }[];
  porMarca: MxConteo[];
}

export interface MxConexiones {
  kpis: { disponibleMin: number; ocupadoMin: number; reunionMin: number; almuerzoMin: number; inactivoMin: number; desconexiones: number };
  distribucion: { estado: string; minutos: number }[];
  porDia: { fecha: string; count: number }[];
  tabla: { id: string; nombre: string; disponibleMin: number; ocupadoMin: number; reunionMin: number; almuerzoMin: number; inactivoMin: number; desconexiones: number; primeraConexion: string | null; ultimaConexion: string | null }[];
}

export interface MetricsDashboard {
  generadoEn: string;
  filtros: { marca: string; desde: string | null; hasta: string | null; asesorId: string | null };
  resumen: MxResumen;
  requerimientos: MxRequerimientos;
  colegios: MxColegios;
  asesoria: MxAsesoria;
  capacitaciones: MxCapacitaciones;
  errores: MxErrores;
  solicitudes: MxSolicitudes;
  conexiones: MxConexiones;
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

  /** Dashboard del admin con filtros: asesor, proyecto (marca) y rango de fechas. */
  getDashboard(filtros: {
    asesorId?: string;
    proyecto?: string;
    desde?: string;
    hasta?: string;
  }): Observable<DashboardData> {
    let params = new HttpParams();
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    if (filtros.proyecto) params = params.set('proyecto', filtros.proyecto);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    return this.http.get<DashboardData>(
      `${environment.apiUrl}/sessions/metrics/dashboard`,
      { params },
    );
  }

  /**
   * Dashboard por secciones (GET /metrics/dashboard): rango y marca se
   * consultan en el backend con caché de 30s. `desde`/`hasta` son días
   * locales (YYYY-MM-DD, inclusivos).
   */
  getMetricsDashboard(filtros: {
    marca?: MxMarca;
    desde?: string;
    hasta?: string;
    asesorId?: string;
  }): Observable<MetricsDashboard> {
    let params = new HttpParams();
    if (filtros.marca) params = params.set('marca', filtros.marca);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get<MetricsDashboard>(`${environment.apiUrl}/metrics/dashboard`, { params });
  }

  /** Descarga el mismo dashboard como Excel multi-hoja (admin). */
  exportMetricsDashboard(filtros: {
    marca?: MxMarca;
    desde?: string;
    hasta?: string;
    asesorId?: string;
  }): Observable<Blob> {
    let params = new HttpParams();
    if (filtros.marca) params = params.set('marca', filtros.marca);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get(`${environment.apiUrl}/metrics/export`, {
      params,
      responseType: 'blob',
    });
  }

  getAllSessions(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/admin/all`);
  }

  getRanking(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/metrics/ranking`);
  }

  getAllComentarios(page = 1, limit = 10, advisorId?: string, desde?: string, hasta?: string) {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (advisorId) params = params.set('advisorId', advisorId);
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<{
      data: any[]; total: number; page: number; pages: number;
    }>(`${environment.apiUrl}/sessions/admin/comentarios`, { params });
  }
}
