import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Un evento tal cual esta en el calendario del grupo M365 de Soporte.
 *
 * No se filtra nada: el backend devuelve tambien cumpleaños, recordatorios y
 * eventos sin videollamada, y el requisito es reflejar todo lo que hay creado.
 */
export interface EventoCalendario {
  eventId: string;
  subject: string;
  /** ISO 8601 UTC. */
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  organizerName: string | null;
  organizerEmail: string | null;
  isAllDay: boolean;
  isCancelled: boolean;
  response: string | null;
  /** Categorias literales de Outlook ("Yellow category", ...). */
  categorias: string[];
  /** null si el evento no tiene videollamada de Teams. */
  joinUrl: string | null;
  showAs: string | null;
  type: string | null;
  creadaEnLaApp: boolean;
  /**
   * Presente solo si el evento se creo desde Korvix: con esto el front sabe que
   * la reunion se puede editar o eliminar. Los eventos creados directamente en
   * Teams/Outlook los tratan Microsoft, no la app.
   */
  meetingRecordId: string | null;
  createdById: string | null;
  calendarTarget: 'personal' | 'shared' | 'none' | null;
  eventSource: 'group' | 'shared-mailbox' | 'personal' | 'none' | null;
  /**
   * De que calendario vino. 'buzon' es lo que creo la app: Microsoft no deja
   * escribir en el calendario del grupo con permisos de aplicacion, asi que el
   * backend lee los dos y los fusiona.
   */
  origen: 'grupo' | 'buzon';
}

export interface GrupoCalendario {
  id: string;
  displayName: string;
  mail: string | null;
}

/** Buzon compartido donde agenda la app. */
export interface BuzonCalendario {
  id: string;
  displayName: string;
  mail: string | null;
}

export interface CalendarioGrupo {
  grupo: GrupoCalendario;
  /** null si el backend no pudo resolver el buzon compartido. */
  buzon: BuzonCalendario | null;
  eventos: EventoCalendario[];
  total: number;
  cacheado: boolean;
  truncado: boolean;
}

@Injectable({ providedIn: 'root' })
export class CalendarioService {
  private readonly base = `${environment.apiUrl}/calendario`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Todo el calendario del grupo en [desde, hasta]. El backend pagina Graph
   * completo y lo cachea, asi que cambiar de mes y volver es barato.
   *
   * `refrescar` fuerza ir a Graph e ignorar la cache de eventos del backend.
   * Lo usa el refresco periodico para que una reunion creada desde Teams por
   * otro asesor aparezca en segundos en vez de esperar el TTL.
   */
  grupo(
    desde: string,
    hasta: string,
    refrescar = false,
  ): Promise<CalendarioGrupo> {
    return firstValueFrom(
      this.http.get<CalendarioGrupo>(`${this.base}/grupo`, {
        params: refrescar
          ? { desde, hasta, refrescar: '1' }
          : { desde, hasta },
      }),
    );
  }
}