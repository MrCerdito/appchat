import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Stream } from 'stream';
import { createHmac, timingSafeEqual } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { MicrosoftGraphMailService } from './microsoft-graph-mail.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { CorreosSyncService } from './correos-sync.service';
import { CorreoMensaje } from './entities/correo-mensaje.entity';
import { CorreoAdjunto } from './entities/correo-adjunto.entity';
import { GraphAttachment, GraphCollection, GraphMessage } from './graph.types';

/** Tope del cuerpo: Graph admite hasta ~1 MB y algunos remitentes inflan el HTML. */
const LIMITE_CUERPO = 1_000_000;

/** Imagenes embebidas que se resuelven por URL firmada (ver `imagenesInline`). */
const MAX_IMAGENES_INLINE = 12;
const MAX_BYTES_IMAGEN = 2_500_000;
const MAX_BYTES_TOTAL_IMAGENES = 10_000_000;
const TTL_FIRMA_MS = 900_000;
const MAX_BYTES_FIRMA = 32;

/** Solo raster: un SVG embebido puede llevar script. */
const TIPOS_RASTER = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

/**
 * `cid:` de los HTML de correo. El cuerpo se recorre con esta expresion antes de
 * sanear, asi que tambien cubre `cid:` dentro de estilos inline
 * (`background: url(cid:...)`).
 *
 * El `\b` inicial evita false positives en texto normal, como el `cid:` de
 * "ORCID:".
 */
const RE_CID = /\bcid:([A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.@]+)/gi;

/** Copia sin la `g`: la global es stateful y `test` deixaria `lastIndex` sucio. */
const RE_BUSQUEDA_CID = /\bcid:/i;

/** Llenas simultaneas a Graph para imagenes inline: no satura el buzon. */
const MAX_LLAMADAS_GRAPH_INLINE = 4;

/**
 * Colombia no aplica horario de verano, asi que el desfase con UTC es fijo.
 * Los filtros de fecha del lateral usan dias civiles de Bogota, no de UTC: si
 * no, a las 8 de la manana un correo "de hoy" caeria dentro del filtro de ayer.
 */
const TZ_BOGOTA_MIN = -300;

/** Presets de fecha del lateral de filtros. */
export type PresetFechaCorreo = 'hoy' | 'ayer' | '7d';

export interface CategoriaConTotal {
  categoria: string;
  total: number;
}

/** Filtros del lateral. Todos opcionales: sin filtros devuelve la carpeta entera. */
export interface FiltrosBandeja {
  folderId?: string;
  limite?: number;
  offset?: number;
  soloNoLeidos?: boolean;
  /** Texto libre: asunto, remitente, destinatario o vista previa. */
  buscar?: string;
  /** Categoria exacta de Outlook. Ignorada si `sinCategoria` va activo. */
  categoria?: string;
  /** Busca los correos que todavia no tienen ninguna categoria. */
  sinCategoria?: boolean;
  preset?: PresetFechaCorreo;
  /** Rango manual `YYYY-MM-DD`, en hora de Bogota. Necesario `desde` o `hasta`. */
  desde?: string;
  hasta?: string;
}

export interface MensajeListado {
  id: string;
  graphMessageId: string;
  subject: string | null;
  fromNombre: string | null;
  fromEmail: string | null;
  para: string[];
  cc: string[];
  /** Categorias de Outlook. Vacio = el correo aun no esta clasificado. */
  categorias: string[];
  bodyPreview: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  importance: string;
  conversationId: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  origen: string;
  adjuntos: number;
}

/**
 * Lectura de la bandeja del asesor.
 *
 * La lista se sirve desde el espejo local (rapido, sin llamar a Graph) y el
 * cuerpo HTML se pide a Microsoft solo cuando el usuario abre un mensaje, ya
 * sanitizado. Asi el contenido de terceros nunca queda almacenado en la base de
 * datos y nunca se renderiza crudo en el navegador.
 */
@Injectable()
export class CorreosService {
  private readonly logger = new Logger(CorreosService.name);

  /**
   * Firma de las URLs de imagenes inline. Reutiliza `JWT_SECRET` con un
   * prefijo de dominio propio para no mezclarse con los tokens de sesion.
   */
  private readonly secretoFirma: string;

  /**
   * Validaciones de adjuntos inline en vuelo. Si el navegador pide dos veces la
   * misma imagen a la vez (navegadores duplican peticiones de `img`), se hace
   * una sola llamada a Graph. El registro se borra al resolver: no es cache.
   */
  private readonly validacionesEnVuelo = new Map<string, Promise<GraphAttachment>>();

  /** Semaforo de llamadas simultaneas a Graph para imagenes inline. */
  private activasInline = 0;
  private readonly colaInline: Array<() => void> = [];

  /**
   * Allow-list de etiquetas y atributos para el HTML de los correos.
   * `body.content` viene de remitentes externos, asi que inyectarlo con
   * innerHTML sin filtrar seria un XSSStored. Se permiten estilos inline porque
   * sin ellos la maquetacion de los correos se rompe, y se neutralizan los
   * data: URI que no sean imagenes raster, porque un SVG embebido puede llevar
   * script.
   */
  private readonly opcionesSanitize: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'span',
      'div', 'p', 'br', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2',
      'h3', 'h4', 'hr', 'center', 'pre', 'code', 'figure', 'figcaption',
    ]),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'title', 'loading', 'decoding'],
      '*': ['style', 'class', 'align', 'valign', 'bgcolor', 'border'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    // Los enlaces abren en pestana nueva sin acceso a la ventana origen.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
      img: (tagName: string, attribs: Record<string, string>) => {
        const src = attribs.src ?? '';
        const esImagenRaster = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src);
        if (src.startsWith('data:') && !esImagenRaster) delete attribs.src;
        // Las imagenes de un correo largo (logos, firmas al pie) casi siempre
        // estan fuera de pantalla: con carga diferida el navegador no las pide
        // hasta que el usuario scrollea, asi que no llegan al servidor.
        if (/^https?:/i.test(src)) {
          attribs.loading ??= 'lazy';
          attribs.decoding ??= 'async';
        }
        return { tagName, attribs };
      },
    },
  };

  constructor(
    @InjectRepository(CorreoMensaje)
    private readonly mensajeRepo: Repository<CorreoMensaje>,
    @InjectRepository(CorreoAdjunto)
    private readonly adjuntoRepo: Repository<CorreoAdjunto>,
    private readonly graph: MicrosoftGraphMailService,
    private readonly carpetas: CorreosCarpetaService,
    private readonly sync: CorreosSyncService,
    private readonly config: ConfigService,
  ) {
    this.secretoFirma = this.config.get<string>('JWT_SECRET') ?? '';
  }

  // ── Listado desde el espejo local ────────────────────────────

  /**
   * Bandeja del asesor. `folderId` opcional: si no se envia, se resuelve la
   * carpeta del asesor por nombre contra el buzon.
   */
  async listar(
    asesorId: string,
    nombreAsesor: string,
    opciones: FiltrosBandeja = {},
  ): Promise<{
    mensajes: MensajeListado[];
    total: number;
    totalCarpeta: number;
    noLeidosTotal: number;
    carpetaNombre: string;
    folderId: string;
    categoriasDisponibles: CategoriaConTotal[];
  }> {
    // La carpeta SIEMPRE se resuelve por nombre del asesor. El folderId que
    // manda el cliente solo se usa como pista, y se descarta si no coincide:
    // si se aceptara a ciegas, un asesor podria apuntar a otra carpeta del buzon.
    // Coste ~0 porque CorreosCarpetaService cachea 10 minutos.
    const resuelta = await this.carpetas.carpetaDelAsesor(nombreAsesor);
    const folderId = resuelta.folderId;
    const carpetaNombre = resuelta.displayName;

    if (opciones.folderId && opciones.folderId !== folderId) {
      this.logger.debug(
        `folderId "${opciones.folderId}" ignorado: la carpeta del asesor es "${carpetaNombre}" ` +
          `(${folderId}). Probablemente la carpeta fue recreada en Outlook.`,
      );
    }

const qb = this.mensajeRepo
      .createQueryBuilder('m')
      .where('m.asesor_id = :asesorId AND m.folder_id = :folderId', { asesorId, folderId })
      // Sin join ni COUNT: el conteo de adjuntos va aparte. Con el join, el
      // GROUP BY y los alias de columna, `getRawAndEntities()` devolvia las
      // entidades vacias (la consulta si traia filas) y la bandeja salia en
      // blanco aunque el total fuera correcto.
      .orderBy('m.received_at', 'DESC', 'NULLS LAST')
      .addOrderBy('m.id', 'DESC')
      .limit(Math.min(opciones.limite ?? 50, 200))
      .offset(Math.max(opciones.offset ?? 0, 0));

    if (opciones.soloNoLeidos) qb.andWhere('m.is_read = false');
    this.aplicarFiltros(qb, opciones);

    const mensajes = await qb.getMany();
    const adjuntosPorMensaje = await this.contarAdjuntos(mensajes.map((m) => m.id));

    // `total` respeta TODOS los filtros (incluidos texto y fecha) para que
    // "cargar mas" no prometa mensajes que el filtro excluye. `totalCarpeta` y
    // `noLeidosTotal` los ignoran a proposito: alimentan el boton "ver todos" y
    // el contador de no leidos, que deben decir cuantos hay de verdad.
    const qbConteo = this.mensajeRepo
      .createQueryBuilder('m')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE m.is_read = false)', 'noLeidos')
      .where('m.asesor_id = :asesorId AND m.folder_id = :folderId', { asesorId, folderId });
    if (opciones.soloNoLeidos) qbConteo.andWhere('m.is_read = false');
    this.aplicarFiltros(qbConteo, opciones);

    const conteos = await qbConteo.getRawOne<{ total: string; noLeidos: string }>();

    const totalCarpeta = await this.contarEnCarpeta(asesorId, folderId);
    const noLeidosTotal = Number(conteos?.noLeidos ?? 0);
    const total = Number(conteos?.total ?? 0);

    return {
      mensajes: mensajes.map((e) => this.aListado(e, adjuntosPorMensaje.get(e.id) ?? 0)),
      total,
      totalCarpeta,
      noLeidosTotal,
      carpetaNombre,
      folderId,
      categoriasDisponibles: await this.categoriasDeCarpeta(asesorId, folderId, opciones),
    };
  }

  /** Total sin ningun filtro: lo que hay de verdad en la carpeta. */
  private async contarEnCarpeta(asesorId: string, folderId: string): Promise<number> {
    const fila = await this.mensajeRepo
      .createQueryBuilder('m')
      .select('COUNT(*)', 'total')
      .where('m.asesor_id = :asesorId AND m.folder_id = :folderId', { asesorId, folderId })
      .getRawOne<{ total: string }>();
    return Number(fila?.total ?? 0);
  }

  /**
   * Aplica al query builder los filtros del lateral (texto, categoria y rango
   * de fechas). Se reutiliza en el listado y en el conteo para que `total`
   * nunca se contradiga con lo que se ve en pantalla.
   */
  private aplicarFiltros(
    qb: SelectQueryBuilder<CorreoMensaje>,
    opciones: FiltrosBandeja,
  ): void {
    const texto = opciones.buscar?.trim();
    if (texto) {
      // Se escapan `%`, `_` y `\` para que el usuario pueda buscar literalmente
      // un "100%" sin que la consulta se convierta en un comodin global.
      const patron = `%${this.escaparLike(texto)}%`;
      qb.andWhere(
        `(m.subject ILIKE :patron ESCAPE '\\'` +
          ` OR m.from_nombre ILIKE :patron ESCAPE '\\'` +
          ` OR m.from_email ILIKE :patron ESCAPE '\\'` +
          ` OR m.body_preview ILIKE :patron ESCAPE '\\'` +
          // `para` y `cc` son simple-json: se comparan como texto, que es
          // suficiente para buscar por destinatario.
          ` OR m.para::text ILIKE :patron ESCAPE '\\'` +
          ` OR m.cc::text ILIKE :patron ESCAPE '\\')`,
        { patron },
      );
    }

    if (opciones.sinCategoria) {
      // simple-json guarda `null` como el texto "null" y un arreglo vacio como
      // "[]": los tres casos son "sin categoria".
      qb.andWhere(`(m.categorias IS NULL OR m.categorias IN ('[]', 'null'))`);
    } else if (opciones.categoria) {
      // La columna es texto con un arreglo JSON, asi que se castea a jsonb y se
      // usa `@>`: compara el arreglo completo y no por subcadena, de modo que
      // "CASO" no engancha con "CASO OMISO".
      qb.andWhere(`COALESCE(NULLIF(m.categorias, 'null'), '[]')::jsonb @> :categoria`, {
        categoria: JSON.stringify([opciones.categoria]),
      });
    }

    const rango = this.rangoFechas(opciones);
    if (rango.desde) qb.andWhere('m.received_at >= :desde', { desde: rango.desde });
    if (rango.hasta) qb.andWhere('m.received_at <= :hasta', { hasta: rango.hasta });
  }

  /** Escapa los comodines de LIKE/ILIKE para que la busqueda sea literal. */
  private escaparLike(texto: string): string {
    return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
  }

  /**
   * Traduce el preset o el rango manual a instantes UTC, respetando el dia
   * civil de Bogota. Los limites son siempre dados: para "hoy" se usa desde las
   * 00:00 de hoy hasta las 23:59:59.999 de hoy.
   */
  private rangoFechas(opciones: FiltrosBandeja): { desde?: Date; hasta?: Date } {
    const ahora = new Date();
    if (opciones.preset === 'hoy') {
      const desde = this.inicioDiaCivil(ahora, 0);
      return { desde, hasta: this.finDiaCivil(desde) };
    }
    if (opciones.preset === 'ayer') {
      const desde = this.inicioDiaCivil(ahora, 1);
      return { desde, hasta: this.finDiaCivil(desde) };
    }
    if (opciones.preset === '7d') {
      // 7 dias naturales contando hoy: de hace 6 dias a hoy, ambos incluidos.
      const desde = this.inicioDiaCivil(ahora, 6);
      return { desde, hasta: this.finDiaCivil(this.inicioDiaCivil(ahora, 0)) };
    }
    const desde = opciones.desde ? this.desdeIso(opciones.desde) : undefined;
    const hasta = opciones.hasta ? this.finIso(opciones.hasta) : undefined;
    return { desde, hasta };
  }

  /** Instante UTC de las 00:00 del dia civil indicado, restando `diasAtras`. */
  private inicioDiaCivil(referencia: Date, diasAtras: number): Date {
    // Se pasa a hora de Bogota, se toma el dia calendario ahi y se vuelve a UTC.
    const desplazado = new Date(referencia.getTime() + TZ_BOGOTA_MIN * 60_000);
    const inicio = Date.UTC(
      desplazado.getUTCFullYear(),
      desplazado.getUTCMonth(),
      desplazado.getUTCDate() - diasAtras,
      0,
      0,
      0,
      0,
    );
    return new Date(inicio - TZ_BOGOTA_MIN * 60_000);
  }

  /** Ultimo instante del dia que empieza en `inicio` (23:59:59.999). */
  private finDiaCivil(inicio: Date): Date {
    return new Date(inicio.getTime() + 86_399_999);
  }

  /** `YYYY-MM-DD` en hora de Bogota -> 00:00:00 UTC de ese dia. */
  private desdeIso(iso: string): Date | undefined {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!partes) return undefined;
    const [, a, m, d] = partes;
    return new Date(Date.UTC(+a, +m - 1, +d, 0, 0, 0, 0) - TZ_BOGOTA_MIN * 60_000);
  }

  /** `YYYY-MM-DD` en hora de Bogota -> 23:59:59.999 UTC: el rango es inclusivo. */
  private finIso(iso: string): Date | undefined {
    const desde = this.desdeIso(iso);
    return desde ? this.finDiaCivil(desde) : undefined;
  }

  /**
   * Categorias de la carpeta con su conteo, para pintar el lateral. Ignora el
   * filtro de texto y fecha para que los numeros no se muevan mientras el
   * usuario navega, pero si el de "sin categoria", que si es una opcion del
   * propio filtro.
   */
  private async categoriasDeCarpeta(
    asesorId: string,
    folderId: string,
    opciones: FiltrosBandeja,
  ): Promise<CategoriaConTotal[]> {
    const filas = await this.mensajeRepo
      .createQueryBuilder('m')
      .select('m.categorias', 'categorias')
      .addSelect('COUNT(*)', 'total')
      .where('m.asesor_id = :asesorId AND m.folder_id = :folderId', { asesorId, folderId })
      .groupBy('m.categorias')
      .getRawMany<{ categorias: string | null; total: string }>();

    const conteo = new Map<string, number>();
    for (const fila of filas) {
      const lista = this.parsearCategorias(fila.categorias);
      if (!lista.length) continue;
      for (const cat of lista) conteo.set(cat, (conteo.get(cat) ?? 0) + Number(fila.total));
    }

    // De mas a menos frecuente, y a igual frecuencia por nombre: el orden
    // estable evita que las categorias salten de sitio entre recargas.
    return [...conteo.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, 'es'));
  }

  /** Convierte el texto de la columna simple-json en arreglo de categorias. */
  private parsearCategorias(valor: string | null): string[] {
    if (!valor) return [];
    try {
      const lista: unknown = JSON.parse(valor);
      return Array.isArray(lista) ? lista.filter((c): c is string => typeof c === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Numero de adjuntos por mensaje para una pagina, en una sola consulta. */
  private async contarAdjuntos(mensajeIds: string[]): Promise<Map<string, number>> {
    if (!mensajeIds.length) return new Map();
    const filas = await this.adjuntoRepo
      .createQueryBuilder('a')
      .select('a.mensaje_id', 'mensajeId')
      .addSelect('COUNT(a.id)', 'total')
      .where('a.mensaje_id IN (:...ids)', { ids: mensajeIds })
      .groupBy('a.mensaje_id')
      .getRawMany<{ mensajeId: string; total: string }>();
    return new Map(filas.map((f) => [f.mensajeId, Number(f.total ?? 0)]));
  }

  private aListado(e: CorreoMensaje, adjuntos: number): MensajeListado {
    return {
      id: e.id,
      graphMessageId: e.graphMessageId,
      subject: e.subject,
      fromNombre: e.fromNombre,
      fromEmail: e.fromEmail,
      para: Array.isArray(e.para) ? e.para : [],
      cc: Array.isArray(e.cc) ? e.cc : [],
      categorias: Array.isArray(e.categorias) ? e.categorias : [],
      bodyPreview: e.bodyPreview,
      isRead: e.isRead,
      hasAttachments: e.hasAttachments,
      importance: e.importance,
      conversationId: e.conversationId,
      receivedAt: e.receivedAt ? new Date(e.receivedAt).toISOString() : null,
      sentAt: e.sentAt ? new Date(e.sentAt).toISOString() : null,
      origen: e.origen,
      adjuntos,
    };
  }

  /**
   * Devuelve un mensaje solo si pertenece al asesor indicado. Es el unico punto
   * de acceso a un correo concreto, y por eso filtra SIEMPO por asesorId: es lo
   * que impide que un asesor lea, mueva o copie el correo de otro aunque conozca
   * el id.
   */
  async obtenerMensajePropio(id: string, asesorId: string): Promise<CorreoMensaje> {
    const mensaje = await this.mensajeRepo.findOne({ where: { id } });
    if (!mensaje || mensaje.asesorId !== asesorId) {
      throw new NotFoundException('Correo no encontrado.');
    }
    return mensaje;
  }

  // ── Cuerpo bajo demanda (s sanitizado) ───────────────────────

  /**
   * Devuelve el cuerpo ya limpio. El HTML crudo de Graph no sale nunca del
   * backend: se sanitiza aqui y en el frontend va dentro de un iframe sandbox
   * como segunda barrera.
   *
   * Las imagenes embebidas (`cid:`) se reescriben como URL firmada ANTES de
   * sanear, porque el sanitizer quita cualquier `src` con un esquema no
   * permitido. Asi el correo llega como texto y cada imagen se descarga solo si
   * el navegador decide mostrarla, sin guardar nada en disco ni en la base.
   */
  async cuerpo(
    id: string,
    asesorId: string,
    urlBase: string,
  ): Promise<{ html: string; truncado: boolean; mensaje: MensajeListado }> {
    const fila = await this.obtenerMensajePropio(id, asesorId);
    const buzon = await this.carpetas.buzonId();

    const data = await this.graph.get<GraphMessage>(
      `/users/${buzon}/messages/${encodeURIComponent(fila.graphMessageId)}` +
        '?$select=body,bodyPreview,subject,from,toRecipients,ccRecipients,' +
        'receivedDateTime,sentDateTime,isRead,hasAttachments,conversationId,importance',
    );

    const crudo = data.body?.content ?? '';
    const truncado = crudo.length > LIMITE_CUERPO;
    const recortado = truncado ? crudo.slice(0, LIMITE_CUERPO) : crudo;

    // Si el mensaje vino en texto plano, se escapa para no romper el iframe.
    const esHtml = (data.body?.contentType ?? 'html') === 'html';

    // La busqueda de `cid:` no consume la regex global, que es estadoful.
    let preparado = recortado;
    if (esHtml && RE_BUSQUEDA_CID.test(recortado)) {
      const mapa = await this.mapearInline(fila, buzon, urlBase);
      if (mapa.size > 0) preparado = this.reemplazarCid(recortado, mapa);
    }

    const html = esHtml
      ? sanitizeHtml(preparado, this.opcionesSanitize)
      : `<pre style="white-space:pre-wrap;font-family:inherit">${sanitizeHtml(
          preparado,
          { allowedTags: [], allowedAttributes: {} },
        )}</pre>`;

    return { html, truncado, mensaje: this.aListado(fila, 0) };
  }

  // ── Imagenes inline bajo demanda ──────────────────────────────

  /**
   * Mapa `contentId` -> URL firmada. Graph devuelve las imagenes embebidas como
   * adjuntos `fileAttachment` con `isInline: true` y `contentId`, que es
   * exactamente el token que aparece como `cid:<contentId>` en el HTML.
   *
   * Se filtra por tipo raster y por tamano para que un correo con un adjunto
   * enorme no convierta la respuesta del cuerpo en varios megabytes.
   *
   * `contentId` no se puede pedir pelado: pertenece al tipo derivado, asi que va
   * con el cast `microsoft.graph.fileAttachment/contentId`. Pedirlo sin cast (o
   * pedir `contentBytes`) hace que Graph responda 400.
   */
  private async mapearInline(
    fila: CorreoMensaje,
    buzon: string,
    urlBase: string,
  ): Promise<Map<string, string>> {
    if (!this.secretoFirma) {
      this.logger.warn('Sin JWT_SECRET: las imagenes inline de los correos no se pueden firmar.');
      return new Map();
    }

    let remotos: GraphAttachment[] = [];
    try {
      const data = await this.graph.get<GraphCollection<GraphAttachment>>(
        `/users/${buzon}/messages/${encodeURIComponent(fila.graphMessageId)}/attachments` +
          '?$select=id,contentType,size,isInline,microsoft.graph.fileAttachment/contentId',
      );
      remotos = data.value ?? [];
    } catch (err) {
      // Sin metadata el correo se sigue viendo, solo que sin imagenes.
      this.logger.warn(`No se pudieron listar las imagenes inline del correo ${fila.id}: ${err}`);
      return new Map();
    }

    const exp = Math.floor((Date.now() + TTL_FIRMA_MS) / 1000);
    const mapa = new Map<string, string>();
    let total = 0;

    for (const adj of remotos) {
      if (mapa.size >= MAX_IMAGENES_INLINE) break;
      const contentId = (adj.contentId ?? '').trim();
      if (!contentId || !adj.isInline) continue;
      if (!TIPOS_RASTER.test(adj.contentType ?? '')) continue;
      const tam = adj.size ?? 0;
      if (tam > MAX_BYTES_IMAGEN) continue;
      if (total + tam > MAX_BYTES_TOTAL_IMAGENES) continue;
      total += tam;

      const url =
        `${urlBase}/correos/mensajes/${encodeURIComponent(fila.id)}` +
        `/inline/${encodeURIComponent(adj.id)}` +
        `?e=${exp}&f=${this.firma(fila.id, adj.id, exp)}`;
      // El Content-ID MIME se compara sin distinguir mayusculas.
      mapa.set(contentId.toLowerCase(), url);
    }

    return mapa;
  }

  /** Sustituye cada `cid:referencia` por la URL firmada equivalente. */
  private reemplazarCid(html: string, mapa: Map<string, string>): string {
    return html.replace(RE_CID, (original, token: string) => mapa.get(token.toLowerCase()) ?? original);
  }

  /**
   * Firma de una imagen inline. Ata mensaje, adjunto y vencimiento, asi que
   * alterar cualquiera de los tres en la URL la invalida.
   */
  private firma(mensajeId: string, attachmentId: string, exp: number): string {
    return createHmac('sha256', this.secretoFirma)
      .update(`inline|${mensajeId}|${attachmentId}|${exp}`)
      .digest('hex')
      .slice(0, MAX_BYTES_FIRMA);
  }

  /** Compara firmas en tiempo constante. */
  private firmaValida(
    mensajeId: string,
    attachmentId: string,
    exp: number,
    recibida: string | undefined,
  ): boolean {
    if (!recibida || !/^[0-9a-f]+$/.test(recibida)) return false;
    const esperada = Buffer.from(this.firma(mensajeId, attachmentId, exp));
    const dada = Buffer.from(recibida);
    if (esperada.length !== dada.length) return false;
    return timingSafeEqual(esperada, dada);
  }

  /**
   * Entrega una imagen embebida. La credencial es la propia URL firmada: un
   * `<img>` dentro de un iframe con `sandbox` no puede enviar la cabecera
   * `Authorization`, y por eso esta ruta no pasa por el JWT.
   *
   * No se escribe nada en disco ni en la base: los bytes van de Graph a la
   * respuesta en streaming.
   */
  async imagenInline(
    mensajeId: string,
    attachmentId: string,
    exp: number,
    firma: string | undefined,
  ): Promise<{ stream: Stream; contentType: string }> {
    const ahora = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(exp) || exp <= ahora) {
      throw new ForbiddenException('El enlace de la imagen expiro. Recarga el correo.');
    }
    if (!this.firmaValida(mensajeId, attachmentId, exp, firma)) {
      throw new ForbiddenException('Enlace de imagen no valido.');
    }

    const fila = await this.mensajeRepo.findOne({ where: { id: mensajeId } });
    if (!fila) throw new NotFoundException('Correo no encontrado.');

    const buzon = await this.carpetas.buzonId();
    const adj = await this.validarAdjuntoInline(buzon, fila.graphMessageId, attachmentId);

    const stream = await this.graph.stream(
      `/users/${buzon}/messages/${encodeURIComponent(fila.graphMessageId)}` +
        `/attachments/${encodeURIComponent(attachmentId)}/$value`,
    );
    return { stream, contentType: (adj.contentType ?? 'image/png').toLowerCase() };
  }

  /**
   * Confirma contra Graph que el adjunto existe, es una imagen inline raster y
   * no excede el tope. Peticiones simultaneas del mismo adjunto comparten la
   * misma llamada, y todas pasan por el semaforo.
   */
  private validarAdjuntoInline(
    buzon: string,
    graphMessageId: string,
    attachmentId: string,
  ): Promise<GraphAttachment> {
    const clave = `${graphMessageId}|${attachmentId}`;
    const enVuelo = this.validacionesEnVuelo.get(clave);
    if (enVuelo) return enVuelo;

    const tarea = this.limitar(() =>
      this.graph.get<GraphAttachment>(
        `/users/${buzon}/messages/${encodeURIComponent(graphMessageId)}` +
          `/attachments/${encodeURIComponent(attachmentId)}` +
          '?$select=id,contentType,size,isInline',
      ),
    )
      .then((adj) => {
        if (!adj || !adj.isInline || !TIPOS_RASTER.test(adj.contentType ?? '')) {
          throw new NotFoundException('La imagen no existe en este correo.');
        }
        if ((adj.size ?? 0) > MAX_BYTES_IMAGEN) {
          throw new PayloadTooLargeException('La imagen supera el tamano permitido.');
        }
        return adj;
      })
      .finally(() => this.validacionesEnVuelo.delete(clave));

    this.validacionesEnVuelo.set(clave, tarea);
    return tarea;
  }

  /** Ejecuta `fn` cuando hay hueco en el semaforo de llamadas a Graph. */
  private limitar<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ejecutar = () => {
        this.activasInline++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.activasInline--;
            const siguiente = this.colaInline.shift();
            if (siguiente) siguiente();
          });
      };
      if (this.activasInline < MAX_LLAMADAS_GRAPH_INLINE) ejecutar();
      else this.colaInline.push(ejecutar);
    });
  }

  // ── Adjuntos ────────────────────────────────────────────────

  /** Sincroniza la metadata de adjuntos del mensaje y la devuelve. */
  async listarAdjuntos(id: string, asesorId: string): Promise<CorreoAdjunto[]> {
    const fila = await this.obtenerMensajePropio(id, asesorId);
    const buzon = await this.carpetas.buzonId();

    const data = await this.graph.get<GraphCollection<GraphAttachment>>(
      `/users/${buzon}/messages/${encodeURIComponent(fila.graphMessageId)}/attachments` +
        '?$select=id,name,contentType,size,isInline',
    );
    const remotos = data.value ?? [];

    for (const adj of remotos) {
      const existe = await this.adjuntoRepo.findOne({
        where: { graphAttachmentId: adj.id },
      });
      const datos = {
        mensajeId: fila.id,
        graphMessageId: fila.graphMessageId,
        nombre: adj.name ?? null,
        contentType: adj.contentType ?? null,
        tamano: adj.size ?? null,
        isInline: !!adj.isInline,
      };
      if (existe) await this.adjuntoRepo.update(existe.id, datos);
      else await this.adjuntoRepo.save(this.adjuntoRepo.create({ graphAttachmentId: adj.id, ...datos }));
    }
    return this.adjuntoRepo.find({
      where: { mensajeId: fila.id },
      order: { isInline: 'ASC', nombre: 'ASC' },
    });
  }

  /**
   * Descarga en streaming. El binario no se guarda en disco ni en la base: pasa
   * de Graph a la respuesta HTTP sin bufferizar en el proceso.
   */
  async descargarAdjunto(
    id: string,
    attachmentId: string,
    asesorId: string,
  ): Promise<{ stream: Stream; nombre: string; contentType: string | null }> {
    const fila = await this.obtenerMensajePropio(id, asesorId);
    const adjunto = await this.adjuntoRepo.findOne({
      where: { mensajeId: fila.id, graphAttachmentId: attachmentId },
    });
    if (!adjunto) {
      throw new NotFoundException('Adjunto no encontrado para este correo.');
    }
    const buzon = await this.carpetas.buzonId();
    const stream = await this.graph.stream(
      `/users/${buzon}/messages/${encodeURIComponent(fila.graphMessageId)}` +
        `/attachments/${encodeURIComponent(attachmentId)}/$value`,
    );
    return { stream, nombre: adjunto.nombre ?? 'adjunto', contentType: adjunto.contentType };
  }

  // ── Operacion inversa: mover / copiar hacia la carpeta ───────

  /**
   * Mueve un correo a la carpeta destino (por ejemplo ASIGNADOS > 10. Jean M.).
   *
   * `POST /users/{id}/messages/{id}/move` crea la copia en el destino y elimina
   * el original. Requiere el permiso Application "Mail.ReadWrite" en la app
   * Korvix. `destinationId` debe ser el ID de la carpeta: "ASIGNADOS" y
   * "10. Jean M." son carpetas personalizadas, no well-known names, asi que su
   * nombre no sirve ahi.
   */
  async moverCorreo(
    graphMessageId: string,
    folderIdDestino: string,
    advisorId?: string,
  ): Promise<{ movido: boolean }> {
    const buzon = await this.carpetas.buzonId();
    await this.graph.post(
      `/users/${buzon}/messages/${encodeURIComponent(graphMessageId)}/move`,
      { destinationId: folderIdDestino },
      { permiso: 'Mail.ReadWrite' },
    );
    if (advisorId) await this.sync.marcarOrigenInterno([graphMessageId]);
    return { movido: true };
  }

  /** Igual que mover pero conserva el original en su carpeta actual. */
  async copiarCorreo(
    graphMessageId: string,
    folderIdDestino: string,
    advisorId?: string,
  ): Promise<{ copiado: boolean }> {
    const buzon = await this.carpetas.buzonId();
    await this.graph.post(
      `/users/${buzon}/messages/${encodeURIComponent(graphMessageId)}/copy`,
      { destinationId: folderIdDestino },
      { permiso: 'Mail.ReadWrite' },
    );
    if (advisorId) await this.sync.marcarOrigenInterno([graphMessageId]);
    return { copiado: true };
  }

  // ── Diagnostico ─────────────────────────────────────────────

  /**
   * Estado del modulo. Sirve para no tener que adivinar por que no llegan
   * correos: si falta el permiso en Entra, lo dice con el nombre exacto.
   */
  async estado(
    asesorId: string,
    nombreAsesor: string,
  ): Promise<Record<string, unknown>> {
    const base: Record<string, unknown> = {
      buzon: this.carpetas.upnBuzon(),
      carpetaPadre: this.carpetas.nombreCarpetaPadre(),
      intervaloMinutos: Number(this.config.get('CORREOS_SYNC_MINUTOS') ?? 5),
      sincronizacionDeshabilitada: this.sync.deshabilitado,
    };

    try {
      const buzon = await this.carpetas.buzonId();
      base.buzonId = buzon;
    } catch (err: any) {
      base.buzonOk = false;
      base.error = err?.response?.status === 403 || err?.status === 403
        ? 'Falta el permiso Application "Mail.Read" en la app Korvix (falta admin consent).'
        : (err?.message ?? String(err));
      return base;
    }

    try {
      const carpeta = await this.carpetas.carpetaDelAsesor(nombreAsesor);
      base.carpetaOk = true;
      base.carpetaId = carpeta.folderId;
      base.carpetaNombre = carpeta.displayName;
      base.mensajesEnEspejo = await this.mensajeRepo.count({
        where: { asesorId, folderId: carpeta.folderId },
      });
    } catch (err: any) {
      base.carpetaOk = false;
      base.carpetaError = err?.message ?? String(err);
    }

    const asignadas = await this.carpetas
      .listarCarpetasAsignadas()
      .then((f) => f.map((x) => x.displayName))
      .catch(() => null);
    if (asignadas) base.carpetasDisponibles = asignadas;

    return base;
  }
}
