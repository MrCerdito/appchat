/**
 * Workspace de tareas internas.
 *
 * Las subtareas se anidan sin limite de profundidad: `parentTaskId` apunta al
 * padre inmediato y el arbol completo llega en `hijos`. Por eso `hijos` es
 * opcional (solo lo devuelve el detalle) y el modelo no tiene un campo `nivel`
 * fijo.
 */

export const TAREA_STATUSES = [
  'pendiente',
  'en_progreso',
  'bloqueada',
  'revision',
  'completada',
  'cancelada',
] as const;

export type TareaStatus = (typeof TAREA_STATUSES)[number];

export const TAREA_PRIORIDADES = ['low', 'medium', 'high', 'critical'] as const;
export type TareaPrioridad = (typeof TAREA_PRIORIDADES)[number];

export interface TareaStatusMeta {
  key: TareaStatus;
  label: string;
  /** Clase del badge en la tarjeta. */
  badge: string;
  /** Color de la cabecera de la columna del kanban. */
  column: string;
}

export const TAREA_STATUS_META: TareaStatusMeta[] = [
  { key: 'pendiente', label: 'Pendiente', badge: 'is-pendiente', column: '#94a3b8' },
  { key: 'en_progreso', label: 'En progreso', badge: 'is-progreso', column: '#3b82f6' },
  { key: 'bloqueada', label: 'Bloqueada', badge: 'is-bloqueada', column: '#ef4444' },
  { key: 'revision', label: 'En revisión', badge: 'is-revision', column: '#a855f7' },
  { key: 'completada', label: 'Completada', badge: 'is-completada', column: '#10b981' },
  { key: 'cancelada', label: 'Cancelada', badge: 'is-cancelada', column: '#64748b' },
];

export const TAREA_PRIORIDAD_META: Record<TareaPrioridad, { label: string; badge: string }> = {
  low: { label: 'Baja', badge: 'p-low' },
  medium: { label: 'Media', badge: 'p-medium' },
  high: { label: 'Alta', badge: 'p-high' },
  critical: { label: 'Crítica', badge: 'p-critical' },
};

export interface TareaAssignee {
  userId: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
}

export interface Tarea {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  status: TareaStatus;
  prioridad: TareaPrioridad;
  parentTaskId: string | null;
  ticketId: string | null;
  ticketCodigo: string | null;
  ticketTitulo: string | null;
  moduloId: string | null;
  moduloNombre: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdByAvatarUrl: string | null;
  tags: string[];
  dueDate: string | null;
  reminderSentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeSpentMinutes: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  asignados: TareaAssignee[];
  /** Subtitulos DIRECTOS. El rollup de todo el subarbol lo calcula el front. */
  subtareas: { total: number; completadas: number };
  /** Solo en las vistas con arbol: 0 = tarea raiz. */
  profundidad?: number;
  hijos?: Tarea[];
}

export interface TareaComentario {
  id: string;
  contenido: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
}

export interface TareaTiempo {
  id: string;
  minutos: number;
  nota: string | null;
  loggedAt: string;
  userId: string | null;
  userName: string;
}

/** Detalle: la tarea + sus tres listas + el subarbol anidado. */
export interface TareaDetalle extends Tarea {
  comentarios: TareaComentario[];
  tiempos: TareaTiempo[];
  arbol: Tarea[];
}

export interface TareaListResponse {
  items: Tarea[];
  total: number;
  page: number;
  /** Conteo por estado, con los filtros aplicados salvo el de estado. */
  resumen: Record<string, number>;
}

export interface TareaProgresoTicket {
  total: number;
  completadas: number;
  porcentaje: number;
}

/** Agregados del panel. Los calcula el backend sobre todo lo visible. */
export interface TareaEstadisticas {
  porEstado: Record<string, number>;
  vencidas: number;
  hoy: number;
  sinAsignar: number;
  completadasSemana: number;
  minutosSemana: number;
  minutosRegistrados: number;
  carga: Array<{
    userId: string;
    nombre: string;
    avatarUrl: string | null;
    abiertas: number;
    completadas: number;
    minutos: number;
  }>;
  porModulo: Array<{ moduloId: string; nombre: string; total: number; completadas: number }>;
  serie: TareaSerieDia[];
  dias: number;
}

/** Un punto por dia del grafico de actividad. */
export interface TareaSerieDia {
  fecha: string;
  label: string;
  creadas: number;
  enProgreso: number;
  completadas: number;
  vencidas: number;
}

export interface TareaCreateDto {
  titulo: string;
  descripcion?: string;
  status?: TareaStatus;
  prioridad?: TareaPrioridad;
  ticketId?: string;
  /** Presente = crear una subtarea de esa tarea. */
  parentTaskId?: string;
  moduloId?: string;
  asignados?: string[];
  tags?: string[];
  dueDate?: string;
}

/**
 * `parentTaskId` no se incluye a proposito: la jerarquia se fija al crear y el
 * backend rechaza el reparentado. Ver `UpdateTareaDto` en el servidor.
 */
export interface TareaUpdateDto {
  titulo?: string;
  descripcion?: string | null;
  status?: TareaStatus;
  prioridad?: TareaPrioridad;
  ticketId?: string | null;
  moduloId?: string | null;
  asignados?: string[];
  tags?: string[];
  dueDate?: string | null;
  resetReminder?: 'true' | 'false';
}

export interface TareaQuery {
  status?: string[];
  prioridad?: string[];
  tags?: string[];
  ticketId?: string;
  moduloId?: string;
  asignadoA?: string;
  creadoPor?: string;
  q?: string;
  soloSinTicket?: boolean;
  soloRaiz?: boolean;
  vista?: 'panel' | 'kanban' | 'lista';
  page?: number;
  limit?: number;
}

export interface TareaDeleteResult {
  eliminadas: number;
  /** Subtitulos que arrastra el borrado en cascada. */
  descendientes: number;
}