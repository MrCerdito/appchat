import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Los seis estados en los que se agrupan los correos de un asesor. Cada correo
 * cae en uno solo: el backend lo resuelve con la precedencia de
 * RESUELTO > ESCALADO > GESTIONADO > EN PROCESO > Otros > Pendiente.
 */
export type CuboCorreo = 'pendiente' | 'en_proceso' | 'gestionado' | 'escalado' | 'resuelto' | 'otros';

/**
 * Nivel de SLA de una carpeta. Solo se llega a "critico" con correos SIN resolver:
 * lo resuelto no genera alerta.
 */
export type NivelSla = 'al_dia' | 'estable' | 'en_riesgo' | 'critico';

/** Una fila de la tabla: un asesor con sus conteos. */
export interface FilaAsesorSla {
  asesorId: string;
  asesor: string;
  /** Nombre de la carpeta en Outlook ("10.Jean M."). */
  carpeta: string;
  carpetaId: string | null;
  sincronizado: boolean;
  importadoCompleto: boolean;
  ultimoSync: string | null;
  ultimoRecibido: string | null;
  noLeidos: number;
  pendiente: number;
  enProceso: number;
  gestionado: number;
  escalado: number;
  resuelto: number;
  otros: number;
  total: number;
  /** Pendiente + en proceso + escalado. Es la base del nivel de SLA. */
  abiertos: number;
  nivel: NivelSla;
}

/** Carpeta de ASIGNADOS que no corresponde a ningun asesor del sistema. */
export interface CarpetaSinAsesor {
  carpeta: string;
  carpetaId: string;
  totalEnGraph: number;
  noLeidosEnGraph: number;
  sincronizada: boolean;
}

/** Suma de todos los asesores: los mismos campos, sin identidad de asesor. */
export interface TotalesCorreos {
  pendiente: number;
  enProceso: number;
  gestionado: number;
  escalado: number;
  resuelto: number;
  otros: number;
  total: number;
  abiertos: number;
  nivel: NivelSla;
}

/** Como de frescos estan las carpetas huerfanas, que son las unicas que Graph aporta. */
export type EstadoCarpetas = 'al_dia' | 'calculando' | 'sin_permiso';

export interface ResumenCorreosAdmin {
  generadoEn: string;
  buzon: string;
  carpetaPadre: string;
  asesores: FilaAsesorSla[];
  sinAsesor: CarpetaSinAsesor[];
  totales: TotalesCorreos;
  porNivel: Record<NivelSla, number>;
  conAiertos: number;
  /**
   * `calculando` la primera vez: las carpetas huerfanas llegan en segundo plano
   * para no hacer esperar la tabla. `sin_permiso` cuando Graph no se pudo leer.
   */
  estadoCarpetas: EstadoCarpetas;
  carpetasActualizadasEn: string | null;
  avisos: string[];
}

/** Payload del empujon que manda el sincronizador cuando cambia el espejo local. */
export interface EventoSlaCorreos {
  tick: number;
  nuevos: number;
  actualizados: number;
  eliminados: number;
}

/** Filtros del listado de la bandeja de un asesor. */
export interface FiltrosListadoAsesor {
  limite?: number;
  offset?: number;
  soloNoLeidos?: boolean;
  buscar?: string;
  cubo?: CuboCorreo;
}

export interface MensajeCorreoAdmin {
  id: string;
  subject: string | null;
  fromNombre: string | null;
  fromEmail: string | null;
  categorias: string[];
  bodyPreview: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  importance: string;
  receivedAt: string | null;
  adjuntos: number;
}

export interface ListadoAsesorAdmin {
  asesor: { id: string; nombre: string };
  carpeta?: string | null;
  mensajes: MensajeCorreoAdmin[];
  total: number;
  totalEnCarpeta: number;
  limite: number;
  offset: number;
}

export interface CuerpoCorreoAdmin {
  html: string;
  truncado: boolean;
  mensaje: MensajeCorreoAdmin;
}

/**
 * Vista de correo del admin: SLA por asesor y consulta de la bandeja de
 * cualquiera de ellos.
 *
 * Es un service aparte del `CorreosService` del asesor a proposito. Alli el
 * asesor sale siempre del token y la API no acepta su id desde el cliente; si se
 * metiera un parametro `asesorId` en esos endpoints, un asesor podria leer la
 * carpeta de otro cambiando la URL. Las rutas de aqui exigen rol de admin y
 * encima el permiso del modulo.
 */
@Injectable({ providedIn: 'root' })
export class CorreosAdminService {
  private readonly url = `${environment.apiUrl}/correos/admin`;

  constructor(private http: HttpClient) {}

  /** La tabla completa. */
  resumen(): Observable<ResumenCorreosAdmin> {
    return this.http.get<ResumenCorreosAdmin>(`${this.url}/resumen`);
  }

  /** Bandeja de un asesor. Solo lectura: el admin no responde ni mueve nada. */
  mensajes(asesorId: string, filtros: FiltrosListadoAsesor = {}): Observable<ListadoAsesorAdmin> {
    let params = new HttpParams();
    if (filtros.limite) params = params.set('limite', String(filtros.limite));
    if (filtros.offset) params = params.set('offset', String(filtros.offset));
    if (filtros.soloNoLeidos) params = params.set('soloNoLeidos', 'true');
    if (filtros.buscar) params = params.set('buscar', filtros.buscar);
    if (filtros.cubo) params = params.set('cubo', filtros.cubo);

    return this.http.get<ListadoAsesorAdmin>(
      `${this.url}/asesores/${encodeURIComponent(asesorId)}/mensajes`,
      { params },
    );
  }

  /**
   * Cuerpo de un correo del asesor. Ya viene sanitizado por el backend; el HTML
   * crudo de Graph nunca sale. El frontend lo pinta en un iframe `sandbox`.
   */
  cuerpo(asesorId: string, mensajeId: string): Observable<CuerpoCorreoAdmin> {
    return this.http.get<CuerpoCorreoAdmin>(
      `${this.url}/asesores/${encodeURIComponent(asesorId)}/mensajes/${encodeURIComponent(mensajeId)}/cuerpo`,
    );
  }
}