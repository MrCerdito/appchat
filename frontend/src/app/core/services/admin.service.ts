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
/** Proyecto del colegio: Sian365 o ControlAcademic (o 'all' sin filtrar). */
export type MxProyecto = 'all' | 'Sian365' | 'ControlAcademic';

/** Filtros compartidos por el dashboard y su exportación en Excel. */
export interface MetricasFiltros {
  proyecto?: MxProyecto;
  /** Día local YYYY-MM-DD, inclusivo. */
  desde?: string;
  hasta?: string;
  asesorId?: string;
  /** Solo el dashboard: página de la tabla de Reuniones (1 por defecto). */
  tablaPagina?: number;
}

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
  reuniones: number | null;
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
  proyecto: string;
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
  reuniones: { total: number; virtuales: number; presenciales: number };
  ticketsPorEstado: MxConteo[];
}

export interface MxResumen {
  kpis: MxResumenKpis;
  variacion: MxVariacion;
  proyectos: { proyecto: string; total: number }[];
  colegios: MxFilaColegio[];
  asesores: MxFilaAsesor[];
  actividad: {
    proximasReuniones: number;
  };
  gestionCorreos: {
    porCategoria: { clave: string; count: number; carpeta: string | null }[];
    resueltos: number;
    pendientes: number;
    total: number;
  };
}

/** Un asesor en el nivel 1 de la pestaña «Tickets/Correos». */
export interface MxFilaAsesorTc {
  id: string;
  asesor: string;
  tickets: number;
  ticketsAbiertos: number;
  ticketsResueltos: number;
  correos: number;
}

/** Un ticket en el nivel 2 (detalle del asesor). */
export interface MxFilaTicketTc {
  id: string;
  fecha: string;
  colegio: string | null;
  categoria: string;
  /** Categoría de Gestión asignada (selector compartido) o «Sin clasificar». */
  gestion: string;
  prioridad: string;
  estado: string;
  resolucionMin: number | null;
}

/** Un correo en el nivel 2: carpeta de Outlook + su categoría de Gestión. */
export interface MxFilaCorreoTc {
  id: string;
  fecha: string;
  asunto: string;
  carpeta: string;
  gestion: string;
}

export interface MxTicketsCorreos {
  /** Nivel 1: todos los asesores del rol con sus conteos del rango. */
  asesores: MxFilaAsesorTc[];
  /** Nivel 2: hasta 50 tickets más recientes de CADA asesor. */
  tickets: MxFilaTicketTc[];
  /** Nivel 2: hasta 50 correos más recientes de CADA asesor. */
  correos: MxFilaCorreoTc[];
  /** Conteo por categoría de Gestión de los tickets, por asesor. */
  gestionTickets: { id: string; clave: string; count: number }[];
  /** Conteo por categoría de Gestión de los correos, por asesor. */
  gestionCorreos: { id: string; clave: string; count: number }[];
}

export interface MxColegios {
  kpis: { colegiosActivos: number; ticketsAsociados: number; sesiones: number; avgEstrellas: number | null };
  tabla: MxFilaColegio[];
}

export interface MxAsesoria {
  kpis: { asesoresActivos: number; cerrados: number; activos: number; avgEstrellas: number | null };
  tabla: MxFilaAsesor[];
}

/** Un asesor en la lista de la pestaña Atención. */
export interface MxFilaAsesorAtencion {
  id: string;
  asesor: string;
  /** Sesiones que cerró en el rango (= atendidas). */
  sesiones: number;
  /** Colegios distintos donde cerró al menos una sesión. */
  colegios: number;
  avgEstrellas: number | null;
}

/** Una fila de Atención: el par (asesor, colegio) ATENDIDO. */
export interface MxFilaAtencion {
  id: string;
  asesor: string;
  colegio: string;
  proyecto: string;
  /** Sesiones que este asesor CERRÓ en ESTE colegio. */
  atendidas: number;
  avgEstrellas: number | null;
}

export interface MxAtencion {
  /** Todos los asesores activos del filtro (también los que no atendieron). */
  asesores: MxFilaAsesorAtencion[];
  /** Pares (asesor, colegio) atendidos en el rango. */
  tabla: MxFilaAtencion[];
  /** Pares (asesor, colegio) que existen en el rango, aunque el `LIMIT` recorte. */
  tablaTotal: number;
}

/** Una fila de la lista de reuniones del rango elegido. */
export interface MxFilaReunion {
  id: string;
  subject: string;
  startDateTime: string;
  modalidad: string;
  /**
   * Tipo completo del evento: 'Reunion presencial', 'Reunion virtual',
   * 'Reunion equipo', 'Cumpleanos', 'Ausencia/permisos', 'Vacaciones' o
   * 'Incapacidad'. Es lo que decide el color, igual que en el Calendario.
   */
  categoria: string;
  /** Proyecto del colegio asociado: Sian365, ControlAcademic o 'Sin clasificar'. */
  proyecto: string;
  organizador: string;
  duracion: number;
  joinUrl: string | null;
  /** Korvix = creada desde la app; Teams = creada directo en Outlook. */
  origen: string;
}

export interface MxReuniones {
  kpis: { total: number; virtuales: number; presenciales: number };
  /** Conteo por tipo completo (cumpleaños, equipo, vacaciones...). */
  porCategoria: MxConteo[];
  /** Solo la página actual; el total real del rango está en `tablaTotal`. */
  tabla: MxFilaReunion[];
  tablaTotal: number;
  tablaPagina: number;
  tablaPaginas: number;
  /** Conteo exacto de las que faltan por empezar dentro del rango. */
  proximas: number;
  /** Las primeras `proximas` (tope corto) listas para pintar en la tarjeta. */
  proximasLista: MxFilaReunion[];
}

export interface MxSolicitudes {
  kpis: {
    total: number;
    topTipo: string | null;
    pctClasificadas: number;
    clasificadas: number;
    /** % de variación contra el MISMO tramo del mes anterior (null si el
     *  mes anterior no tuvo solicitudes). */
    vsMesAnterior: number | null;
  };
  distribucion: { clave: string; count: number; pct: number; variacion: number | null }[];
  serie: { fecha: string; count: number }[];
  /** Top de colegios que más han solicitado, con el tipo que más repiten. */
  porColegio: { colegio: string; count: number; topTipo: string | null }[];
}

export interface MxConexionPeriodo {
  desde: string;
  hasta: string | null;
  estado: string;
}

export interface MxConexionBarra {
  id: string;
  nombre: string;
  periodos: MxConexionPeriodo[];
  primera: string | null;
  ultima: string | null;
}

/** Línea de tiempo de UN día (GET /metrics/conexiones/dia). */
export interface MxConexionDia {
  fecha: string;
  asesores: MxConexionBarra[];
}

/** Evento del historial con duración calculada (LEAD) y causa del corte. */
export interface MxConexionEvento {
  fecha: string;
  desde: string;
  /** null = sigue en curso. */
  hasta: string | null;
  /** online | busy | meeting | almuerzo | offline (bucket del segmento). */
  estado: string;
  /** conexion | desconexion | status | almuerzo_inicio | almuerzo_fin | almuerzo. */
  tipo: string;
  /** connect | disconnect | manual | almuerzo | timeout | sistema | null. */
  causa: string | null;
  duracionMs: number;
}

/** Resumen por día de la ficha de un asesor. */
export interface MxConexionDiaResumen {
  fecha: string;
  disponibleMin: number;
  ocupadoMin: number;
  reunionMin: number;
  almuerzoMin: number;
  inactivoMin: number;
  desconexiones: number;
}

/** Ficha de seguimiento (GET /metrics/conexiones/historial). */
export interface MxConexionHistorial {
  kpis: {
    disponibleMin: number;
    ocupadoMin: number;
    reunionMin: number;
    almuerzoMin: number;
    inactivoMin: number;
    totalMin: number;
    conectadoMin: number;
    desconectadoMin: number;
    disponibilidadPct: number | null;
    desconexiones: number;
    corteTotalMin: number;
    cortePromMin: number | null;
    dias: number;
  };
  dias: MxConexionDiaResumen[];
  /** Más reciente primero; tope de 1000 filas. */
  eventos: MxConexionEvento[];
}

export interface MxConexiones {
  kpis: {
    disponibleMin: number;
    ocupadoMin: number;
    reunionMin: number;
    almuerzoMin: number;
    inactivoMin: number;
    desconexiones: number;
    /** Total de minutos con segmentos registrados. */
    totalMin: number;
    /** Total − Inactivo: tiempo en línea. */
    conectadoMin: number;
    /** Minutos caídos (bucket offline). */
    desconectadoMin: number;
    /** Disponible ÷ (Total − Almuerzo); null sin base. */
    disponibilidadPct: number | null;
  };
  distribucion: { estado: string; minutos: number }[];
  porDia: { fecha: string; count: number }[];
  /** Minutos por estado, día a día (días sin actividad no aparecen). */
  minutosPorDia: {
    fecha: string;
    disponibleMin: number;
    ocupadoMin: number;
    reunionMin: number;
    almuerzoMin: number;
    inactivoMin: number;
  }[];
  tabla: { id: string; nombre: string; disponibleMin: number; ocupadoMin: number; reunionMin: number; almuerzoMin: number; inactivoMin: number; desconexiones: number; primeraConexion: string | null; ultimaConexion: string | null }[];
  barras: { fecha: string; asesores: MxConexionBarra[] } | null;
  /** Jornada laboral configurada (hora Bogotá); el eje de `barras` usa el rango real de actividad. */
  jornada: { ini: number; fin: number };
}

export interface MetricsDashboard {
  generadoEn: string;
  filtros: { proyecto: string; desde: string | null; hasta: string | null; asesorId: string | null };
  resumen: MxResumen;
  ticketsCorreos: MxTicketsCorreos;
  colegios: MxColegios;
  asesoria: MxAsesoria;
  atencion: MxAtencion;
  reuniones: MxReuniones;
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

// ── Historial de Conectividad (GET /conectividad) ────────────────────────────

export type HcMetricaMapa = 'desconexiones' | 'minutos' | 'afectados' | 'disponibilidad';
export type HcCerteza = 'alta' | 'media' | 'baja';

export interface HcFiltros {
  desde?: string;
  hasta?: string;
  asesorId?: string;
}

export interface HcComparacion {
  desde: string;
  hasta: string;
  disponibleMin: number;
  ocupadoMin: number;
  desconexiones: number;
  disponibilidadPct: number | null;
}

export interface HcTendenciaDia {
  fecha: string;
  disponibleMin: number;
  ocupadoMin: number;
  reunionMin: number;
  almuerzoMin: number;
  inactivoMin: number;
  sinConexionMin: number;
  desconexiones: number;
  disponibilidadPct: number | null;
}

export interface HcPorHora {
  hora: number;
  desconexiones: number;
  disponibleMin: number;
  inactivoMin: number;
}

export interface HcRankingFila {
  id: string;
  nombre: string;
  estado: string;
  disponibleMin: number;
  ocupadoMin: number;
  reunionMin: number;
  almuerzoMin: number;
  inactivoMin: number;
  sinConexionMin: number;
  conectadoMin: number;
  totalMin: number;
  desconexiones: number;
  interrupcionMin: number;
  recuperacionPromMin: number;
  sinRecuperacion: number;
  /** null = sin datos suficientes (menos de 1h en el periodo). */
  disponibilidadPct: number | null;
  estabilidadPct: number | null;
  /** Δ disponibilidad en puntos porcentuales vs periodo anterior. */
  tendenciaPct: number | null;
}

/** GET /conectividad/resumen: KPIs, comparación, tendencia y ranking. */
export interface HcResumen {
  rango: { desde: string; hasta: string };
  jornada: { ini: number; fin: number };
  conectadosAhora: { total: number; nombres: string[] };
  kpis: {
    disponibleMin: number;
    ocupadoMin: number;
    reunionMin: number;
    almuerzoMin: number;
    inactivoMin: number;
    sinConexionMin: number;
    totalMin: number;
    conectadoMin: number;
    desconexiones: number;
    desconexionesManual: number;
    desconexionesTimeout: number;
    desconexionesDisconnect: number;
    desconexionesOtro: number;
    interrupcionMin: number;
    cortePromMin: number;
    corteMedMin: number;
    recuperacionPromMin: number;
    recuperacionMedMin: number;
    sinRecuperacion: number;
    sesionesTramos: number;
    sesionPromMin: number;
    sesionMedMin: number;
    disponibilidadPct: number | null;
    estabilidadPct: number | null;
  };
  comparacion: HcComparacion;
  tendencia: HcTendenciaDia[];
  porHora: HcPorHora[];
  ranking: HcRankingFila[];
}

export interface HcMapaCelda {
  dia: number;
  hora: number;
  desconexiones: number;
  minutos: number;
  afectados: number;
  disponibilidadPct: number | null;
  valor: number | null;
}

export interface HcMapaCalor {
  rango: { desde: string; hasta: string };
  metrica: HcMetricaMapa;
  items: HcMapaCelda[];
}

export type HcIncidenteEstado = 'nuevo' | 'en_revision' | 'confirmado' | 'descartado';

export interface HcIncidente {
  clave: string;
  tipo: 'corte' | 'rafaga' | 'dia';
  userId: string;
  nombre: string;
  desde: string;
  hasta: string | null;
  duracionMin: number | null;
  causa: string | null;
  reglas: string[];
  nEventos?: number;
  estado: HcIncidenteEstado;
  comentario: string | null;
  responsableId: string | null;
  revisadoEn: string | null;
}

export interface HcIncidentesRes {
  rango: { desde: string; hasta: string };
  reglas: { rafagaHora: number; desconexionesDia: number; corteMin: number; criticoMin: number };
  resumen: { total: number; cortes: number; rafagas: number; diasInestables: number; abiertos: number };
  total: number;
  page: number;
  pages: number;
  items: HcIncidente[];
}

export interface HcEvento {
  id: string;
  asesorId: string;
  nombre: string;
  fecha: string;
  desde: string;
  hasta: string;
  duracionMs: number;
  tipo: string;
  causa: string | null;
  estado: string;
  /** Clasificación de la causa: etiqueta legible + nivel de certeza. */
  causaInfo: { etiqueta: string; certeza: HcCerteza } | null;
}

export interface HcEventosRes {
  rango: { desde: string; hasta: string };
  total: number;
  page: number;
  pages: number;
  items: HcEvento[];
}

export interface HcEventosFiltros extends HcFiltros {
  tipo?: string;
  causa?: string;
  estado?: string;
  durMin?: number;
  durMax?: number;
  page?: number;
  limit?: number;
  orden?: 'asc' | 'desc';
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

  /** Dashboard del admin con filtros: asesor, proyecto y rango de fechas. */
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
   * Dashboard por secciones (GET /metrics/dashboard): rango y proyecto se
   * consultan en el backend con caché de 30s. `desde`/`hasta` son días
   * locales (YYYY-MM-DD, inclusivos). `tablaPagina` pagina la tabla de
   * Reuniones (el total real del rango va en `reuniones.tablaTotal`).
   */
  getMetricsDashboard(filtros: MetricasFiltros): Observable<MetricsDashboard> {
    let params = new HttpParams();
    if (filtros.proyecto) params = params.set('proyecto', filtros.proyecto);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    if (filtros.tablaPagina && filtros.tablaPagina > 1) {
      params = params.set('tablaPagina', String(filtros.tablaPagina));
    }
    return this.http.get<MetricsDashboard>(`${environment.apiUrl}/metrics/dashboard`, { params });
  }

  /**
   * Descarga el mismo dashboard como Excel multi-hoja (admin). La hoja
   * Reuniones trae la lista COMPLETA del rango, no la página visible.
   */
  exportMetricsDashboard(filtros: Omit<MetricasFiltros, 'tablaPagina'>): Observable<Blob> {
    let params = new HttpParams();
    if (filtros.proyecto) params = params.set('proyecto', filtros.proyecto);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get(`${environment.apiUrl}/metrics/export`, {
      params,
      responseType: 'blob',
    });
  }

  /**
   * Línea de tiempo de UN día de la pestaña Conexiones
   * (GET /metrics/conexiones/dia). `fecha` es día Bogotá YYYY-MM-DD;
   * `asesorId` opcional para ver solo a un asesor.
   */
  getMetricasConexionDia(
    fecha: string,
    filtros: Omit<MetricasFiltros, 'desde' | 'hasta' | 'tablaPagina'>,
  ): Observable<MxConexionDia> {
    let params = new HttpParams().set('fecha', fecha);
    if (filtros.proyecto) params = params.set('proyecto', filtros.proyecto);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get<MxConexionDia>(`${environment.apiUrl}/metrics/conexiones/dia`, { params });
  }

  /**
   * Ficha de seguimiento de un asesor (GET /metrics/conexiones/historial):
   * eventos con hora/duración/causa, resumen por día y KPIs del agente.
   */
  getMetricasConexionHistorial(
    asesorId: string,
    filtros: Omit<MetricasFiltros, 'asesorId' | 'tablaPagina'>,
  ): Observable<MxConexionHistorial> {
    let params = new HttpParams().set('asesorId', asesorId);
    if (filtros.proyecto) params = params.set('proyecto', filtros.proyecto);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    return this.http.get<MxConexionHistorial>(`${environment.apiUrl}/metrics/conexiones/historial`, { params });
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

  // ── Historial de Conectividad (5 pestañas) ────────────────────────────────

  /** KPIs, comparación, tendencia, ranking (GET /conectividad/resumen). */
  getConectividadResumen(filtros: HcFiltros): Observable<HcResumen> {
    let params = new HttpParams();
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get<HcResumen>(`${environment.apiUrl}/conectividad/resumen`, { params });
  }

  /** Mapa de calor día-semana × hora (GET /conectividad/mapa-calor). */
  getConectividadMapa(
    filtros: HcFiltros,
    metrica: HcMetricaMapa,
  ): Observable<HcMapaCalor> {
    let params = new HttpParams().set('metrica', metrica);
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    return this.http.get<HcMapaCalor>(`${environment.apiUrl}/conectividad/mapa-calor`, { params });
  }

  /** Incidentes detectados con su revisión humana (GET /conectividad/incidentes). */
  getConectividadIncidentes(
    filtros: HcFiltros,
    extra: { estado?: string; page?: number; limit?: number } = {},
  ): Observable<HcIncidentesRes> {
    let params = new HttpParams();
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    if (extra.estado) params = params.set('estado', extra.estado);
    if (extra.page) params = params.set('page', extra.page);
    if (extra.limit) params = params.set('limit', extra.limit);
    return this.http.get<HcIncidentesRes>(`${environment.apiUrl}/conectividad/incidentes`, { params });
  }

  /** Revisa un incidente: estado de revisión + comentario (PATCH). El
   *  responsable se toma del JWT en el backend. */
  revisarIncidente(
    userId: string,
    clave: string,
    data: { estado: HcIncidenteEstado; comentario?: string },
  ): Observable<HcIncidente> {
    return this.http.patch<HcIncidente>(
      `${environment.apiUrl}/conectividad/incidentes/${userId}/${encodeURIComponent(clave)}`,
      data,
    );
  }

  /** Historial paginado con filtros (GET /conectividad/eventos). */
  getConectividadEventos(filtros: HcEventosFiltros): Observable<HcEventosRes> {
    let params = new HttpParams();
    const set = (k: string, v: unknown) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    };
    set('desde', filtros.desde);
    set('hasta', filtros.hasta);
    set('asesorId', filtros.asesorId);
    set('tipo', filtros.tipo);
    set('causa', filtros.causa);
    set('estado', filtros.estado);
    set('durMin', filtros.durMin);
    set('durMax', filtros.durMax);
    set('page', filtros.page);
    set('limit', filtros.limit);
    set('orden', filtros.orden);
    return this.http.get<HcEventosRes>(`${environment.apiUrl}/conectividad/eventos`, { params });
  }

  /** Descarga el historial filtrado como CSV (GET /conectividad/export). */
  exportConectividadCsv(filtros: HcEventosFiltros): Observable<Blob> {
    let params = new HttpParams();
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.asesorId) params = params.set('asesorId', filtros.asesorId);
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros.causa) params = params.set('causa', filtros.causa);
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.durMin) params = params.set('durMin', filtros.durMin);
    if (filtros.durMax) params = params.set('durMax', filtros.durMax);
    if (filtros.orden) params = params.set('orden', filtros.orden);
    return this.http.get(`${environment.apiUrl}/conectividad/export`, {
      params,
      responseType: 'blob',
    });
  }
}
