// src/calendario/dto/calendario-grupo.dto.ts

/** Datos minimos del grupo M365 que se esta leyendo. */
export interface GrupoCalendarioDto {
  id: string;
  displayName: string;
  mail: string | null;
}

/**
 * Un evento tal cual esta en el calendario del grupo.
 *
 * No se filtra nada: cumpleaños, recordatorios, series y eventos sin Teams
 * tambien se devuelven, porque el requisito es reflejar TODO lo que hay
 * creado en el calendario. `isAllDay` viaja solo como dato para que el front
 * pueda maquetarlo distinto si algum dia aparece uno de dia completo.
 */
export interface EventoCalendarioDto {
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
  /** responseStatus.response: organizer / accepted / declined / tentative / none. */
  response: string | null;
  /**
   * Categorias tal como las guarda Outlook ("Yellow category", ...). Se cruzan
   * en el front con la tabla de categorias para pintar el chip del color que
   * corresponde.
   */
  categorias: string[];
  /** null si el evento no tiene videollamada de Teams. */
  joinUrl: string | null;
  /** free / tentative / busy / oof / workingElsewhere. */
  showAs: string | null;
  /** singleInstance / occurrence / exception / seriesMaster. */
  type: string | null;
  /** true si ademas esta guardado en la tabla teams_meetings (creado en la app). */
  creadaEnLaApp: boolean;
  /** Registro local y creador, solo para gestionar reuniones creadas en Korvix. */
  meetingRecordId: string | null;
  createdById: string | null;
  calendarTarget: 'personal' | 'shared' | 'none' | null;
  eventSource: 'group' | 'shared-mailbox' | 'personal' | 'none' | null;
  /**
   * Marca/proyecto del colegio al que va la reunion, solo si se creo desde la
   * app (ahi el usuario si escoge colegio). Los eventos creados directamente en
   * Teams/Outlook no tienen colegio y llegan en null, que Metricas clasifica
   * como "Sin clasificar".
   */
  tipoColegio: string | null;
  /**
   * virtual | presencial. En los eventos de la app sale de la columna propia;
   * en los creados en Teams se deduce de la categoria de Outlook, que es la
   * unica pista que Graph expone.
   */
  modalidad: 'virtual' | 'presencial';
  /**
   * Categoria semantica completa del evento: 'Reunion presencial',
   * 'Reunion virtual', 'Reunion equipo', 'Cumpleanos', 'Ausencia/permisos',
   * 'Vacaciones' o 'Incapacidad'.
   *
   * `modalidad` solo distingue online/presencial, pero el calendario pinta
   * siete tipos con colores distintos y Metricas debe pintarlos igual. Se
   * resuelve con las mismas reglas que el front, asi el color que se ve aqui es
   * el mismo que se ve en la pestaña de Calendario.
   */
  categoria: string;
  /**
   * De que calendario salio el evento.
   *
   * Se leen dos porque Microsoft no deja crear eventos en el calendario de un
   * grupo M365 con permisos de aplicacion (`POST /groups/{id}/events` esta
   * documentado como "Application: Not supported" y responde 403). Por eso la
   * app agenda en el buzon compartido y, para que esas reuniones no queden
   * fuera de la vista, tambien se lee ese buzon y se fusiona con el del grupo.
   */
  origen: 'grupo' | 'buzon';
}

/** Buzon compartido donde la app crea las reuniones. */
export interface BuzonCalendarioDto {
  id: string;
  displayName: string;
  mail: string | null;
}

export interface CalendarioGrupoDto {
  grupo: GrupoCalendarioDto;
  /** null si no se pudo resolver el buzon compartido; el grupo se sigue leyendo. */
  buzon: BuzonCalendarioDto | null;
  eventos: EventoCalendarioDto[];
  total: number;
  /** true si la respuesta salio de la cache en memoria. */
  cacheado: boolean;
  /** true si se alcanzo CALENDARIO_MAX_PAGINAS y se corto la lectura. */
  truncado: boolean;
  /**
   * ISO 8601 UTC de la ultima lectura REAL a Graph para este rango.
   *
   * Se conserva dentro de la cache, asi que un hit cacheado o una respuesta
   * de respaldo (Graph fallo y se sirvio lo vencido) siguen mostrando cuando
   * se leyo por ultima vez. El front lo usa para el indicador discreto de
   * "sincronizado hace N s".
   */
  actualizadoEn: string;
}
