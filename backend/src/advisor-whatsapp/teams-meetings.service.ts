import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { TeamsToken } from './entities/teams-token.entity';
import { TeamsMeeting } from './entities/teams-meeting.entity';
import { CalendarioGrupoService } from '../calendario/calendario-grupo.service';

const BOGOTA_TZ = 'America/Bogota';

/**
 * Nombres con que la app identifica cada categoria dentro de Korvix
 * ("Reunion presencial", "Reunion virtual", "Reunion equipo", "Cumpleanos").
 *
 * NO se escriben en el evento de Graph: Outlook no tiene esas categorias en el
 * buzón y las conserva como etiqueta gris sin color, de modo que en Teams y en
 * Outlook quedarian DOS categorias ("Blue category" mas "Reunion presencial").
 * El alias vive solo en la fila local (teams_meetings.categories), que es con
 * lo que la app pinta su chip; al evento viaja unicamente el nombre literal de
 * Outlook ("Blue category", "Orange category", ...), que si tiene color.
 */
const ALIAS_CATEGORIAS_APP: ReadonlySet<string> = new Set([
  'reunion presencial',
  'reunion virtual',
  'reunion equipo',
  'cumpleanos',
]);

/**
 * Categorias listas para escribir el evento de Graph: solo nombres literales
 * de Outlook (se caen los alias de la app), normalizados y hasta 10.
 */
function categoriasParaGraph(categorias?: string[] | null): string[] {
  return (categorias ?? [])
    .map((c) => String(c ?? '').trim())
    .filter((c) => c.length > 0 && !ALIAS_CATEGORIAS_APP.has(c.toLowerCase()))
    .slice(0, 10);
}

interface PendingAuth {
  advisorId: string;
  codeVerifier: string;
  createdAt: number;
}

export interface TeamsMeetingInput {
  subject: string;
  startDateTime: string;
  durationMinutes?: number;
  /**
   * Categorias que elija el usuario: el alias que ve en la app
   * ("Reunion presencial", ...) y el nombre literal de Outlook
   * ("Blue category", ...). El alias se guarda en la fila local para pintar
   * el chip; al evento de Graph solo viajan los nombres de Outlook.
   * Opcional: sin categorias, el evento se crea sin etiqueta.
   */
  categorias?: string[];
}

/**
 * Quien organiza la videollamada de Teams:
 *  - 'shared': la crea la cuenta compartida (TEAMS_MEETINGS_ACCOUNT).
 *  - 'advisor': la crea la cuenta Microsoft del asesor (modo legado, la
 *    reunion nace en su cuenta y se copia el evento a la compartida).
 */
export type TeamsMeetingOrganizer = 'shared' | 'advisor';

/** Alcance de organizador de la videollamada de Teams. */
export type TeamsMeetingOrganizerScope = 'group' | 'shared-mailbox' | 'advisor';
export type TeamsMeetingCalendarSource = 'group' | 'shared-mailbox' | 'personal' | 'none';

/**
 * Tope del asunto, ya con el prefijo "(Nombre Asesor)" incluido.
 *
 * Graph admite 255, pero 160 alcanza de sobra para un titulo de reunion y deja
 * el evento legible en el listado del dia.
 */
const LIMITE_ASUNTO = 160;

export type TeamsCalendarTarget = 'personal' | 'shared' | 'none';

export interface TeamsMeetingUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface TeamsMeetingResult {
  subject: string;
  /** Siempre ISO UTC, para persistir en teams_meetings. */
  startDateTime: string;
  endDateTime: string;
  joinUrl: string;
  meetingId: string | null;
  eventId: string | null;
  calendarTarget: TeamsCalendarTarget;
  eventSource: TeamsMeetingCalendarSource;
}

/** Reunion creada por el asesor: sin evento de calendario todavia. */
type AdvisorMeeting = Omit<TeamsMeetingResult, 'eventId' | 'calendarTarget' | 'eventSource'>;

export interface CalendarEventContact {
  name: string;
  role: string;
  institution: string;
  phone: string;
  email?: string;
}

export interface TeamsMeetingDto {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  joinUrl: string;
  meetingId: string | null;
  eventId: string | null;
  calendarTarget: TeamsCalendarTarget;
  eventSource: TeamsMeetingCalendarSource | null;
  /** Alias de la app y nombres literales de Outlook ("Blue category", ...). */
  categorias: string[];
  createdByName: string | null;
  createdAt: string;
}

@Injectable()
export class TeamsMeetingsService {
  private readonly logger = new Logger(TeamsMeetingsService.name);
  private readonly pendingAuth = new Map<string, PendingAuth>();
  private appAccessToken: { token: string; expiresAt: number } | null = null;
  /**
   * Scopes DELEGADOS (la cuenta del asesor).
   *
   * `Group.ReadWrite.All` es obligatorio y va aqui, no en el permiso de
   * aplicacion, porque Microsoft no permite crear eventos en el calendario de un
   * grupo M365 con token de aplicacion: la tabla de permisos de
   * `POST /groups/{id}/events` dice "Application: Not supported", y medido contra
   * el grupo Soporte devuelve 403 aunque la app tenga Calendars.ReadWrite y
   * Group.ReadWrite.All de aplicacion.
   *
   * Tampoco se puede agregar la app como miembro del grupo para desbloquearlo:
   * Graph lo rechaza con "Directory object type: ServicePrincipal cannot be added
   * to Unified Groups".
   */
  private readonly scopes = [
    'offline_access',
    'openid',
    'profile',
    'User.Read',
    'OnlineMeetings.ReadWrite',
    'Calendars.ReadWrite',
    'Group.ReadWrite.All',
  ];

  /** Colombia es UTC-5 fijo (no aplica horario de verano). */
  private static readonly BOGOTA_OFFSET_MS = -5 * 3600_000;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TeamsToken)
    private readonly tokenRepo: Repository<TeamsToken>,
    @InjectRepository(TeamsMeeting)
    private readonly meetingRepo: Repository<TeamsMeeting>,
    /**
     * Solo se usa para `invalidar()`: la lectura del calendario cachea 5
     * minutos, asi que sin esto la reunion recien creada no apareceria hasta
     * que venciera la cache.
     *
     * Va como `@Optional()` a proposito. La dependencia es de ida
     * (CalendarioGrupoService no usa TeamsMeetingsService), asi que no hay
     * ciclo; y si el modulo no estuviera registrado, la creacion de reuniones
     * seguiria funcionando igual.
     */
    @Optional()
    private readonly calendarioGrupo?: CalendarioGrupoService,
  ) {}

  /**
   * Descarta la cache de lectura del calendario.
   *
   * Se llama despues de cualquier reunion que haya quedado en el grupo o en el
   * buzon compartido, porque las dos se leen con el mismo endpoint.
   */
  private invalidarCacheCalendario(): void {
    try {
      this.calendarioGrupo?.invalidar();
    } catch (err: any) {
      // Es una mejora de frescura, nunca un motivo para fallar la creacion.
      this.logger.warn(
        `No se pudo invalidar la cache del calendario: ${err?.message ?? err}`,
      );
    }
  }

  async getStatus(advisorId: string) {
    const token = await this.tokenRepo.findOne({ where: { advisorId } });
    return {
      connected: !!token,
      accountName: token?.accountName,
    };
  }

  async disconnect(advisorId: string): Promise<{ ok: boolean }> {
    const result = await this.tokenRepo.delete({ advisorId });
    if (result.affected) {
      this.logger.log(`Teams desconectado para el asesor ${advisorId}`);
    }
    return { ok: true };
  }

  createAuthUrl(advisorId: string): { authUrl: string; state: string } {
    const clientId = this.clientId();
    const state = this.randomToken();
    const codeVerifier = this.randomToken(48);
    const codeChallenge = this.base64Url(
      createHash('sha256').update(codeVerifier).digest(),
    );

    this.pendingAuth.set(state, {
      advisorId,
      codeVerifier,
      createdAt: Date.now(),
    });
    this.cleanupPendingAuth();

    const url = new URL(`${this.authority()}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return { authUrl: url.toString(), state };
  }

  async completeAuth(code: string, state: string): Promise<string> {
    if (!code || !state)
      throw new BadRequestException('Autorizacion incompleta');
    const pending = this.pendingAuth.get(state);
    if (!pending) throw new BadRequestException('Sesion de Teams expirada');
    this.pendingAuth.delete(state);

    const tokenSet = await this.exchangeCode(code, pending.codeVerifier);
    await this.tokenRepo.upsert(
      {
        advisorId: pending.advisorId,
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        expiresAt: tokenSet.expiresAt,
        accountName: tokenSet.accountName,
      },
      ['advisorId'],
    );
    return pending.advisorId;
  }

  /**
   * Crea la reunion desde un chat de WhatsApp. Ademas de enviar el enlace por
   * WhatsApp la deja agendada en el calendario elegido y la persiste en
   * teams_meetings (si no se persiste, no aparece en el modulo Calendario).
   */
  async createMeeting(
    user: TeamsMeetingUser,
    input: TeamsMeetingInput & { calendarTarget?: TeamsCalendarTarget },
    contact?: CalendarEventContact,
  ): Promise<TeamsMeetingResult> {
    const meeting = await this.provisionMeeting(
      user,
      input,
      input.calendarTarget ?? 'shared',
      contact,
    );
    await this.meetingRepo.save(
      this.meetingRepo.create({
        createdBy: user.id ?? null,
        createdByName: user.name ?? null,
        subject: meeting.subject,
        categories: input.categorias ?? [],
        startDateTime: new Date(meeting.startDateTime),
        endDateTime: new Date(meeting.endDateTime),
        durationMinutes: this.clampDuration(input.durationMinutes),
        joinUrl: meeting.joinUrl,
        meetingId: meeting.meetingId,
        eventId: meeting.eventId,
        calendarTarget: meeting.calendarTarget,
        eventSource: meeting.eventSource,
      }),
    );
    return meeting;
  }

  /**
   * Nucleo de creacion: decide quien organiza la videollamada y deja el evento
   * en el calendario pedido. Propaga el error si Microsoft falla, para que el
   * frontend no muestre un agendado que en realidad no ocurrio.
   */
  private async provisionMeeting(
    user: TeamsMeetingUser,
    input: TeamsMeetingInput,
    calendarTarget: TeamsCalendarTarget,
    contact?: CalendarEventContact,
  ): Promise<TeamsMeetingResult> {
    const subject = this.subjectConAsesor(
      this.cleanSubject(input.subject),
      user,
      input.categorias,
    );
    const start = new Date(input.startDateTime);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Hora de reunion invalida');
    }

    const duration = this.clampDuration(input.durationMinutes);
    const end = new Date(start.getTime() + duration * 60_000);

    // Orden de preferencia al agendar:
    //
    //  1) Calendario del grupo Soporte. Es lo que todos ven en Teams, asi que es
    //     lo primero que se intenta, pero SOLO con el token delegado del asesor
    //     (`Group.ReadWrite.All` como permiso delegado). Con el token de
    //     aplicacion Microsoft responde 403: la tabla de permisos de
    //     `POST /groups/{id}/events` dice "Application: Not supported", y
    //     agregar la app como miembro del grupo tampoco sirve ("ServicePrincipal
    //     cannot be added to Unified Groups").
    //  2) Buzon compartido, que si acepta el token de aplicacion. Es el respaldo
    //     automatico cuando el asesor no ha conectado su cuenta o el permiso
    //     delegado falta en Azure.
    if (calendarTarget === 'shared' && this.organizerScope() === 'group') {
      const enGrupo = await this.createGroupMeeting(
        user.id,
        user,
        subject,
        start,
        end,
        calendarTarget,
        contact,
        input.categorias,
      );
      if (enGrupo) return enGrupo;
      this.logger.debug(
        'Se agenda en el buzon compartido: el calendario del grupo requiere el ' +
          'permiso delegado Group.ReadWrite.All y que el asesor conecte su cuenta.',
      );
      return this.createSharedMailboxMeeting(
        user,
        subject,
        start,
        end,
        calendarTarget,
        contact,
        input.categorias,
      );
    }

    if (calendarTarget === 'shared' && this.organizerMode() === 'shared') {
      // Fallback: cuenta compartida (shared-mailbox)
      return this.createSharedMailboxMeeting(
        user,
        subject,
        start,
        end,
        calendarTarget,
        contact,
        input.categorias,
      );
    }

    const meeting = await this.createAdvisorMeeting(
      user.id,
      subject,
      start,
      end,
    );

    let eventId: string | null = null;
    let eventSource: TeamsMeetingCalendarSource = 'none';
    if (calendarTarget === 'personal') {
      eventId = await this.createAdvisorCalendarEvent(
        user.id,
        meeting,
        contact,
      );
      eventSource = 'personal';
    } else if (calendarTarget === 'shared') {
      // Modo legado: la reunion es del asesor y se copia el evento (con el
      // enlace) a la cuenta compartida.
      eventId = await this.createSharedCalendarEvent(meeting, contact);
      eventSource = 'shared-mailbox';
    }

    return { ...meeting, eventId, calendarTarget, eventSource };
  }

  /**
   * Crea el evento en el calendario del Grupo M365, con el grupo como
   * organizador.
   *
   * SOLO funciona con el token DELEGADO del asesor (`Group.ReadWrite.All` como
   * permiso delegado), nunca con el token de aplicacion: la tabla de permisos de
   * `POST /groups/{id}/events` dice "Application: Not supported", y medido
   * contra el grupo Soporte devuelve 403 ErrorAccessDenied. Agregar la app como
   * miembro del grupo tampoco sirve, Graph responde "ServicePrincipal cannot be
   * added to Unified Groups".
   *
   * Si Graph rechaza la llamada se devuelve `null` para que `provisionMeeting`
   * caiga al buzon compartido en vez de romper el flujo.
   */
  private async createGroupMeeting(
    advisorId: string | null,
    user: TeamsMeetingUser,
    subject: string,
    start: Date,
    end: Date,
    calendarTarget: TeamsCalendarTarget,
    contact?: CalendarEventContact,
    categorias?: string[],
  ): Promise<TeamsMeetingResult | null> {
    // Delegado si el asesor conecto su cuenta; si no, no hay token con el que
    // escribir en el grupo.
    //
    // NO se cae al token de aplicacion: ya se midio que devuelve 403 y lo
    // unico que haria es gastar un viaje a Graph para recibir el error.
    if (!advisorId) return null;
    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(advisorId);
    } catch {
      return null;
    }
    const groupId = await this.getGroupId();
    if (!groupId) {
      throw new BadRequestException(
        `No se pudo resolver el grupo '${this.getGroupName()}' en Microsoft 365.`,
      );
    }

    const attendees: Array<{
      emailAddress: { address: string; name?: string };
      type: string;
    }> = [];
    // Solo el contacto: invitar tambien al asesor hacia una COPIA del evento en
    // su calendario personal (Outlook materializa cada invitacion recibida), y
    // al marcar "calendario compartido" el requisito es UN solo registro, en el
    // calendario compartido. El asesor recibe el enlace por WhatsApp y la fila
    // local (teams_meetings) le permite verlo en el modulo Calendario.
    if (
      contact?.email &&
      contact.email.toLowerCase() !== user.email?.toLowerCase()
    ) {
      attendees.push({
        emailAddress: { address: contact.email },
        type: 'optional',
      });
    }

    const description = [
      `<b>Asesor:</b> ${this.escHtml(user.name || user.email || 'Sin nombre')}`,
    ];
    if (contact) {
      description.push(`<b>Contacto:</b> ${this.escHtml(contact.name)}`);
      description.push(`<b>Rol:</b> ${this.escHtml(contact.role)}`);
      description.push(`<b>Colegio:</b> ${this.escHtml(contact.institution)}`);
      description.push(`<b>Telefono:</b> ${this.escHtml(contact.phone)}`);
      if (contact.email) {
        description.push(`<b>Email:</b> ${this.escHtml(contact.email)}`);
      }
    }
    description.push(
      `<p>Unase a la videollamada desde el boton <b>Unirse</b> de este evento.</p>`,
    );

    const eventBody = {
      subject,
      start: { dateTime: this.toBogotaNaive(start), timeZone: BOGOTA_TZ },
      end: { dateTime: this.toBogotaNaive(end), timeZone: BOGOTA_TZ },
      attendees,
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      // Evita duplicados si Graph reintenta la misma peticion.
      transactionId: randomUUID(),
      body: { contentType: 'html', content: description.join('<br>') },
    };

    // Solo el nombre literal de Outlook viaja al evento ("Blue category",
    // "Orange category", ...): es el que el buzón reconoce y el que Teams y
    // Outlook pintan con su color. Los alias de la app se caen ahi (Graph los
    // conservaria como etiqueta gris y se verian dos categorias); el alias
    // queda en la fila local, con la que la app pinta su chip.
    const categoriasLimpias = categoriasParaGraph(categorias);
    if (categoriasLimpias.length) {
      (eventBody as Record<string, unknown>).categories = categoriasLimpias;
    }

    let data: any;
    try {
      const response = await axios.post(
        `https://graph.microsoft.com/v1.0/groups/${groupId}/events`,
        eventBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      data = response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.error?.code ?? '';
      // 403 aqui significa que falta el permiso delegado Group.ReadWrite.All en
      // Azure o que el asesor no ha conectado su cuenta: se registra y se cae al
      // buzon compartido en lugar de mostrar un error.
      if (status === 403 || status === 401) {
        this.logger.warn(
          `No se pudo crear en el calendario del grupo (status=${status} code=${code}). ` +
            'Se agenda en el buzon compartido. Revisa que Group.ReadWrite.All este ' +
            'agregado como permiso DELEGADO en Azure y con consentimiento de admin, ' +
            'y que el asesor haya conectado su cuenta de Microsoft.',
        );
        return null;
      }
      this.handleMicrosoftError(err, 'crear reunion en el calendario del grupo');
    }

    const joinUrl = data?.onlineMeeting?.joinUrl;
    if (!joinUrl) {
      throw new BadRequestException(
        'Teams no devolvio un enlace de reunion para el calendario del grupo',
      );
    }

    return {
      subject,
      startDateTime: this.bogotaNaiveToUtc(
        data?.start?.dateTime,
        start,
      ).toISOString(),
      endDateTime: this.bogotaNaiveToUtc(
        data?.end?.dateTime,
        end,
      ).toISOString(),
      joinUrl,
      meetingId: data?.onlineMeeting?.id ?? null,
      eventId: data?.id ?? null,
      calendarTarget,
      eventSource: 'group',
    };
  }

  /**
   * Una sola llamada a Graph crea el evento con Teams incrustado en el buzon
   * compartido.
   *
   * Esta es la ruta por defecto de creacion: `POST /groups/{id}/events` NO
   * admite permisos de aplicacion en Microsoft Graph (documentado como
   * "Application: Not supported"), asi que con client_credentials siempre
   * responde 403 ErrorAccessDenied aunque la app tenga Calendars.ReadWrite y
   * Group.ReadWrite.All. Medido contra el grupo Soporte: GET calendarView = 200,
   * POST events = 403, POST /users/{buzon}/events = 201.
   */
  private async createSharedMailboxMeeting(
    user: TeamsMeetingUser,
    subject: string,
    start: Date,
    end: Date,
    calendarTarget: TeamsCalendarTarget,
    contact?: CalendarEventContact,
    categorias?: string[],
  ): Promise<TeamsMeetingResult> {
    const accessToken = await this.getAppAccessToken();
    const accountId = await this.resolveAccountId(
      accessToken,
      this.generalAccountEmail(),
    );

    // Sin invitados: igual que en el calendario del grupo, invitar al asesor
    // dejaria una segunda copia del evento en su calendario personal y el
    // requisito es quedar con UN solo registro, en el calendario compartido.
    const attendees: Array<{
      emailAddress: { address: string; name?: string };
      type: string;
    }> = [];

    const description = [
      `<b>Asesor:</b> ${this.escHtml(user.name || user.email || 'Sin nombre')}`,
    ];
    if (contact) {
      description.push(`<b>Contacto:</b> ${this.escHtml(contact.name)}`);
      description.push(`<b>Rol:</b> ${this.escHtml(contact.role)}`);
      description.push(`<b>Colegio:</b> ${this.escHtml(contact.institution)}`);
      description.push(`<b>Telefono:</b> ${this.escHtml(contact.phone)}`);
      if (contact.email) {
        description.push(`<b>Email:</b> ${this.escHtml(contact.email)}`);
      }
    }
    description.push(
      `<p>Unase a la videollamada desde el boton <b>Unirse</b> de este evento.</p>`,
    );

    const eventBody = {
      subject,
      start: { dateTime: this.toBogotaNaive(start), timeZone: BOGOTA_TZ },
      end: { dateTime: this.toBogotaNaive(end), timeZone: BOGOTA_TZ },
      attendees,
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      // Evita reuniones duplicadas si Graph reintenta la misma peticion.
      transactionId: randomUUID(),
      body: { contentType: 'html', content: description.join('<br>') },
    };

    // Igual que en el calendario del grupo: al evento solo van los nombres
    // literales de Outlook, nunca los alias de la app (Teams los pintaria en
    // gris como una segunda categoria).
    const categoriasLimpias = categoriasParaGraph(categorias);
    if (categoriasLimpias.length) {
      (eventBody as Record<string, unknown>).categories = categoriasLimpias;
    }

    let data: any;
    try {
      const response = await axios.post(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(accountId)}/events`,
        eventBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      data = response.data;
    } catch (err: any) {
      this.handleMicrosoftError(
        err,
        'crear reunion en el calendario compartido',
      );
    }

    const joinUrl = data?.onlineMeeting?.joinUrl;
    if (!joinUrl) {
      throw new BadRequestException(
        'Teams no devolvio un enlace de reunion para el calendario compartido',
      );
    }

    return {
      subject,
      startDateTime: this.bogotaNaiveToUtc(
        data?.start?.dateTime,
        start,
      ).toISOString(),
      endDateTime: this.bogotaNaiveToUtc(
        data?.end?.dateTime,
        end,
      ).toISOString(),
      joinUrl,
      // El endpoint de eventos solo devuelve joinUrl, no el id de la reunion:
      // el evento es el objeto durable, guardamos su id.
      meetingId: null,
      eventId: data?.id ?? null,
      calendarTarget,
      eventSource: 'shared-mailbox',
    };
  }

  /** Videollamada creada con el token delegado del asesor (/me). */
  private async createAdvisorMeeting(
    advisorId: string,
    subject: string,
    start: Date,
    end: Date,
  ): Promise<AdvisorMeeting> {
    const accessToken = await this.getAccessToken(advisorId);

    let data: any;
    try {
      const response = await axios.post(
        'https://graph.microsoft.com/v1.0/me/onlineMeetings',
        {
          subject,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept-Language': 'es-CO',
          },
        },
      );
      data = response.data;
    } catch (err: any) {
      this.handleMicrosoftError(err, 'crear reunion');
    }
    const joinUrl = data?.joinWebUrl;
    if (!joinUrl)
      throw new BadRequestException('Teams no devolvio un enlace de reunion');

    return {
      subject,
      startDateTime: data.startDateTime ?? start.toISOString(),
      endDateTime: data.endDateTime ?? end.toISOString(),
      joinUrl,
      meetingId: data?.id ?? null,
    };
  }

  private eventDescription(
    meeting: AdvisorMeeting,
    contact?: CalendarEventContact,
  ): string {
    const description = [
      `<b>Enlace reunion Teams:</b> <a href="${this.escHtml(meeting.joinUrl)}">${this.escHtml(meeting.joinUrl)}</a>`,
    ];
    if (contact) {
      description.push(`<b>Contacto:</b> ${this.escHtml(contact.name)}`);
      description.push(`<b>Cargo:</b> ${this.escHtml(contact.role)}`);
      description.push(`<b>Colegio:</b> ${this.escHtml(contact.institution)}`);
      description.push(`<b>Telefono:</b> ${this.escHtml(contact.phone)}`);
      if (contact.email) {
        description.push(`<b>Email:</b> ${this.escHtml(contact.email)}`);
      }
    }
    return description.join('<br>');
  }

  /** Evento en el calendario del propio asesor (token delegado). */
  private async createAdvisorCalendarEvent(
    advisorId: string,
    meeting: AdvisorMeeting,
    contact?: CalendarEventContact,
  ): Promise<string | null> {
    const accessToken = await this.getAccessToken(advisorId);
    const eventBody = {
      subject: meeting.subject,
      start: {
        dateTime: this.toBogotaNaive(new Date(meeting.startDateTime)),
        timeZone: BOGOTA_TZ,
      },
      end: {
        dateTime: this.toBogotaNaive(new Date(meeting.endDateTime)),
        timeZone: BOGOTA_TZ,
      },
      body: {
        contentType: 'html',
        content: this.eventDescription(meeting, contact),
      },
      location: {
        displayName: 'Microsoft Teams',
      },
    };

    try {
      const response = await axios.post(
        'https://graph.microsoft.com/v1.0/me/calendar/events',
        eventBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response?.data?.id ?? null;
    } catch (err: any) {
      this.handleMicrosoftError(err, 'crear evento en calendario personal');
    }
  }

  /**
   * Copia el evento con el enlace a la cuenta compartida (modo legado
   * TEAMS_MEETING_ORGANIZER=advisor). No es un objeto de Teams, solo un evento
   * que apunta a la reunion creada por el asesor.
   */
  private async createSharedCalendarEvent(
    meeting: AdvisorMeeting,
    contact?: CalendarEventContact,
  ): Promise<string | null> {
    const accessToken = await this.getAppAccessToken();
    const accountId = await this.resolveAccountId(
      accessToken,
      this.generalAccountEmail(),
    );
    const eventBody = {
      subject: meeting.subject,
      start: {
        dateTime: this.toBogotaNaive(new Date(meeting.startDateTime)),
        timeZone: BOGOTA_TZ,
      },
      end: {
        dateTime: this.toBogotaNaive(new Date(meeting.endDateTime)),
        timeZone: BOGOTA_TZ,
      },
      body: {
        contentType: 'html',
        content: this.eventDescription(meeting, contact),
      },
      location: {
        displayName: 'Microsoft Teams',
      },
    };

    try {
      const response = await axios.post(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(accountId)}/events`,
        eventBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response?.data?.id ?? null;
    } catch (err: any) {
      this.handleMicrosoftError(
        err,
        'crear evento en el calendario compartido',
      );
    }
  }

  // ── Agenda (cuenta general) ────────────────────────────────────────────────

  /**
   * Agenda local. Semantica identica a assertCanManageMeeting: el asesor ve
   * solo sus propias reuniones; admin/superadmin ven la agenda completa.
   */
  async listMeetings(
    actor: TeamsMeetingUser & { role?: string },
    from?: Date,
    to?: Date,
  ): Promise<TeamsMeetingDto[]> {
    const where: any = {};
    const esAdmin = actor.role === 'admin' || actor.role === 'superadmin';
    if (!esAdmin) where.createdBy = actor.id;
    if (from || to) {
      where.startDateTime = {};
      if (from) where.startDateTime.moreThanOrEqual = from;
      if (to) where.startDateTime.lessThanOrEqual = to;
    }
    const rows = await this.meetingRepo.find({
      where,
      order: { startDateTime: 'ASC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async updateMeeting(
    actor: TeamsMeetingUser & { role?: string },
    meetingRecordId: string,
    input: TeamsMeetingInput,
  ): Promise<TeamsMeetingDto> {
    const reunion = await this.meetingRepo.findOne({ where: { id: meetingRecordId } });
    if (!reunion) throw new NotFoundException('No se encontró la reunión.');
    this.assertCanManageMeeting(reunion, actor);

    const subject = this.subjectConAsesor(
      this.cleanSubject(input.subject),
      { id: reunion.createdBy ?? actor.id, name: reunion.createdByName },
      input.categorias ?? reunion.categories ?? [],
    );
    const start = new Date(input.startDateTime);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Hora de reunión inválida.');
    const duration = this.clampDuration(input.durationMinutes);
    const end = new Date(start.getTime() + duration * 60_000);
    const categories = (input.categorias ?? reunion.categories ?? [])
      .map((category) => String(category ?? '').trim())
      .filter(Boolean)
      .slice(0, 10);

    // El evento de Graph recibe solo los nombres de Outlook (si antes tenia
    // un alias gris, la edicion lo limpia); la fila local conserva la lista
    // completa, alias incluido, para que la app siga pintando su chip.
    await this.updateCalendarEvent(
      reunion,
      subject,
      start,
      end,
      categoriasParaGraph(categories),
    );
    reunion.subject = subject;
    reunion.startDateTime = start;
    reunion.endDateTime = end;
    reunion.durationMinutes = duration;
    reunion.categories = categories;
    const saved = await this.meetingRepo.save(reunion);
    this.invalidarCacheCalendario();
    return this.toDto(saved);
  }

  async deleteMeeting(
    actor: TeamsMeetingUser & { role?: string },
    meetingRecordId: string,
  ): Promise<{ ok: true }> {
    const reunion = await this.meetingRepo.findOne({ where: { id: meetingRecordId } });
    if (!reunion) throw new NotFoundException('No se encontró la reunión.');
    this.assertCanManageMeeting(reunion, actor);

    await this.deleteCalendarEvent(reunion);
    await this.meetingRepo.delete({ id: reunion.id });
    this.invalidarCacheCalendario();
    return { ok: true };
  }

  private assertCanManageMeeting(
    reunion: TeamsMeeting,
    actor: TeamsMeetingUser & { role?: string },
  ): void {
    if (reunion.createdBy !== actor.id && actor.role !== 'admin' && actor.role !== 'superadmin') {
      throw new ForbiddenException('Solo quien creó la reunión puede editarla o eliminarla.');
    }
    if (!reunion.eventId && reunion.eventSource !== 'none' && !reunion.meetingId) {
      throw new BadRequestException('La reunión no tiene un identificador editable en Microsoft.');
    }
  }

  private async updateCalendarEvent(
    reunion: TeamsMeeting,
    subject: string,
    start: Date,
    end: Date,
    categories: string[],
  ): Promise<void> {
    const source = this.eventSourceOf(reunion);
    const body = {
      subject,
      start: { dateTime: this.toBogotaNaive(start), timeZone: BOGOTA_TZ },
      end: { dateTime: this.toBogotaNaive(end), timeZone: BOGOTA_TZ },
      categories,
    };

    try {
      if (source === 'none') {
        await this.mutateOnlineMeeting(reunion, 'patch', {
          subject,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        });
        return;
      }
      await this.mutateCalendarEvent(reunion, source, 'patch', body);
    } catch (error: any) {
      if (this.esNotFound(error) && this.puedeEstarEnBuzon(reunion)) {
        await this.mutateCalendarEvent(reunion, 'shared-mailbox', 'patch', body);
        reunion.eventSource = 'shared-mailbox';
        return;
      }
      if (this.esNotFound(error)) {
        throw new BadRequestException(
          'La reunion ya no existe en Microsoft. Actualiza el calendario para ver los cambios.',
        );
      }
      throw error;
    }
    reunion.eventSource = source;
  }

  private async deleteCalendarEvent(reunion: TeamsMeeting): Promise<void> {
    const source = this.eventSourceOf(reunion);

    try {
      if (source === 'none') {
        await this.mutateOnlineMeeting(reunion, 'delete');
        return;
      }
      await this.mutateCalendarEvent(reunion, source, 'delete');
    } catch (error: any) {
      if (this.esNotFound(error) && this.puedeEstarEnBuzon(reunion)) {
        try {
          await this.mutateCalendarEvent(reunion, 'shared-mailbox', 'delete');
          reunion.eventSource = 'shared-mailbox';
          return;
        } catch (fallbackError: any) {
          if (this.esNotFound(fallbackError)) {
            this.logger.warn(
              `El evento de la reunion ${reunion.id} ya no existia en Microsoft.`,
            );
            return;
          }
          throw fallbackError;
        }
      }
      if (this.esNotFound(error)) {
        // Borrado idempotente: si Microsoft ya no lo tiene, lo unico que queda
        // es limpiar el registro local.
        this.logger.warn(
          `El evento de la reunion ${reunion.id} ya no existia en Microsoft.`,
        );
        return;
      }
      throw error;
    }
    reunion.eventSource = source;
  }

  /** Filas antiguas: si se dedujo Grupo y no estaba ahi, prueba el buzon. */
  private puedeEstarEnBuzon(reunion: TeamsMeeting): boolean {
    return (
      !reunion.eventSource &&
      reunion.calendarTarget === 'shared' &&
      this.eventSourceOf(reunion) !== 'shared-mailbox'
    );
  }

  private esNotFound(error: any): boolean {
    return error?.response?.status === 404 || error?.status === 404;
  }

  /** Videollamada sin evento de calendario: solo existe el onlineMeeting. */
  private async mutateOnlineMeeting(
    reunion: TeamsMeeting,
    method: 'patch' | 'delete',
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!reunion.meetingId) {
      throw new BadRequestException('La reunion no tiene un identificador de Teams.');
    }
    if (!reunion.createdBy) {
      throw new BadRequestException('No se conoce el creador de esta reunion.');
    }
    const token = await this.getAccessToken(reunion.createdBy);
    await this.microsoftRequest(
      method,
      `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(reunion.meetingId)}`,
      token,
      payload,
      `${method === 'patch' ? 'editar' : 'eliminar'} reunion de Teams`,
    );
  }

  private eventSourceOf(reunion: TeamsMeeting): TeamsMeetingCalendarSource {
    if (reunion.eventSource) return reunion.eventSource;
    if (reunion.calendarTarget === 'personal') return 'personal';
    if (reunion.calendarTarget === 'none') return 'none';
    return this.organizerScope() === 'group' ? 'group' : 'shared-mailbox';
  }

  private async mutateCalendarEvent(
    reunion: TeamsMeeting,
    source: Exclude<TeamsMeetingCalendarSource, 'none'>,
    method: 'patch' | 'delete',
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!reunion.eventId) throw new BadRequestException('La reunión no tiene evento de calendario.');

    let url: string;
    let token: string;
    if (source === 'group') {
      if (!reunion.createdBy) throw new BadRequestException('No se conoce quién creó esta reunión del grupo.');
      token = await this.getAccessToken(reunion.createdBy);
      const groupId = await this.getGroupId();
      if (!groupId) throw new BadRequestException('No se pudo resolver el calendario del grupo.');
      url = `https://graph.microsoft.com/v1.0/groups/${groupId}/events/${encodeURIComponent(reunion.eventId)}`;
    } else if (source === 'personal') {
      if (!reunion.createdBy) throw new BadRequestException('No se conoce el creador del calendario personal.');
      token = await this.getAccessToken(reunion.createdBy);
      url = `https://graph.microsoft.com/v1.0/me/calendar/events/${encodeURIComponent(reunion.eventId)}`;
    } else {
      token = await this.getAppAccessToken();
      const accountId = await this.resolveAccountId(token, this.generalAccountEmail());
      url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(accountId)}/events/${encodeURIComponent(reunion.eventId)}`;
    }

    await this.microsoftRequest(
      method,
      url,
      token,
      payload,
      `${method === 'patch' ? 'editar' : 'eliminar'} reunión del calendario`,
    );
  }

  private async microsoftRequest(
    method: 'patch' | 'delete',
    url: string,
    token: string,
    payload: Record<string, unknown> | undefined,
    action: string,
  ): Promise<void> {
    try {
      if (method === 'patch') {
        await axios.patch(url, payload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      } else {
        await axios.delete(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }
    } catch (error: any) {
      // El 404 se propaga crudo: `handleMicrosoftError` lo convertiria en un
      // BadRequestException generico y el llamador no podria detectar que el
      // evento ya no existe (caso normal en borrados repetidos).
      if (error?.response?.status === 404) throw error;
      this.handleMicrosoftError(error, action);
    }
  }

  async createStandaloneMeeting(
    user: TeamsMeetingUser | null,
    input: TeamsMeetingInput & { calendarTarget?: TeamsCalendarTarget },
  ): Promise<TeamsMeetingDto> {
    if (!user?.id) {
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    }

    const duration = this.clampDuration(input.durationMinutes);
    const meeting = await this.provisionMeeting(
      user,
      { ...input, durationMinutes: duration },
      input.calendarTarget ?? 'shared',
    );

    const row = this.meetingRepo.create({
      createdBy: user?.id ?? null,
      createdByName: user?.name ?? null,
      subject: meeting.subject,
      categories: input.categorias ?? [],
      startDateTime: new Date(meeting.startDateTime),
      endDateTime: new Date(meeting.endDateTime),
      durationMinutes: duration,
      joinUrl: meeting.joinUrl,
      meetingId: meeting.meetingId,
      eventId: meeting.eventId,
      calendarTarget: meeting.calendarTarget,
      eventSource: meeting.eventSource,
    });
    const saved = await this.meetingRepo.save(row);
    // La reunion ya quedo en el grupo o en el buzon: la lectura del calendario
    // tiene que releer Graph, no devolver la respuesta cacheada de hace 2 min.
    this.invalidarCacheCalendario();
    return this.toDto(saved);
  }

  private toDto(row: TeamsMeeting): TeamsMeetingDto {
    return {
      id: row.id,
      subject: row.subject,
      startDateTime: row.startDateTime.toISOString(),
      endDateTime: row.endDateTime.toISOString(),
      durationMinutes: row.durationMinutes,
      joinUrl: row.joinUrl,
      meetingId: row.meetingId,
      eventId: row.eventId,
      calendarTarget: row.calendarTarget,
      eventSource: row.eventSource,
      categorias: row.categories ?? [],
      createdByName: row.createdByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private generalAccountEmail(): string {
    return (
      this.config.get<string>('TEAMS_MEETINGS_ACCOUNT') ||
      'soporte@innovacloud.co'
    );
  }

  /**
   * Quien organiza la videollamada. Por defecto la cuenta compartida, para que
   * el calendario compartido no dependa del login de cada asesor. Con
   * TEAMS_MEETING_ORGANIZER=advisor se vuelve al modo legado: la reunion nace
   * en la cuenta del asesor y se copia el evento a la compartida.
   */
  private organizerMode(): TeamsMeetingOrganizer {
    const configured = (
      this.config.get<string>('TEAMS_MEETING_ORGANIZER') ?? 'shared'
    )
      .trim()
      .toLowerCase();
    return configured === 'advisor' ? 'advisor' : 'shared';
  }

  private clampDuration(minutes?: number): number {
    return Math.min(Math.max(minutes ?? 30, 15), 240);
  }

  private getGroupName(): string {
    return (
      (this.config.get<string>('TEAMS_GROUP_NAME') ?? 'Soporte').trim() ||
      'Soporte'
    );
  }

  /**
   * Resuelve el id del grupo M365. Usa TEAMS_GROUP_ID si esta definido; si no,
   * busca por displayName. Nunca lanza: si faltan permisos o no existe, devuelve
   * null para que el flujo caiga al buzon compartido.
   */
  private async getGroupId(): Promise<string | null> {
    const configured = this.config.get<string>('TEAMS_GROUP_ID')?.trim();
    if (configured && /^[0-9a-fA-F-]{36}$/.test(configured)) {
      return configured;
    }
    try {
      const accessToken = await this.getAppAccessToken();
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${encodeURIComponent(
          this.getGroupName(),
        )}'&$select=id,displayName,groupTypes,mailEnabled,securityEnabled`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const groups = Array.isArray(response?.data?.value)
        ? response.data.value
        : [];
      return groups[0]?.id ?? null;
    } catch (err: any) {
      this.logger.warn(
        `No se pudo resolver el grupo '${this.getGroupName()}': ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Alcance del organizador: group (default) | shared-mailbox | advisor.
   */
  private organizerScope(): TeamsMeetingOrganizerScope {
    const configured = (
      this.config.get<string>('TEAMS_MEETING_ORGANIZER_SCOPE') ?? 'group'
    )
      .trim()
      .toLowerCase();
    if (configured === 'shared-mailbox' || configured === 'mailbox') {
      return 'shared-mailbox';
    }
    if (configured === 'advisor') {
      return 'advisor';
    }
    return 'group';
  }

  /**
   * Graph espera la hora del evento en hora local sin zona cuando se manda
   * timeZone explicito. Enviar el ISO UTC con timeZone America/Bogota corria el
   * evento 5 horas.
   */
  private toBogotaNaive(date: Date): string {
    const local = new Date(
      date.getTime() + TeamsMeetingsService.BOGOTA_OFFSET_MS,
    );
    return local.toISOString().slice(0, 19);
  }

  /**
   * Convierte de vuelta la hora local que devuelve Graph al instante UTC, para
   * persistir en teams_meetings. Graph responde hasta 7 decimales de segundo,
   * que new Date() no parsea, asi que se normaliza a 3.
   */
  private bogotaNaiveToUtc(value: string | undefined, fallback: Date): Date {
    const raw = (value ?? '').trim();
    if (!raw) return fallback;
    const normalized = raw.replace(/(\.\d{3})\d+/, '$1');
    const hasZone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(normalized);
    if (hasZone) {
      const zoned = new Date(normalized);
      return Number.isNaN(zoned.getTime()) ? fallback : zoned;
    }
    // Sin zona, Graph la entrega en hora de Bogota: hay que restar el offset.
    const asUtc = new Date(`${normalized.slice(0, 19)}Z`).getTime();
    if (Number.isNaN(asUtc)) return fallback;
    return new Date(asUtc - TeamsMeetingsService.BOGOTA_OFFSET_MS);
  }

  /**
   * Resuelve el Object ID (GUID) de la cuenta general.
   * El endpoint /users/{id}/onlineMeetings exige un GUID, no un correo.
   */
  private async resolveAccountId(
    accessToken: string,
    email: string,
  ): Promise<string> {
    const configured = this.config
      .get<string>('TEAMS_MEETINGS_ACCOUNT_ID')
      ?.trim();
    if (configured && /^[0-9a-fA-F-]{36}$/.test(configured)) {
      return configured;
    }

    let data: any;
    try {
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      data = response.data;
    } catch (err: any) {
      this.handleMicrosoftError(err, `resolver id de ${email}`);
    }
    if (!data?.id) {
      throw new BadRequestException(
        'No se pudo resolver el Object ID de la cuenta Teams',
      );
    }
    return data.id;
  }

  private async getAccessToken(advisorId: string): Promise<string> {
    const token = await this.tokenRepo.findOne({ where: { advisorId } });
    if (!token)
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
    if (!token.refreshToken) {
      await this.tokenRepo.delete({ advisorId });
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    }

    try {
      const refreshed = await this.refreshAccessToken(token.refreshToken);
      await this.tokenRepo.update(
        { advisorId },
        {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          accountName: refreshed.accountName,
        },
      );
      return refreshed.accessToken;
    } catch (err: any) {
      await this.tokenRepo.delete({ advisorId });
      this.logger.warn(`No se pudo refrescar Teams: ${err?.message ?? err}`);
      throw new UnauthorizedException('Debes iniciar sesion en Teams');
    }
  }

  private async getAppAccessToken(): Promise<string> {
    if (
      this.appAccessToken &&
      this.appAccessToken.expiresAt > Date.now() + 60_000
    ) {
      return this.appAccessToken.token;
    }

    const body = new URLSearchParams();
    body.set('client_id', this.clientId());
    body.set(
      'client_secret',
      this.config.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
    );
    body.set('scope', 'https://graph.microsoft.com/.default');
    body.set('grant_type', 'client_credentials');

    let data: any;
    try {
      const response = await axios.post(this.appTokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      const detail =
        err?.response?.data?.error_description ||
        err?.response?.data?.error_codes ||
        err?.message ||
        '';
      this.logger.warn(
        `Fallo client_credentials: ${err?.response?.status} ${err?.response?.data?.error || err?.message} ${detail}`,
      );
      throw new BadRequestException(
        `Error al autenticar aplicacion con Microsoft (client_credentials): ${detail} Verifica MICROSOFT_APP_TENANT_ID y que la app tenga credencial de tipo secret (client_credentials).`,
      );
    }

    const expiresIn = Number(data?.expires_in ?? 3600);
    this.appAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    };
    return this.appAccessToken.token;
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    accountName?: string;
  }> {
    const body = this.baseTokenBody();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', this.redirectUri());
    body.set('code_verifier', codeVerifier);
    this.addClientSecret(body);

    let data: any;
    try {
      const response = await axios.post(this.tokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      this.handleMicrosoftError(err, 'conectar Teams');
    }
    return this.normalizeTokenSet(data);
  }

  private async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    accountName?: string;
  }> {
    const body = this.baseTokenBody();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    this.addClientSecret(body);

    let data: any;
    try {
      const response = await axios.post(this.tokenUrl(), body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      data = response.data;
    } catch (err) {
      this.handleMicrosoftError(err, 'refrescar Teams');
    }
    return this.normalizeTokenSet(data, refreshToken);
  }

  private handleMicrosoftError(err: any, action: string): never {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const code =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.code === 'string'
          ? data.code
          : JSON.stringify(data?.error ?? data?.code ?? '');
    // Nunca se loguea el cuerpo crudo: Graph puede devolver tokens o datos
    // sensibles. Se resume a claves (secretos ocultos) y se trunca.
    this.logger.warn(`Microsoft raw error: ${this.resumenErrorMicrosoft(data)}`);
    const description =
      data?.error_description || data?.message || err?.message || '';
    this.logger.warn(
      `Microsoft fallo al ${action}: status=${status ?? 'n/a'} code=${code || 'n/a'} detail=${description || 'n/a'}`,
    );

    if (status === 401 || code === 'invalid_client') {
      throw new BadRequestException(
        'Microsoft rechazo la conexion. Revisa MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y que el Redirect URI coincida exactamente en Azure.',
      );
    }

    if (code === 'invalid_grant') {
      throw new BadRequestException(
        'La autorizacion de Microsoft expiro. Cierra esta ventana e intenta conectar de nuevo.',
      );
    }

    if (status === 403) {
      if (action.includes('resolver id')) {
        throw new BadRequestException(
          'No se pudo resolver el Object ID de la cuenta Teams. Agrega el permiso de aplicacion User.Read.All o define TEAMS_MEETINGS_ACCOUNT_ID con el Object ID del usuario.',
        );
      }
      if (action.includes('calendario del grupo')) {
        // No es un permiso que se pueda agregar: es una restriccion de Graph.
        throw new BadRequestException(
          'Microsoft no permite crear eventos en el calendario de un grupo M365 ' +
            'con permisos de aplicacion (POST /groups/{id}/events responde 403 ' +
            'aunque la app tenga Calendars.ReadWrite y Group.ReadWrite.All). Por eso ' +
            'la reunion se agenda en el buzon compartido. Para escribir en el ' +
            'calendario del grupo haria falta un permiso delegado del asesor.',
        );
      }
      if (action.includes('calendario')) {
        throw new BadRequestException(
          'No tienes permisos para agendar en el calendario. Revisa el permiso Calendars.ReadWrite en Azure.',
        );
      }
      throw new BadRequestException(
        'La cuenta conectada no tiene permisos para crear reuniones de Teams. Verifica que el asesor tenga licencia de Teams y asigna el permiso OnlineMeetings.ReadWrite (delegado) en Azure.',
      );
    }

    throw new BadRequestException(
      'No se pudo completar la operacion con Microsoft. Intenta nuevamente o revisa la configuracion.',
    );
  }

  /** Resumen seguro del cuerpo de error de Graph (oculta tokens, trunca). */
  private resumenErrorMicrosoft(data: unknown): string {
    const CLAVES_SENSIBLES = [
      'access_token',
      'refresh_token',
      'id_token',
      'client_secret',
      'password',
      'assertion',
      'code_verifier',
    ];
    try {
      if (!data) return '[sin cuerpo]';
      if (typeof data !== 'object') return String(data).slice(0, 400);
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        safe[k] = CLAVES_SENSIBLES.includes(k.toLowerCase()) ? '[oculto]' : v;
      }
      return JSON.stringify(safe).slice(0, 400);
    } catch {
      return '[sin cuerpo]';
    }
  }

  private normalizeTokenSet(data: any, fallbackRefreshToken = '') {
    const expiresIn = Number(data?.expires_in ?? 3600);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? fallbackRefreshToken,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
      accountName: this.accountNameFromIdToken(data.id_token),
    };
  }

  private baseTokenBody(): URLSearchParams {
    const body = new URLSearchParams();
    body.set('client_id', this.clientId());
    body.set('scope', this.scopes.join(' '));
    return body;
  }

  private addClientSecret(body: URLSearchParams): void {
    const secret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
    if (secret) body.set('client_secret', secret);
  }

  private accountNameFromIdToken(idToken?: string): string | undefined {
    if (!idToken) return undefined;
    try {
      const [, payload] = idToken.split('.');
      if (!payload) return undefined;
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      return decoded.name || decoded.preferred_username || decoded.email;
    } catch {
      return undefined;
    }
  }

  private cleanSubject(value: string): string {
    const subject = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_ASUNTO);
    if (!subject) throw new BadRequestException('Nombre de reunion requerido');
    return subject;
  }

  /** Solo presencial/virtual muestran el nombre del creador en el asunto. */
  private subjectConAsesor(
    subject: string,
    user: TeamsMeetingUser,
    categorias: string[] = [],
  ): string {
    const claves = categorias.map((categoria) =>
      categoria.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    const requierePrefijo = claves.some((categoria) =>
      categoria === 'reunion presencial' ||
      categoria === 'yellow category' ||
      categoria === 'blue category' ||
      categoria === 'reunion virtual' ||
      categoria === 'orange category',
    );

    if (!requierePrefijo) {
      // Cumpleaños y reuniones de equipo no llevan el nombre del creador.
      return subject.replace(/^\([^)]{1,100}\)\s*/, '').trim() || subject;
    }

    const nombre = (user?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!nombre) return subject;

    const prefijo = `(${nombre})`;
    if (subject.toLowerCase().startsWith(prefijo.toLowerCase())) return subject;

    // cleanSubject deja el asunto en 160 caracteres: aqui se reserva el espacio
    // del prefijo y se recorta el final, que es donde queda la informacion
    // util ("... con el cliente"), en vez de cortar el nombre del asistente.
    const espacio = LIMITE_ASUNTO - prefijo.length - 1;
    if (espacio <= 0) return prefijo;
    const cuerpo =
      subject.length > espacio ? subject.slice(0, espacio).trimEnd() : subject;
    return `${prefijo} ${cuerpo}`;
  }

  private escHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private clientId(): string {
    const value = this.config.get<string>('MICROSOFT_CLIENT_ID');
    if (!value)
      throw new BadRequestException('Falta configurar MICROSOFT_CLIENT_ID');
    return value;
  }

  private authority(): string {
    const tenant =
      this.config.get<string>('MICROSOFT_TENANT_ID') ||
      this.config.get<string>('MICROSOFT_APP_TENANT_ID') ||
      'common';
    return `https://login.microsoftonline.com/${tenant}`;
  }

  private tokenUrl(): string {
    return `${this.authority()}/oauth2/v2.0/token`;
  }

  private appTokenUrl(): string {
    const candidate = this.config.get<string>('MICROSOFT_APP_TENANT_ID');
    if (this.isPlausibleTenant(candidate)) {
      return `https://login.microsoftonline.com/${candidate}/oauth2/v2.0/token`;
    }
    const fallback = this.config.get<string>('MICROSOFT_TENANT_ID');
    if (this.isPlausibleTenant(fallback)) {
      return `https://login.microsoftonline.com/${fallback}/oauth2/v2.0/token`;
    }
    const accountDomain = this.generalAccountEmail().split('@')[1] || 'common';
    return `https://login.microsoftonline.com/${accountDomain}/oauth2/v2.0/token`;
  }

  private isPlausibleTenant(value?: string): boolean {
    const t = (value ?? '').trim();
    if (!t || t === 'common' || t === 'consumers') return false;
    return !/^(your-|change|cambio|tu-|su-|ingrese|reemplaza|placeholder|ejemplo)/i.test(
      t,
    );
  }

  private redirectUri(): string {
    const configured = this.config.get<string>('MICROSOFT_REDIRECT_URI');
    if (configured) return configured;
    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:3001';
    return `${appUrl}/advisors-whatsapp/teams/oauth/callback`;
  }

  private randomToken(bytes = 32): string {
    return this.base64Url(randomBytes(bytes));
  }

  private base64Url(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private cleanupPendingAuth(): void {
    const maxAge = 10 * 60_000;
    for (const [state, pending] of this.pendingAuth.entries()) {
      if (Date.now() - pending.createdAt > maxAge)
        this.pendingAuth.delete(state);
    }
  }
}
