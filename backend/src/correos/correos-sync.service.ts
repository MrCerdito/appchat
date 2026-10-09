import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { MicrosoftGraphMailService } from './microsoft-graph-mail.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { CorreoMensaje, CorreoOrigen } from './entities/correo-mensaje.entity';
import { CorreoCarpetaSync } from './entities/correo-carpeta-sync.entity';
import {
  GRAPH_MESSAGE_SELECT,
  GraphMessageListItem,
  GraphRecipient,
} from './graph.types';
import { CorreosGateway } from './correos.gateway';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_PAGINAS_DELTA = 200;
/** Tamano de pagina de la importacion completa. Graph admite hasta 1000 por $top. */
const TOP_LISTADO = 100;

/**
 * Periodo por defecto del sincronizador. El estado de lectura de Outlook solo
 * puede cambiar cuando el delta se ejecuta, asi que este numero ES lo que el
 * asesor percibe como actualizacion del correo. Bajarlo a 2 min multiplica el
 * trafico a Graph por ~2.5, pero el delta en reposo devuelve casi vacio.
 */
const MINUTOS_SYNC_POR_DEFECTO = 2;

/** Espera antes de volver a preguntar a Graph tras un 403. Suficiente para no
 * quemar cuota si falta el permiso, y corto para que concederlo en Entra ID se
 * note sin reiniciar el backend.
 */
const COOLDOWN_PERMISOS_MS = 15 * 60 * 1000;

export interface ResultadoSync {
  carpetaId: string;
  carpetaNombre: string;
  nuevos: number;
  actualizados: number;
  eliminados: number;
  resincronizado: boolean;
  /**
   * True si esta pasada reconstruyo la carpeta entera. Sirve para no avisar al
   * asesor de los 53 correos que ya tenia: lo nuevo para el es lo que llega
   * DESPUES de la primera importacion.
   */
  huboImportacionInicial: boolean;
  /** Id local del correo nuevo mas reciente, para enlazar el aviso. */
  idUltimoNuevo: string | null;
  /** IDs locales de cada correo nuevo detectado en esta pasada. */
  idsNuevos: string[];
  /** De los nuevos, al menos uno venia sin leer. */
  hayNoLeidos: boolean;
  /** Asunto del correo nuevo mas reciente, para el texto del aviso. */
  asuntoUltimoNuevo: string | null;
  error?: string;
}

/**
 * Sincronizacion periodica del buzon compartido con Microsoft Graph.
 *
 * Usa `messages/delta`, que es el mecanismo nativo para "traer solo lo nuevo".
 * Graph entrega un `deltaLink` opaco al terminar; guardarlo es lo que evita
 * releer la carpeta entera en cada pasada. Con ese enlace no se vuelve a
 * descargar lo ya visto, que es el requisito de no procesar dos veces el mismo
 * correo.
 *
 * Casos que estan contemplados porque en produccion ocurren:
 *  - el token delta caduca -> Graph responde 410 / SyncStateNotFound y hay que
 *    rehacer la sincronizacion completa de esa carpeta;
 *  - un correo se borra o se mueve -> delta lo devuelve con `@removed`;
 *  - falta el permiso Mail.Read -> el job entra en cooldown en vez de reintentar
 *    en bucle y seguir consumiendo cuota de Graph; al vencer vuelve a intentar,
 *    de modo que conceder el permiso en Entra ID se recupera solo;
 *  - la carpeta fue borrada y recreada -> su id cambio, se invalida la cache.
 */
@Injectable()
export class CorreosSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CorreosSyncService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private enProceso = false;
  /** Momento en que se vuelve a intentar tras un 403. 0 = sin bloqueo. */
  private deshabilitadoHasta = 0;
  private esquemaListo = false;
  /**
   * Sincronizaciones en vuelo por asesor. El tic usa `enProceso`, pero el sync
   * que dispara el modulo al abrir no lo pasa por ahi: sin este mapa los dos
   * competirian por el mismo deltaLink.
   */
  private readonly syncEnCurso = new Map<string, Promise<ResultadoSync>>();
  /**
   * Pasadas completas del sincronizador. Va en el evento de SLA para que el
   * admin pueda distinguir "no hay novedades" de "el tablero no esta leyendo".
   */
  private tickNum = 0;

  constructor(
    @InjectRepository(CorreoMensaje)
    private readonly mensajeRepo: Repository<CorreoMensaje>,
    @InjectRepository(CorreoCarpetaSync)
    private readonly carpetaRepo: Repository<CorreoCarpetaSync>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly graph: MicrosoftGraphMailService,
    private readonly carpetas: CorreosCarpetaService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly gateway: CorreosGateway,
    private readonly notificaciones: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();

    const minutos = Math.max(
      Number(this.config.get('CORREOS_SYNC_MINUTOS') ?? MINUTOS_SYNC_POR_DEFECTO) || MINUTOS_SYNC_POR_DEFECTO,
      1,
    );
    if (this.config.get('CORREOS_SYNC_ACTIVO') === 'false') {
      this.logger.log('Sincronizacion de correo desactivada (CORREOS_SYNC_ACTIVO=false).');
      return;
    }
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, minutos * 60_000);
    this.logger.log(
      `Sincronizacion de correo iniciada cada ${minutos} min sobre ${this.carpetas.upnBuzon()}`,
    );

    // Primera pasada inmediata: sin esto, reiniciar el backend dejaba la bandeja
    // congelada hasta el primer tic, y un despliegue se veía como "no hay correo".
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /**
   * `synchronize` solo esta activo en desarrollo, asi que en produccion las
   * tablas se crean aqui, que es el patron que ya usa el resto del proyecto.
   */
  private async ensureSchema(): Promise<void> {
    if (this.esquemaListo) return;
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS correo_mensajes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          graph_message_id varchar(255) NOT NULL UNIQUE,
          folder_id varchar(255) NOT NULL,
          folder_display_name varchar(255),
          asesor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conversation_id varchar(255),
          subject varchar(500),
          from_nombre varchar(300),
          from_email varchar(300),
          reply_to text,
          para text,
          cc text,
          body_preview text,
          is_read boolean NOT NULL DEFAULT false,
          has_attachments boolean NOT NULL DEFAULT false,
          importance varchar(20) NOT NULL DEFAULT 'normal',
          internet_message_id varchar(500),
          received_at timestamptz,
          sent_at timestamptz,
          origen varchar(20) NOT NULL DEFAULT 'buzon',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS correo_adjuntos (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          graph_attachment_id varchar(255) NOT NULL UNIQUE,
          mensaje_id uuid NOT NULL REFERENCES correo_mensajes(id) ON DELETE CASCADE,
          graph_message_id varchar(255) NOT NULL,
          nombre varchar(500),
          content_type varchar(200),
          tamano int,
          is_inline boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS correo_carpeta_sync (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          buzon varchar(255) NOT NULL,
          folder_id varchar(255) NOT NULL,
          folder_display_name varchar(255),
          parent_folder_id varchar(255),
          delta_link text,
          importado_completo boolean NOT NULL DEFAULT false,
          last_sync_at timestamptz,
          last_error varchar(500),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_correo_carpeta_sync_buzon_folder
         ON correo_carpeta_sync(buzon, folder_id)`,
      );
      // La tabla ya existe en las instalaciones creadas antes de este campo: el
      // ALTER es idempotente y deja marca de "falta importacion completa" en las
      // carpetas que quedaron con solo la primera tanda de `messages/delta`.
      await this.dataSource.query(
        `ALTER TABLE correo_carpeta_sync
         ADD COLUMN IF NOT EXISTS importado_completo boolean NOT NULL DEFAULT false`,
      );
      // Categorias de Outlook: la columna llega vacia en las instalaciones que
      // ya tenian la tabla, y la siguiente sincronizacion completa la llena.
      await this.dataSource.query(
        `ALTER TABLE correo_mensajes ADD COLUMN IF NOT EXISTS categorias text`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_correo_mensajes_asesor_received
         ON correo_mensajes(asesor_id, received_at DESC)`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_correo_mensajes_conversation
         ON correo_mensajes(conversation_id)`,
      );
      // Bandeja de salida persistente: el delta no debe perder el aviso si el
      // servicio de notificaciones cae justo despues de guardar su checkpoint.
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS correo_notification_outbox (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          correo_mensaje_id uuid NOT NULL REFERENCES correo_mensajes(id) ON DELETE CASCADE,
          correo_mensaje_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
           cantidad integer NOT NULL DEFAULT 1,
           carpeta varchar(255) NOT NULL,
           asunto text,
           remitente_nombre text,
           remitente_email text,
           vista_previa text,
           hay_no_leidos boolean NOT NULL DEFAULT false,
          creado_at timestamptz NOT NULL DEFAULT now(),
          entregado_at timestamptz,
          UNIQUE (correo_mensaje_id)
        )`);
      await this.dataSource.query(
        `ALTER TABLE correo_notification_outbox
         ADD COLUMN IF NOT EXISTS correo_mensaje_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]`,
      );
      await this.dataSource.query(
        `ALTER TABLE correo_notification_outbox
         ADD COLUMN IF NOT EXISTS remitente_nombre text,
         ADD COLUMN IF NOT EXISTS remitente_email text,
         ADD COLUMN IF NOT EXISTS vista_previa text`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_correo_notification_outbox_pending
         ON correo_notification_outbox(recipient_id, creado_at)
         WHERE entregado_at IS NULL`,
      );
      this.esquemaListo = true;
    } catch (error: any) {
      this.logger.error(
        `[Correos] No se pudo asegurar el esquema: ${error?.message ?? error}`,
      );
    }
  }

  private async tick(): Promise<void> {
    if (this.enProceso || this.deshabilitado) return;
    this.enProceso = true;
    try {
      // Acumulador de la pasada: si queda en cero, para el espejo local no
      // cambio nada y no hay por que molestar a los tableros de SLA.
      let nuevos = 0;
      let actualizados = 0;
      let eliminados = 0;

      // Solo los asesores tienen carpeta propia en ASIGNADOS; sincronizar a los
      // demas roles solo generaria errores NotFound en cada pasada.
      const asesores = await this.userRepo.find({
        where: { active: true, role: 'advisor' },
        select: ['id', 'name', 'role'],
      });
      for (const asesor of asesores) {
        try {
          // notificar=true: el tic es la fuente automatica de "llego correo".
          const r = await this.sincronizarAsesor(asesor.id, asesor.name, true);
          nuevos += r.nuevos;
          actualizados += r.actualizados;
          eliminados += r.eliminados;
          if (r.nuevos > 0) {
            this.logger.log(
              `Correo: ${r.nuevos} nuevo(s) para "${asesor.name}" en ${r.carpetaNombre}.`,
            );
          }
        } catch (err: any) {
          if (err instanceof ForbiddenException) {
            // El permiso es global de la app, asi que no tiene sentido seguir
            // probando asesor por asesor: se entra en cooldown y se reintenta
            // solo cuando venza (asi no se pierde nada sidan el permiso).
            this.deshabilitadoHasta = Date.now() + COOLDOWN_PERMISOS_MS;
            this.logger.error(
              'Sincronizacion de correo detenida: falta el permiso Application "Mail.Read" ' +
                'en la app Korvix con admin consent. Se reintentara en ' +
                `${Math.round(COOLDOWN_PERMISOS_MS / 60000)} min; mientras tanto ` +
                'el buscador manual reintenta al instante.',
            );
            return;
          }
          // Un asesor sin carpeta propia no es un fallo: se registra y se sigue.
          this.logger.debug(
            `No se sincronizo "${asesor.name}": ${err?.message ?? err}`,
          );
        }
      }

      // Un solo empujon por pasada, no uno por asesor: el tablero se recarga
      // una vez aunque hayan cambiado diez carpetas a la vez.
      this.tickNum += 1;
      if (nuevos || actualizados || eliminados) {
        this.gateway.avisarSla({ tick: this.tickNum, nuevos, actualizados, eliminados });
        this.logger.debug(
          `Correos: tick ${this.tickNum} cambio el espejo (+${nuevos}/~${actualizados}/-${eliminados}); ` +
            'se aviso a los tableros de SLA.',
        );
      }
    } catch (error: any) {
      this.logger.error(`Fallo la sincronizacion de correo: ${error?.message ?? error}`);
    } finally {
      this.enProceso = false;
    }
  }

  /**
   * Sincroniza la carpeta de un asesor. Es idempotente: correrla dos veces no
   * duplica nada, porque el upsert se hace por graphMessageId.
   *
   * `notificar` se conserva por compatibilidad con los callers existentes. Todo
   * correo nuevo se registra en la campana, incluso si la sincronizacion la
   * inició el asesor desde la bandeja abierta.
   */
  async sincronizarAsesor(
    asesorId: string,
    nombreAsesor: string,
    _notificar = false,
  ): Promise<ResultadoSync> {
    // El frontend sincroniza al abrir la bandeja y cada 60 s. Sin este corte,
    // un 403 por falta de permiso se convertiria en 60 peticiones por minuto a
    // una API que ya esta devolviendo error, y se comeria la cuota de Graph.
    // El boton manual si llega aqui con el cooldown reiniciado desde el
    // controller, asi que el asesor puede forzar el reintento.
    if (this.deshabilitado) {
      this.logger.debug(
        `Sync omitido para "${nombreAsesor}": el permiso sigue sin conceder.`,
      );
      return this.resultadoVacio(nombreAsesor);
    }

    const enCurso = this.syncEnCurso.get(asesorId);
    if (enCurso) {
      // Todas las sincronizaciones persistentes registran el correo nuevo,
      // también las que se disparan desde la bandeja abierta.
      this.logger.debug(`Sync ya en curso para ${nombreAsesor}; se reutiliza.`);
      return enCurso;
    }

    const promesa = this.ejecutarSyncAsesor(asesorId, nombreAsesor).finally(() => {
      this.syncEnCurso.delete(asesorId);
    });
    this.syncEnCurso.set(asesorId, promesa);
    return promesa;
  }

  /**
   * Pasada que no llego a Graph. Se devuelve con la misma forma que una pasada
   * real para que quien la llame no tenga que distinguir dos casos.
   */
  private resultadoVacio(carpetaNombre: string): ResultadoSync {
    return {
      carpetaId: '',
      carpetaNombre,
      nuevos: 0,
      actualizados: 0,
      eliminados: 0,
      resincronizado: false,
      huboImportacionInicial: false,
      idUltimoNuevo: null,
      idsNuevos: [],
      hayNoLeidos: false,
      asuntoUltimoNuevo: null,
    };
  }

  private async ejecutarSyncAsesor(
    asesorId: string,
    nombreAsesor: string,
  ): Promise<ResultadoSync> {
    await this.ensureSchema();
    const { folderId, parentFolderId, displayName } =
      await this.carpetas.carpetaDelAsesor(nombreAsesor);
    const buzon = await this.carpetas.buzonId();
    const r = await this.procesarDelta({
      buzon,
      folderId,
      parentFolderId,
      displayName,
      asesorId,
      nombreAsesor,
      resincronizado: false,
    });

    await this.entregarAvisosPendientes(asesorId);

    // El evento va siempre que cambio algo: es lo que arregla el atraso del
    // estado de lectura que el asesor cambia en Outlook. La campana es otra
    // historia y solo suena con correo nuevo.
    if (r.nuevos > 0 || r.actualizados > 0 || r.eliminados > 0) {
      this.gateway.enviarCambio(asesorId, {
        nuevos: r.nuevos,
        actualizados: r.actualizados,
        eliminados: r.eliminados,
        carpeta: r.carpetaNombre,
        hayNoLeidos: r.hayNoLeidos,
      });
    }

    return r;
  }

  private async estadoCarpeta(
    buzon: string,
    folderId: string,
  ): Promise<CorreoCarpetaSync | null> {
    return this.carpetaRepo.findOne({ where: { buzon, folderId } });
  }

  private async guardarEstado(
    buzon: string,
    folderId: string,
    deltaLink: string | null | undefined,
    datos: {
      parentFolderId?: string;
      displayName?: string;
      error?: string | null;
      importadoCompleto?: boolean;
    },
  ): Promise<void> {
    const existente = await this.estadoCarpeta(buzon, folderId);
    const fila =
      existente ??
      this.carpetaRepo.create({ buzon, folderId, parentFolderId: datos.parentFolderId ?? null });
    // Omitir el parametro deja el token intacto; pasar null lo borra a proposito.
    if (deltaLink !== undefined) fila.deltaLink = deltaLink;
    fila.lastSyncAt = new Date();
    fila.lastError = datos.error ?? null;
    if (datos.parentFolderId) fila.parentFolderId = datos.parentFolderId;
    if (datos.displayName) fila.folderDisplayName = datos.displayName;
    if (datos.importadoCompleto !== undefined) fila.importadoCompleto = datos.importadoCompleto;
    await this.carpetaRepo.save(fila);
  }

  /**
   * Recorre la carpeta completa con el listado normal de Graph (que pagina con
   * skipToken hasta el final) y guarda cada mensaje.
   *
   * Esto complementaria a `messages/delta`, no lo reemplaza: el delta es lo que
   * mantiene el espejo al dia sin releer todo, pero su primera pasada solo trae
   * los mensajes recientes y despues entrega un deltaLink, de modo que el correo
   * viejo que quede por detras nunca vuelve a aparecer. El listado si lo trae.
   */
  private async importarCarpetaCompleta(ctx: {
    buzon: string;
    folderId: string;
    asesorId: string;
    displayName: string;
  }): Promise<{ nuevos: number; actualizados: number; completo: boolean }> {
    let url: string | null =
      `/users/${ctx.buzon}/mailFolders/${encodeURIComponent(ctx.folderId)}/messages` +
      `?$select=${GRAPH_MESSAGE_SELECT}&$top=${TOP_LISTADO}&$orderby=receivedDateTime desc`;
    let nuevos = 0;
    let actualizados = 0;
    let paginas = 0;

    while (url && paginas < MAX_PAGINAS_DELTA) {
      paginas++;
      let page: { value?: GraphMessageListItem[]; '@odata.nextLink'?: string };
      try {
        page = await this.graph.get<typeof page>(url);
      } catch (err: any) {
        // Se conserva el deltaLink: la importacion parcial no debe costarle al
        // asesor los cambios incrementales de las proximas pasadas.
        await this.guardarEstado(ctx.buzon, ctx.folderId, undefined, {
          error: `No se pudo leer la carpeta completa: ${err?.message ?? err}`,
        });
        throw err;
      }

      for (const item of page.value ?? []) {
        const r = await this.upsertMensaje(item, {
          folderId: ctx.folderId,
          displayName: ctx.displayName,
          asesorId: ctx.asesorId,
        });
        if (r.estado === 'nuevo') nuevos++;
        else actualizados++;
      }

      url = page['@odata.nextLink'] ?? null;
    }

    const completo = !url;
    if (!completo) {
      this.logger.warn(
        `La carpeta "${ctx.folderId}" supera ${MAX_PAGINAS_DELTA * TOP_LISTADO} mensajes; ` +
          'solo se importo lo que permitia el tope de paginas.',
      );
    }
    await this.guardarEstado(ctx.buzon, ctx.folderId, undefined, { importadoCompleto: completo });
    this.logger.log(
      `Importacion completa de "${ctx.displayName}": ${nuevos} nuevos, ${actualizados} ` +
        `actualizados en ${paginas} pagina(s).`,
    );

    return { nuevos, actualizados, completo };
  }

  private async procesarDelta(ctx: {
    buzon: string;
    folderId: string;
    parentFolderId: string;
    displayName: string;
    asesorId: string;
    nombreAsesor: string;
    resincronizado: boolean;
  }): Promise<ResultadoSync> {
    const { buzon, folderId, asesorId, nombreAsesor } = ctx;
    const estado = await this.estadoCarpeta(buzon, folderId);

    // Primera vez (o tras un resync): se recorre la carpeta entera con el listado
    // normal, que si pagina hasta el final. Despues el delta solo trae cambios.
    let nuevos = 0;
    let actualizados = 0;
    // Si hubo que importar la carpeta entera, los correos guardados no son
    // "nuevos" para el asesor: ya los tenia en Outlook. Solo el delta posterior
    // genera aviso.
    const huboImportacionInicial = !estado?.importadoCompleto;
    if (huboImportacionInicial) {
      const completa = await this.importarCarpetaCompleta(ctx);
      nuevos += completa.nuevos;
      actualizados += completa.actualizados;
    }

    let url = estado?.deltaLink ?? null;
    if (!url) {
      url =
        `/users/${buzon}/mailFolders/${encodeURIComponent(folderId)}/messages/delta` +
        `?$select=${GRAPH_MESSAGE_SELECT}&$top=50&$orderby=receivedDateTime desc`;
    }

    let eliminados = 0;
    let paginas = 0;
    // Datos del correo nuevo mas reciente de ESTA pasada, para el aviso. Se
    // inicializan aqui (no antes del bucle) a proposito: solo cuentan los
    // cambios que trajo el delta, no los de la importacion completa.
    let idUltimoNuevo: string | null = null;
    const idsNuevos: string[] = [];
    const avisosNuevos: Array<{
      id: string;
      asunto: string | null;
      remitenteNombre: string | null;
      remitenteEmail: string | null;
      vistaPrevia: string | null;
      hayNoLeidos: boolean;
    }> = [];
    let tsUltimoNuevo = -1;
    let hayNoLeidos = false;
    let asuntoUltimoNuevo: string | null = null;

    while (url && paginas < MAX_PAGINAS_DELTA) {
      paginas++;
      let page: { value?: GraphMessageListItem[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string };
      try {
        page = await this.graph.get<typeof page>(url);
      } catch (err: any) {
        // MicrosoftGraphMailService convierte el 410 en DeltaLinkExpiradoError,
        // por eso se mira tambien el error directo y no solo la respuesta axios.
        const status = err?.response?.status ?? err?.status;
        const code = err?.response?.data?.error?.code ?? err?.code;

        // Token delta caducado: se borra el enlace guardado y se rehace la
        // sincronizacion completa de la carpeta.
        if (status === 410 || code === 'SyncStateNotFound') {
          if (ctx.resincronizado) {
            // Ya veniamos de un resync: seguir reintentando seria un bucle.
            this.logger.error(
              `El delta de "${ctx.displayName}" sigue caducado tras resincronizar; ` +
                'se abandona hasta la proxima pasada.',
            );
            throw err;
          }
          this.logger.warn(
            `Delta token vencido para "${ctx.displayName}"; se resincroniza la carpeta completa.`,
          );
          // Imprescindible limpiar el deltaLink: si se deja, el reintento volveria
          // a pedir el mismo token caducado y no terminaria nunca.
          await this.guardarEstado(buzon, folderId, null, {
            parentFolderId: ctx.parentFolderId,
            displayName: ctx.displayName,
            // El token caduco, asi que no sabemos cuanto tiempo lleva el espejo
            // desfasado: se marca la carpeta para volver a importarla entera.
            importadoCompleto: false,
          });
          return this.procesarDelta({ ...ctx, resincronizado: true });
        }
        // La carpeta cambio de id: se invalida la cache y se reintenta una vez.
        if (status === 404) {
          this.carpetas.invalidar(nombreAsesor);
          throw new NotFoundException(
            `La carpeta "${ctx.displayName}" ya no existe en Outlook o fue recreada. ` +
              'Se reintentara con el id actualizado.',
          );
        }
        throw err;
      }

      for (const item of page.value ?? []) {
        if (item['@removed']) {
          // Borrado o movido dentro del buzon: se retira del espejo.
          const res = await this.mensajeRepo.delete({
            graphMessageId: item.id,
            asesorId,
          });
          eliminados += res.affected ?? 0;
          continue;
        }
        const r = await this.upsertMensaje(item, ctx);
        if (r.estado === 'nuevo') {
          nuevos++;
          idsNuevos.push(r.id);
          avisosNuevos.push({
            id: r.id,
            asunto: item.subject ?? null,
            remitenteNombre: item.from?.emailAddress?.name ?? null,
            remitenteEmail: item.from?.emailAddress?.address ?? null,
            vistaPrevia: item.bodyPreview ?? null,
            hayNoLeidos: !item.isRead,
          });
          // El delta SI es la senal de "llego algo": se guardan los datos para
          // el aviso y el enlace profundo. La importacion completa no aporta
          // ninguno, por eso estos contadores arrancan aqui y no antes.
          // Se usa el id LOCAL, no el de Graph: el de Graph es base64 y no cabe
          // en la columna varchar(36) de la notificacion.
          const recibido = item.receivedDateTime ? new Date(item.receivedDateTime).getTime() : 0;
          if (idUltimoNuevo === null || recibido > tsUltimoNuevo) {
            idUltimoNuevo = r.id;
            tsUltimoNuevo = recibido;
            asuntoUltimoNuevo = item.subject ?? null;
          }
          if (!item.isRead) hayNoLeidos = true;
        } else actualizados++;
      }

      if (page['@odata.deltaLink']) {
        if (!huboImportacionInicial && avisosNuevos.length > 0) {
          for (const aviso of avisosNuevos) {
            await this.encolarAvisoCorreo(asesorId, {
              ...aviso,
              carpeta: ctx.displayName,
            });
          }
        }
        await this.guardarEstado(buzon, folderId, page['@odata.deltaLink'], {
          parentFolderId: ctx.parentFolderId,
          displayName: ctx.displayName,
        });
        url = null;
      } else {
        url = page['@odata.nextLink'] ?? null;
      }
    }

    if (url) {
      this.logger.warn(
        `Se alcanzo el tope de ${MAX_PAGINAS_DELTA} paginas en "${ctx.displayName}"; ` +
          'la proxima pasada continuara desde el enlace guardado.',
      );
    }

    return {
      carpetaId: folderId,
      carpetaNombre: ctx.displayName,
      nuevos,
      actualizados,
      eliminados,
      resincronizado: ctx.resincronizado,
      huboImportacionInicial,
      idUltimoNuevo,
      idsNuevos,
      hayNoLeidos,
      asuntoUltimoNuevo,
    };
  }

  private async encolarAvisoCorreo(
    recipientId: string,
    aviso: {
      id: string | null;
      carpeta: string;
      asunto: string | null;
      remitenteNombre: string | null;
      remitenteEmail: string | null;
      vistaPrevia: string | null;
      hayNoLeidos: boolean;
    },
  ): Promise<void> {
    if (!aviso.id) return;
    await this.dataSource.query(
      `INSERT INTO correo_notification_outbox
         (recipient_id, correo_mensaje_id, correo_mensaje_ids, cantidad, carpeta, asunto,
          remitente_nombre, remitente_email, vista_previa, hay_no_leidos)
       VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (correo_mensaje_id) DO NOTHING`,
      [
        recipientId,
        aviso.id,
        [aviso.id],
        1,
        aviso.carpeta,
        aviso.asunto,
        aviso.remitenteNombre,
        aviso.remitenteEmail,
        aviso.vistaPrevia,
        aviso.hayNoLeidos,
      ],
    );
  }

  /** Entrega con reintento: las filas solo se confirman despues de guardar el aviso. */
  private async entregarAvisosPendientes(asesorId: string): Promise<void> {
    let pendientes: Array<{
      id: string;
      correo_mensaje_id: string;
      correo_mensaje_ids: string[];
      cantidad: number;
      carpeta: string;
      asunto: string | null;
      remitente_nombre: string | null;
      remitente_email: string | null;
      vista_previa: string | null;
      hay_no_leidos: boolean;
    }>;
    try {
      pendientes = await this.dataSource.query(
        `SELECT id, correo_mensaje_id, correo_mensaje_ids, cantidad, carpeta, asunto,
                remitente_nombre, remitente_email, vista_previa, hay_no_leidos
         FROM correo_notification_outbox
         WHERE recipient_id = $1 AND entregado_at IS NULL
         ORDER BY creado_at ASC
         LIMIT 50`,
        [asesorId],
      );
    } catch (err: any) {
      this.logger.warn(`No se pudieron revisar avisos pendientes de correo: ${err?.message ?? err}`);
      return;
    }

    for (const fila of pendientes ?? []) {
      try {
        // Las filas antiguas del outbox pueden seguir conteniendo una tanda.
        // También se desglosan aquí para que cada correo produzca su propio aviso.
        const idsFila = Array.isArray(fila.correo_mensaje_ids)
          ? fila.correo_mensaje_ids.filter((id): id is string => typeof id === 'string' && !!id)
          : [];
        const correoIds = [...new Set(idsFila.length ? idsFila : [fila.correo_mensaje_id])];
        for (const correoId of correoIds) {
          const remitenteNombre = fila.remitente_nombre?.trim() || null;
          const remitenteEmail = fila.remitente_email?.trim() || null;
          const remitente = remitenteNombre && remitenteEmail
            ? `${remitenteNombre} <${remitenteEmail}>`
            : remitenteNombre || remitenteEmail;
          const asunto = correoId === fila.correo_mensaje_id ? fila.asunto?.trim() : null;
          const titulo = (asunto || 'Sin asunto').slice(0, 255);
          await this.notificaciones.create({
            recipientId: asesorId,
            type: 'correo_nuevo',
            title: titulo,
            message: remitente ? `De: ${remitente}` : `Nuevo correo en ${fila.carpeta}.`,
            entityType: 'correo',
            entityId: correoId,
            meta: {
              carpeta: fila.carpeta,
              nuevos: 1,
              correoIds: [correoId],
              hayNoLeidos: fila.hay_no_leidos,
              asunto: asunto || null,
              remitenteNombre,
              remitenteEmail,
              vistaPrevia: correoId === fila.correo_mensaje_id ? fila.vista_previa : null,
            },
          });
        }
        await this.dataSource.query(
          `UPDATE correo_notification_outbox SET entregado_at = now() WHERE id = $1 AND entregado_at IS NULL`,
          [fila.id],
        );
      } catch (err: any) {
        // Se conserva pendiente; la próxima sincronización volverá a intentarlo.
        this.logger.warn(`Aviso de correo pendiente para ${asesorId}: ${err?.message ?? err}`);
      }
    }
  }

  /**
   * Insercion o actualizacion de un mensaje. La clave es graphMessageId, que
   * tiene indice unico: es la garantia de no volver a procesar un correo.
   */
  private async upsertMensaje(
    item: GraphMessageListItem,
    ctx: { folderId: string; displayName: string; asesorId: string },
  ): Promise<{ estado: 'nuevo' | 'actualizado'; id: string }> {
    const existente = await this.mensajeRepo.findOne({
      where: { graphMessageId: item.id },
    });

    // Graph envuelve remitente y destinatarios en `emailAddress`: leerlos planos
    // devolvia siempre undefined y todos los correos quedaban "Sin remitente".
    const remitente = item.from?.emailAddress;
    const direcciones = (lista: GraphRecipient[] | undefined): string[] =>
      (lista ?? [])
        .map((r) => r?.emailAddress?.address ?? '')
        .filter((a) => a.length > 0);

    const datos = {
      subject: item.subject ?? null,
      fromNombre: remitente?.name ?? remitente?.address ?? null,
      fromEmail: remitente?.address ?? null,
      para: direcciones(item.toRecipients),
      cc: direcciones(item.ccRecipients),
      replyTo: direcciones(item.replyTo),
      categorias: (item.categories ?? []).filter((c) => typeof c === 'string' && c.length > 0),
      bodyPreview: item.bodyPreview ?? null,
      isRead: !!item.isRead,
      hasAttachments: !!item.hasAttachments,
      importance: item.importance ?? 'normal',
      internetMessageId: item.internetMessageId ?? null,
      conversationId: item.conversationId ?? null,
      receivedAt: item.receivedDateTime ? new Date(item.receivedDateTime) : null,
      sentAt: item.sentDateTime ? new Date(item.sentDateTime) : null,
    };

    if (existente) {
      // graphMessageId es unico en toda la tabla, asi que si el mensaje ya estaba
      // y ahora aparece en otra carpeta lo mas probable es que alguien lo movio
      // dentro del buzon. Sin reasignar el ambito, seguiria quedado accesible
      // para el asesor anterior y invisible para el nuevo.
      const ambitoCambio =
        existente.asesorId !== ctx.asesorId || existente.folderId !== ctx.folderId;
      if (ambitoCambio) {
        this.logger.debug(
          `El mensaje ${item.id} cambio de ambito ` +
            `(${existente.folderDisplayName} -> ${ctx.displayName}); se reasigna.`,
        );
      }
      await this.mensajeRepo.update(existente.id, {
        ...datos,
        folderId: ctx.folderId,
        folderDisplayName: ctx.displayName,
        asesorId: ctx.asesorId,
      });
      return { estado: 'actualizado', id: existente.id };
    }

    const guardado = await this.mensajeRepo.save(
      this.mensajeRepo.create({
        graphMessageId: item.id,
        folderId: ctx.folderId,
        folderDisplayName: ctx.displayName,
        asesorId: ctx.asesorId,
        origen: 'buzon' as CorreoOrigen,
        ...datos,
      }),
    );
    return { estado: 'nuevo', id: guardado.id };
  }

  /** Ultimo estado de todas las carpetas sincronizadas. Alimenta /correos/estado. */
  async estadosRegistrados(): Promise<CorreoCarpetaSync[]> {
    if (!this.esquemaListo) return [];
    return this.carpetaRepo.find({ order: { lastSyncAt: 'DESC' }, take: 50 });
  }

  /** Marca que el correo lo movio la aplicacion, no que llego por el buzon. */
  async marcarOrigenInterno(graphMessageIds: string[]): Promise<number> {
    if (!graphMessageIds.length) return 0;
    const res = await this.mensajeRepo
      .createQueryBuilder()
      .update(CorreoMensaje)
      .set({ origen: 'movido_interno' })
      .where('graph_message_id IN (:...ids)', { ids: graphMessageIds })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * Fuerza un reintento inmediato. Lo usa el endpoint de sincronizacion manual
   * para que el asesor no espere al proximo ciclo tras conceder el permiso.
   */
  reiniciarPermisos(): void {
    this.deshabilitadoHasta = 0;
  }

  /**
   * `true` mientras siga el cooldown tras un 403. No es un cierre permanente: al
   * vencer el cooldown se vuelve a preguntar a Graph, de modo que conceder el
   * permiso en Entra ID se recupera solo, sin reiniciar el backend.
   */
  get deshabilitado(): boolean {
    return Date.now() < this.deshabilitadoHasta;
  }
}
