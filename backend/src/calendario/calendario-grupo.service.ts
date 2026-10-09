// src/calendario/calendario-grupo.service.ts

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MicrosoftGraphMailService } from '../correos/microsoft-graph-mail.service';
import { TeamsMeeting } from '../advisor-whatsapp/entities/teams-meeting.entity';
import {
  CalendarioGrupoDto,
  EventoCalendarioDto,
  GrupoCalendarioDto,
  BuzonCalendarioDto,
} from './dto/calendario-grupo.dto';

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Techo de entradas en la cache, para no crecer sin limite al navegar meses. */
const MAX_ENTRADAS_CACHE = 40;

/**
 * Lectura del calendario REAL del grupo M365 de Soporte.
 *
 * Deliberadamente no reutiliza el buzon compartido: la agenda que todos ven es
 * la del grupo. Tampoco toca teams-meetings.service.ts, que sigue siendo el
 * dueño de la creacion de reuniones; aqui solo se lee y se cruza con la tabla
 * teams_meetings para marcar lo que se creo desde la app.
 *
 * Por que la cache es obligatoria y no una mejora: `calendarView` no acepta
 * `$top` y pagina de 10 en 10. Un mes cargado (septiembre 2026 son 215 eventos)
 * son ~22 viajes secuenciales. Sin cache, 20 asesores abriendo el modulo son
 * 440 llamadas a Graph para pintar lo mismo.
 */
/** Opciones de lectura del calendario. */
export interface OpcionesLecturaCalendario {
  /**
   * Ignora la cache de eventos y vuelve a Graph.
   *
   * Para el refresco periodico del frontend. No se desactiva el single-flight,
   * asi que si varios asesores refrescan a la vez se comparte un solo viaje a
   * Graph en lugar de abrir N peticiones.
   */
  refrescar?: boolean;
}

@Injectable()
export class CalendarioGrupoService {
  private readonly log = new Logger(CalendarioGrupoService.name);

  /** Rango exacto -> respuesta, con vencimiento. */
  private readonly cache = new Map<string, { expira: number; datos: CalendarioGrupoDto }>();
  /** Rango exacto -> lectura en curso, para compartir una sola tanda de viajes. */
  private readonly enVuelo = new Map<string, Promise<CalendarioGrupoDto>>();
  /**
   * Se sube en cada `invalidar()` para que las lecturas que ya estaban en
   * vuelo se descarten: si una reunion se creo mientras Graph respondia, esa
   * respuesta todavia no la trae y hay que releer.
   */
  private generacion = 0;
  private grupoCache: { expira: number; grupo: GrupoCalendarioDto } | null = null;
  private buzonCache: { expira: number; buzon: BuzonCalendarioDto | null } | null = null;

  constructor(
    private readonly graph: MicrosoftGraphMailService,
    private readonly config: ConfigService,
    @InjectRepository(TeamsMeeting)
    private readonly meetings: Repository<TeamsMeeting>,
  ) {}

  /**
   * Devuelve TODOS los eventos del calendario del grupo dentro de [desde, hasta].
   * No aplica ningun filtro: cumpleaños, recordatorios, cancelados y eventos sin
   * Teams se incluyen igual.
   */
  async obtener(
    desde: string,
    hasta: string,
    opciones: OpcionesLecturaCalendario = {},
  ): Promise<CalendarioGrupoDto> {
    return this.obtenerInterno(desde, hasta, 0, opciones.refrescar === true);
  }

  /**
   * Reintentos acotados: si hay invalidaciones encadenadas, el bucle se corta
   * en vez de releer Graph indefinidamente.
   */
  private async obtenerInterno(
    desde: string,
    hasta: string,
    intento: number,
    refrescar: boolean,
  ): Promise<CalendarioGrupoDto> {
    const MAX_REINTENTOS = 3;
    const ini = this.parsear(desde, 'desde');
    const fin = this.parsear(hasta, 'hasta');
    this.validarRango(ini, fin);

    const grupo = await this.resolverGrupo();
    const buzon = await this.resolverBuzon();
    const clave = `${grupo.id}|${ini.toISOString()}|${fin.toISOString()}`;
    // Se captura antes de tocar la cache para poder detectar una invalidacion
    // que ocurra mientras Graph responde.
    const generacion = this.generacion;

    const hit = this.cache.get(clave);
    if (hit && hit.expira > Date.now() && !refrescar) {
      return { ...hit.datos, cacheado: true };
    }
    this.purgarCache();

    // Single-flight: si otro asesor pidio el mismo rango hace 300 ms, se espera
    // su lectura en vez de abrir una segunda tanda de viajes a Graph.
    const vuelo = this.enVuelo.get(clave);
    if (vuelo) {
      const datos = await vuelo;
      // La lectura compartida se lanzo antes de la invalidacion, asi que puede
      // no traer la reunion recien creada.
      if (generacion !== this.generacion && intento < MAX_REINTENTOS) {
        return this.obtenerInterno(desde, hasta, intento + 1, refrescar);
      }
      return { ...datos, cacheado: true };
    }

    const tarea = this.leer(grupo, buzon, ini, fin).finally(() => {
      this.enVuelo.delete(clave);
    });
    this.enVuelo.set(clave, tarea);

    const datos = await tarea;
    // Alguien invalido mientras esperabamos: esta respuesta ya no vale.
    if (generacion !== this.generacion && intento < MAX_REINTENTOS) {
      return this.obtenerInterno(desde, hasta, intento + 1, refrescar);
    }
    return { ...datos, cacheado: false };
  }

  /**
   * Descarta la cache (util tras crear una reunion).
   *
   * Tambien sube la generacion y suelta las lecturas en vuelo: si la reunion se
   * creo mientras Graph respondia, esa respuesta llega sin el evento nuevo y
   * `obtener()` la vuelve a pedir en vez de cachear un resultado viejo.
   */
  invalidar(): void {
    this.cache.clear();
    this.enVuelo.clear();
    this.generacion++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Graph
  // ───────────────────────────────────────────────────────────────────────────

  private async leer(
    grupo: GrupoCalendarioDto,
    buzon: BuzonCalendarioDto | null,
    ini: Date,
    fin: Date,
  ): Promise<CalendarioGrupoDto> {
    const grupoRaw = await this.eventosDeGraph(
      `/groups/${grupo.id}/calendarView`,
      ini,
      fin,
      'Group.Read.All',
    );
    // El buzon compartido se lee aparte y se fusiona: es donde la app crea las
    // reuniones, porque el calendario del grupo no admite POST con permisos de
    // aplicacion. Si falla, la vista del grupo sigue serviéndose.
    let buzonRaw: any[] = [];
    let truncado = grupoRaw.truncado;
    if (buzon) {
      try {
        const b = await this.eventosDeGraph(
          `/users/${encodeURIComponent(buzon.id)}/calendarView`,
          ini,
          fin,
          'Calendars.ReadWrite',
        );
        buzonRaw = b.crudos;
        truncado = truncado || b.truncado;
      } catch (err: any) {
        this.log.warn(
          `No se pudo leer el buzon compartido (${buzon.mail ?? buzon.id}): ` +
            `${err?.message ?? err}. Se devuelve solo el calendario del grupo.`,
        );
      }
    }

    const locales = await this.creadasEnLaApp(ini, fin);
    const vistos = new Set<string>();
    const eventos: EventoCalendarioDto[] = [];

    // El grupo va primero: si un id aparece en los dos, manda el del grupo.
    for (const ev of grupoRaw.crudos) {
      const e = this.mapear(ev, locales.get(ev.id), 'grupo');
      if (!e || vistos.has(e.eventId)) continue;
      vistos.add(e.eventId);
      eventos.push(e);
    }
    for (const ev of buzonRaw) {
      const e = this.mapear(ev, locales.get(ev.id), 'buzon');
      if (!e || vistos.has(e.eventId)) continue;
      vistos.add(e.eventId);
      eventos.push(e);
    }

    // Si un rango pidio eventos que aun no aparecen en Graph y si estan en la
    // tabla, se agregan para que no desaparezcan de la vista justo despues de
    // crearlos.
    for (const fila of locales.values()) {
      if (!fila.eventId || vistos.has(fila.eventId)) continue;
      eventos.push(this.desdeFila(fila));
    }
    eventos.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));

    const datos: CalendarioGrupoDto = {
      grupo,
      buzon,
      eventos,
      total: eventos.length,
      cacheado: false,
      truncado,
    };

    const ttl = this.numero('CALENDARIO_CACHE_SEGUNDOS', 300) * 1000;
    this.cache.set(claveDe(grupo.id, ini, fin), {
      expira: Date.now() + ttl,
      datos,
    });
    return datos;
  }

  /**
   * Recorre todos los nextLink de un calendarView, sea de grupo o de usuario.
   *
   * Graph no acepta `$top` de forma confiable, y `start/end` traen 7 decimales
   * de segundo que `Date` no parsea, asi que se recorta antes de convertir.
   */
  private async eventosDeGraph(
    base: string,
    ini: Date,
    fin: Date,
    permiso: string,
  ): Promise<{ crudos: any[]; truncado: boolean }> {
    const select = [
      'id',
      'subject',
      'start',
      'end',
      'isAllDay',
      'isCancelled',
      'isOrganizer',
      'responseStatus',
      'categories',
      'onlineMeeting',
      'organizer',
      'showAs',
      'type',
    ].join(',');

    // `$top` SI se respeta en calendarView (medido: septiembre 2026 con 215
    // eventos pasa de 22 viajes a 5). Aun asi se sigue todo el nextLink, porque
    // un rango puede traer mas de 50.
    const params = new URLSearchParams({
      startDateTime: ini.toISOString(),
      endDateTime: fin.toISOString(),
      $select: select,
      $orderby: 'start/dateTime',
      $top: '50',
    });

    let url: string | null = `${base}?${params.toString()}`;
    const maxPaginas = this.numero('CALENDARIO_MAX_PAGINAS', 60);
    const crudos: any[] = [];
    let paginas = 0;

    while (url) {
      if (paginas >= maxPaginas) {
        this.log.warn(
          `calendarView de ${base} corto en la pagina ${paginas}: hay mas eventos ` +
            `de los que caben en CALENDARIO_MAX_PAGINAS=${maxPaginas}.`,
        );
        return { crudos, truncado: true };
      }
      const res = await this.graph.get<any>(url, { permiso });
      if (Array.isArray(res?.value)) crudos.push(...res.value);
      url = res?.['@odata.nextLink'] ?? null;
      paginas++;
    }

    return { crudos, truncado: false };
  }

  /** Cruce con teams_meetings para marcar lo creado desde la app. */
  private async creadasEnLaApp(
    ini: Date,
    fin: Date,
  ): Promise<Map<string, TeamsMeeting>> {
    const filas = await this.meetings
      .createQueryBuilder('m')
      .where('m.startDateTime >= :ini AND m.startDateTime <= :fin', { ini, fin })
      .getMany();

    const mapa = new Map<string, TeamsMeeting>();
    for (const fila of filas) {
      if (fila.eventId) mapa.set(fila.eventId, fila);
    }
    return mapa;
  }

  private mapear(
    ev: any,
    fila: TeamsMeeting | undefined,
    origen: 'grupo' | 'buzon',
  ): EventoCalendarioDto | null {
    const inicio = this.aIsoUtc(ev?.start?.dateTime);
    const fin = this.aIsoUtc(ev?.end?.dateTime);
    if (!inicio) return null;

    // El enlace de Graph es la fuente de verdad: al releer el calendario se
    // corrige solo el cruce que dejan las filas con join_url desactualizado.
    const joinUrl = this.joinUrl(ev) ?? fila?.joinUrl ?? null;
    const categoriasGraph = Array.isArray(ev?.categories)
      ? ev.categories.filter((c: unknown): c is string => typeof c === 'string')
      : [];
    // La fila local guarda lo que mando la app (alias + nombre de Outlook).
    // Se fusiona con lo que devuelve Graph para que el chip de la app tenga
    // color aunque Graph no conserve categorias desconocidas.
    const categoriasFila = Array.isArray(fila?.categories)
      ? fila.categories.filter((c: unknown): c is string => typeof c === 'string')
      : [];
    const categorias = [
      ...categoriasGraph,
      ...categoriasFila.filter((c) => !categoriasGraph.includes(c)),
    ];
    const categoriasNormalizadas = categorias.map((categoria) =>
      categoria.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    const sinPrefijoCreador = categoriasNormalizadas.some((categoria) =>
      ['cumpleanos', 'green category', 'reunion equipo', 'purple category'].includes(categoria),
    );
    const asuntoOriginal = ev.subject?.trim() ? ev.subject.trim() : '(sin titulo)';
    const subject = sinPrefijoCreador
      ? asuntoOriginal.replace(/^\([^)]{1,100}\)\s*/, '').trim() || asuntoOriginal
      : asuntoOriginal;

    return {
      eventId: ev.id,
      subject,
      startDateTime: inicio,
      endDateTime: fin || inicio,
      durationMinutes: this.duracion(inicio, fin || inicio),
      organizerName: ev?.organizer?.emailAddress?.name ?? null,
      organizerEmail: ev?.organizer?.emailAddress?.address ?? null,
      isAllDay: ev.isAllDay === true,
      isCancelled: ev.isCancelled === true,
      response: ev?.responseStatus?.response ?? null,
      categorias,
      joinUrl,
      showAs: ev.showAs ?? null,
      type: ev.type ?? null,
      creadaEnLaApp: !!fila,
      meetingRecordId: fila?.id ?? null,
      createdById: fila?.createdBy ?? null,
      calendarTarget: fila?.calendarTarget ?? null,
      eventSource: fila?.eventSource ?? null,
      origen,
    };
  }

  /**
   * Respaldo desde la tabla local, para el instante entre crear la reunion y que
   * Graph la devuelva. `categorias` va vacio porque la tabla no las guarda: si el
   * evento no aparece en el buzon, tampoco habra color hasta que exista ahi.
   */
  private desdeFila(fila: TeamsMeeting): EventoCalendarioDto {
    const inicio = new Date(fila.startDateTime).toISOString();
    const fin = new Date(fila.endDateTime).toISOString();
    return {
      eventId: fila.eventId as string,
      subject: fila.subject,
      startDateTime: inicio,
      endDateTime: fin,
      durationMinutes: this.duracion(inicio, fin),
      organizerName: fila.createdByName ?? null,
      organizerEmail: null,
      isAllDay: false,
      isCancelled: false,
      response: null,
      categorias: [],
      joinUrl: fila.joinUrl ?? null,
      showAs: 'busy',
      type: 'singleInstance',
      creadaEnLaApp: true,
      meetingRecordId: fila.id,
      createdById: fila.createdBy,
      calendarTarget: fila.calendarTarget,
      eventSource: fila.eventSource,
      origen: 'buzon',
    };
  }

  /** `onlineMeeting.joinUrl` llega como string; en algunas respuestas, objeto. */
  private joinUrl(ev: any): string | null {
    const crudo = ev?.onlineMeeting?.joinUrl ?? ev?.onlineMeeting?.joinWebUrl;
    if (typeof crudo === 'string' && crudo) return crudo;
    if (crudo && typeof crudo === 'object' && typeof crudo.webUrl === 'string') {
      return crudo.webUrl;
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Grupo
  // ───────────────────────────────────────────────────────────────────────────

  private async resolverGrupo(): Promise<GrupoCalendarioDto> {
    if (this.grupoCache && this.grupoCache.expira > Date.now()) {
      return this.grupoCache.grupo;
    }

    const explicito = (
      this.config.get<string>('CALENDARIO_GRUPO_ID') ||
      this.config.get<string>('TEAMS_GROUP_ID') ||
      ''
    ).trim();
    const nombre = (
      this.config.get<string>('CALENDARIO_GRUPO_NOMBRE') ||
      this.config.get<string>('TEAMS_GROUP_NAME') ||
      'Soporte'
    ).trim();

    let grupo: GrupoCalendarioDto;
    if (GUID.test(explicito)) {
      grupo = await this.leerGrupo(explicito, nombre);
    } else {
      grupo = await this.buscarPorNombre(nombre);
    }

    this.grupoCache = { expira: Date.now() + 300_000, grupo };
    return grupo;
  }

  private async leerGrupo(id: string, respaldo: string): Promise<GrupoCalendarioDto> {
    try {
      const g = await this.graph.get<any>(`/groups/${id}`, {
        permiso: 'Group.Read.All',
      });
      return {
        id: g.id ?? id,
        displayName: g.displayName ?? respaldo,
        mail: typeof g.mail === 'string' ? g.mail : null,
      };
    } catch {
      // El ID es valido, asi que si /groups falla el problema no es el nombre:
      // se devuelve el ID tal cual para que el error real sea el de calendarView.
      this.log.warn(`No se pudo leer /groups/${id}; se usa el ID tal cual.`);
      return { id, displayName: respaldo, mail: null };
    }
  }

  /**
   * Resolucion por nombre, pero sin adivinar: hoy hay dos grupos con
   * displayName 'Soporte' y elegir el equivocado seria peor que fallar.
   */
  private async buscarPorNombre(nombre: string): Promise<GrupoCalendarioDto> {
    const params = new URLSearchParams({
      $filter: `displayName eq '${nombre.replace(/'/g, "''")}'`,
      $select: 'id,displayName,mail',
      $top: '10',
    });
    const res = await this.graph.get<any>(`/groups?${params.toString()}`, {
      permiso: 'Group.Read.All',
    });
    const grupos = Array.isArray(res?.value) ? res.value : [];

    if (grupos.length === 0) {
      throw new NotFoundException(
        `No existe ningun grupo de Microsoft 365 con el nombre "${nombre}".`,
      );
    }
    if (grupos.length > 1) {
      const lista = grupos
        .map((g) => `${g.displayName} <${g.mail ?? 'sin alias'}> (${g.id})`)
        .join(' · ');
      throw new BadRequestException(
        `Hay ${grupos.length} grupos llamados "${nombre}" (${lista}). ` +
          'Define CALENDARIO_GRUPO_ID o TEAMS_GROUP_ID con el que corresponda.',
      );
    }
    return {
      id: grupos[0].id,
      displayName: grupos[0].displayName ?? nombre,
      mail: typeof grupos[0].mail === 'string' ? grupos[0].mail : null,
    };
  }

  /**
   * Resuelve el buzon compartido donde la app crea las reuniones.
   *
   * Mismas reglas que TeamsMeetingsService: si TEAMS_MEETINGS_ACCOUNT_ID es un
   * GUID se usa tal cual; si no, se busca por TEAMS_MEETINGS_ACCOUNT con el
   * alias de correo. Si no se puede resolver NO se falla: el calendario del
   * grupo se sigue pudiendo leer, solo quedan fuera las reuniones creadas desde
   * la app.
   */
  private async resolverBuzon(): Promise<BuzonCalendarioDto | null> {
    if (this.buzonCache && this.buzonCache.expira > Date.now()) {
      return this.buzonCache.buzon;
    }

    const correo = (
      this.config.get<string>('TEAMS_MEETINGS_ACCOUNT') || 'soporte@innovacloud.co'
    ).trim();
    const idConfig = (this.config.get<string>('TEAMS_MEETINGS_ACCOUNT_ID') ?? '').trim();

    let buzon: BuzonCalendarioDto | null = null;
    try {
      if (GUID.test(idConfig)) {
        buzon = await this.leerBuzon(idConfig, correo);
      } else if (correo.includes('@')) {
        const params = new URLSearchParams({
          $filter: `mail eq '${correo.replace(/'/g, "''")}' or userPrincipalName eq '${correo.replace(/'/g, "''")}'`,
          $select: 'id,displayName,mail,userPrincipalName',
          $top: '5',
        });
        const res = await this.graph.get<any>(`/users?${params.toString()}`, {
          permiso: 'User.Read.All',
        });
        const usuarios = Array.isArray(res?.value) ? res.value : [];
        if (usuarios.length === 1) {
          buzon = this.buzonDe(usuarios[0], correo);
        } else if (usuarios.length > 1) {
          this.log.warn(
            `${usuarios.length} usuarios coinciden con TEAMS_MEETINGS_ACCOUNT=${correo}; ` +
              'se usa el primero. Define TEAMS_MEETINGS_ACCOUNT_ID para desambiguar.',
          );
          buzon = this.buzonDe(usuarios[0], correo);
        }
      }
    } catch (err: any) {
      this.log.warn(
        `No se pudo resolver el buzon compartido ${correo}: ${err?.message ?? err}. ` +
          'Se devuelve solo el calendario del grupo.',
      );
      buzon = null;
    }

    this.buzonCache = { expira: Date.now() + 300_000, buzon };
    return buzon;
  }

  private buzonDe(u: any, respaldo: string): BuzonCalendarioDto {
    return {
      id: u.id,
      displayName: u.displayName ?? respaldo,
      mail: typeof u.mail === 'string' ? u.mail : respaldo,
    };
  }

  private async leerBuzon(id: string, respaldo: string): Promise<BuzonCalendarioDto> {
    try {
      const u = await this.graph.get<any>(`/users/${id}`, { permiso: 'User.Read.All' });
      return this.buzonDe(u, respaldo);
    } catch {
      this.log.warn(`No se pudo leer /users/${id}; se usa el ID tal cual.`);
      return { id, displayName: respaldo, mail: respaldo };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utilidades
  // ───────────────────────────────────────────────────────────────────────────

  private parsear(valor: string, campo: string): Date {
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`"${campo}" no es una fecha valida: ${valor}`);
    }
    return d;
  }

  private validarRango(ini: Date, fin: Date): void {
    if (ini.getTime() >= fin.getTime()) {
      throw new BadRequestException('"desde" debe ser anterior a "hasta".');
    }
    const dias = (fin.getTime() - ini.getTime()) / 86_400_000;
    const max = this.numero('CALENDARIO_MAX_DIAS', 1825);
    if (dias > max) {
      throw new BadRequestException(
        `El rango abarca ${Math.round(dias)} dias y Graph admite maximo ${max} en ` +
          'calendarView. Pide menos de 5 años.',
      );
    }
  }

  /**
   * Graph devuelve "2026-10-05T19:30:00.0000000" (7 decimales). `Date` solo
   * admite hasta 3, asi que se recorta antes de parsear y se fuerza UTC porque
   * sin cabecera `Prefer: outlook.timezone` Graph responde en UTC.
   */
  private aIsoUtc(valor: unknown): string {
    if (typeof valor !== 'string' || !valor) return '';
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(valor.trim());
    if (!m) return '';
    const conSegundos = m[2].length === 5 ? `${m[2]}:00` : m[2];
    const d = new Date(`${m[1]}T${conSegundos}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  private duracion(inicio: string, fin: string): number {
    const ms = new Date(fin).getTime() - new Date(inicio).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.round(ms / 60_000);
  }

  private numero(clave: string, porDefecto: number): number {
    const crudo = this.config.get<string>(clave);
    const n = Number(crudo);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  }

  private purgarCache(): void {
    const ahora = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expira <= ahora) this.cache.delete(k);
    }
    while (this.cache.size >= MAX_ENTRADAS_CACHE) {
      const primera = this.cache.keys().next();
      if (primera.done) break;
      this.cache.delete(primera.value);
    }
  }
}

function claveDe(groupId: string, ini: Date, fin: Date): string {
  return `${groupId}|${ini.toISOString()}|${fin.toISOString()}`;
}
