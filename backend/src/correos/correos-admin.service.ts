import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { CorreosService, MensajeListado } from './correos.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { GraphMailFolder } from './graph.types';
import { CorreoMensaje } from './entities/correo-mensaje.entity';
import { CorreoAdjunto } from './entities/correo-adjunto.entity';
import { CorreoCarpetaSync } from './entities/correo-carpeta-sync.entity';
import {
  CATEGORIAS_CONOCIDAS,
  CATEGORIA_POR_CUBO,
  PRECEDENCIA_CUBOS,
  ConteoCubos,
  CuboCorreo,
  FilaSla,
  NivelSla,
  acumular,
  conteoVacio,
  filaDesdeConteo,
  nivelSla,
  parsearCategorias,
} from './categoria-correo.util';

/**
 * Una fila de la tabla del admin: un asesor con su carpeta y su SLA.
 */
export interface FilaAsesorSla extends FilaSla {
  asesorId: string;
  /** Nombre del usuario en la app. */
  asesor: string;
  /**
   * Nombre de la carpeta en Outlook, que es lo que el admin reconoce
   * ("10.Jean M."). Si la carpeta no se ha podido resolver, cae al nombre del
   * usuario para que la fila nunca quede sin etiqueta.
   */
  carpeta: string;
  carpetaId: string | null;
  /** False cuando el asesor todavia no tiene fila de sincronizacion. */
  sincronizado: boolean;
  /** False si la carpeta quedo a medias en una importacion anterior. */
  importadoCompleto: boolean;
  /** `correo_carpeta_sync.last_sync_at`: cuando se leyo la carpeta por ultima vez. */
  ultimoSync: string | null;
  /** Ultimo correo que llego a la carpeta, segun el espejo local. */
  ultimoRecibido: string | null;
  noLeidos: number;
}

/**
 * Carpeta dentro de ASIGNADOS que no corresponde a ningun asesor del sistema. Se
 * listan aparte para que ningun correo quede fuera del conteo.
 */
export interface CarpetaSinAsesor {
  carpeta: string;
  carpetaId: string;
  /** Lo que Graph cuenta en la carpeta, aunque no este en el espejo local. */
  totalEnGraph: number;
  noLeidosEnGraph: number;
  /** Ya se sincronizo en algun momento pero hoy no encaja con ningun asesor. */
  sincronizada: boolean;
}

/** Conteos de un asesor, ya combinados a partir del agregado de SQL. */
interface AcumuladoAsesor {
  conteo: ConteoCubos;
  noLeidos: number;
  ultimoRecibido: string | null;
}

/** Como de frescos estan las carpetas huerfanas que Graph todavia no ha re-leido. */
export type EstadoCarpetas = 'al_dia' | 'calculando' | 'sin_permiso';

export interface ResumenCorreosAdmin {
  generadoEn: string;
  buzon: string;
  carpetaPadre: string;
  /** Un asesor por fila, ordenado por correos abiertos de mayor a menor. */
  asesores: FilaAsesorSla[];
  /** Carpetas de ASIGNADOS sin asesor asignado. */
  sinAsesor: CarpetaSinAsesor[];
  /** Suma de todos los asesores. */
  totales: FilaSla;
  /** Cuantos asesores hay en cada nivel de SLA. */
  porNivel: Record<NivelSla, number>;
  /** Cuantas carpetas tienen al menos un correo abierto. */
  conAiertos: number;
  /**
   * Estado de la parte que viene de Graph. La tabla de asesores sale siempre de
   * la base local y llega al instante; solo las carpetas huerfanas dependen de
   * una llamada a Microsoft, asi que se sirven desde cache y se avisa cuando
   * todavia no hay dato fresco.
   */
  estadoCarpetas: EstadoCarpetas;
  /** Ultima vez que Graph devolvio la lista de carpetas, si alguna vez la devolvio. */
  carpetasActualizadasEn: string | null;
  /**
   * Cosas que salieron mal pero no impiden pintar la tabla. Se muestra en
   * pantalla: es preferible avisar de que faltaron carpetas huerfanas a no
   * mencionarlas en absoluto.
   */
  avisos: string[];
}

/** Filtros del listado de un asesor concreto. Todos opcionales. */
export interface FiltrosListadoAsesor {
  limite?: number;
  offset?: number;
  soloNoLeidos?: boolean;
  buscar?: string;
  /** Filtra por el cubo del SLA en vez de por la categoria cruda de Outlook. */
  cubo?: CuboCorreo;
}

export interface ListadoAsesor {
  asesor: { id: string; nombre: string };
  mensajes: MensajeListado[];
  /** Mensajes que pasan el filtro de cubo, si se eligio uno. */
  total: number;
  /**
   * Mensajes en la carpeta sin ningun filtro. El admin lo necesita para no leer
   * "0 mensajes" y pensar que la carpeta esta vacia cuando lo que no encaja es el
   * filtro.
   */
  totalEnCarpeta: number;
  limite: number;
  offset: number;
}

/**
 * La columna `categorias` es `simple-json`: un texto con un arreglo dentro.
 * `COALESCE(NULLIF(...))` deja las tres formas de "vacio" (NULL, el texto "null"
 * y "[]") como un arreglo JSON iterable.
 */
const ARREGLO_CATEGORIAS = `COALESCE(NULLIF(m.categorias, 'null'), '[]')::jsonb`;

/**
 * Normaliza una categoria dentro de la consulta, con el mismo criterio que
 * `normalizarCategoria` en TypeScript: quita los simbolos del principio y
 * colapsa espacios.
 *
 * Hace falta porque el filtro por cubo tiene que excluir los mensajes que la
 * precedencia desplaza, y eso no se puede filtrar con `@>` sobre el texto crudo:
 * `-EN PROCESO` y `EN PROCESO` son cadenas distintas y solo una contaria.
 */
const CATEGORIA_NORMALIZADA =
  "regexp_replace(regexp_replace(upper(t.cat), '^[^A-Z0-9]+', '', 'g'), '\\s+', ' ', 'g')";

/**
 * Cuanto se guarda la lista de carpetas de Graph.
 *
 * Son las carpetas huerfanas, que no cambian con cada correo: solo cuando alguien
 * crea, borra o renombra una carpeta en Outlook. Diez minutos es imperceptible
 * para ese dato y quita de en medio la llamada a Microsoft en cada recarga del
 * tablero.
 */
const TTL_CARPETAS_MS = 10 * 60 * 1000;

/**
 * Ventana en la que se reusa el resumen ya armado.
 *
 * Sirve para que pulsar "Actualizar" varias veces seguidas no dispare cinco
 * consultas identicas. Es corto a proposito (2 s) para no esconder un cambio
 * recien aplicado: el empuje por WebSocket llega igual porque no pasa por aqui.
 */
const TTL_MEMO_RESUMEN_MS = 2 * 1000;

/**
 * Consulta de SLA para el admin.
 *
 * Es de solo lectura sobre el espejo local: no llama a Graph ni recorre mensajes
 * uno a uno, porque `correo_mensajes` ya esta poblado para todos los asesores (el
 * tick de `CorreosSyncService` los recorre a todos, no solo al que esta
 * conectado). Los numeros del dashboard salen de ahi y no gastan cuota.
 */
@Injectable()
export class CorreosAdminService {
  private readonly logger = new Logger(CorreosAdminService.name);

  constructor(
    @InjectRepository(CorreoMensaje)
    private readonly mensajeRepo: Repository<CorreoMensaje>,
    @InjectRepository(CorreoAdjunto)
    private readonly adjuntoRepo: Repository<CorreoAdjunto>,
    @InjectRepository(CorreoCarpetaSync)
    private readonly carpetaRepo: Repository<CorreoCarpetaSync>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly carpetas: CorreosCarpetaService,
    private readonly correos: CorreosService,
  ) {}

  /**
   * Carpetas de ASIGNADOS segun Graph, con su cache y su peticion en vuelo.
   *
   * Se guarda la lista CRUDA de Graph y no la de huerfanas: el filtro depende de
   * los syncs del momento, que cambian cada 2 min, mientras que la llamada a
   * Microsoft es la parte cara y esa si dura 10 min.
   */
  private carpetasCache: { valor: GraphMailFolder[]; exp: number } | null = null;
  private carpetasEnVuelo: Promise<GraphMailFolder[]> | null = null;
  private carpetasLeidasEn: string | null = null;
  private carpetasError: string | null = null;
  /** Ultimo resumen armado, para absorber rafagas de "Actualizar". */
  private memoResumen: { valor: ResumenCorreosAdmin; exp: number } | null = null;
  /** Resumen en curso, para que dos recargas simultaneas repartan el calculo. */
  private resumenEnVuelo: Promise<ResumenCorreosAdmin> | null = null;

  // -- Dashboard --------------------------------------------------

  /**
   * Una fila por asesor activo, con sus conteos por estado y su nivel de SLA.
   *
   * Solo se listan los asesores `active` con rol `advisor`: son los unicos que
   * tienen carpeta propia en ASIGNADOS y los unicos que sincroniza el modulo.
   */
  /**
 * Resumen del tablero.
 *
 * Nunca espera a Microsoft Graph (ver `carpetasHuerfanas`), asi que responde en
 * cuanto sale la consulta local. Dos protecciones contra la rafaga de recargas:
 * si ya hay un resumen reciente se reusa, y si hay uno en curso se comparte su
 * promesa en lugar de duplicar las consultas.
 */
async resumen(): Promise<ResumenCorreosAdmin> {
  if (this.memoResumen && this.memoResumen.exp > Date.now()) {
    return this.memoResumen.valor;
  }

  if (this.resumenEnVuelo) return this.resumenEnVuelo;

  this.resumenEnVuelo = this.calcularResumen().finally(() => {
    this.resumenEnVuelo = null;
  });

  return this.resumenEnVuelo;
}

/** El calculo en si, sin memo ni deduplicacion. */
private async calcularResumen(): Promise<ResumenCorreosAdmin> {
  const avisos: string[] = [];

    const [asesores, acumulado, syncs] = await Promise.all([
      this.userRepo.find({
        where: { active: true, role: 'advisor' },
        select: ['id', 'name'],
        order: { name: 'ASC' },
      }),
      this.agregarMensajes(),
      this.carpetaRepo.find(),
    ]);

    // Que carpeta corresponde a cada asesor. Se resuelve por nombre con el mismo
    // criterio que usa la bandeja, sin llamar a Graph.
    const asignadas = this.asignarCarpetas(asesores, syncs);

    const filas: FilaAsesorSla[] = asesores.map((asesor) => {
      const datos = acumulado.get(asesor.id);
      const carpeta = asignadas.get(asesor.id);
      return {
        asesorId: asesor.id,
        asesor: asesor.name,
        // La carpeta manda como etiqueta: es lo que el admin ve en Outlook.
        carpeta: carpeta?.folderDisplayName ?? asesor.name,
        carpetaId: carpeta?.folderId ?? null,
        sincronizado: !!carpeta,
        importadoCompleto: !!carpeta?.importadoCompleto,
        ultimoSync: aIso(carpeta?.lastSyncAt),
        ultimoRecibido: datos?.ultimoRecibido ?? null,
        noLeidos: datos?.noLeidos ?? 0,
        ...filaDesdeConteo(datos?.conteo ?? conteoVacio()),
      };
    });

    // Lo urgente arriba; a igualdad el que mas correos tiene y luego el nombre,
    // para que la tabla no se reordene sola entre recargas.
    filas.sort(
      (a, b) =>
        b.abiertos - a.abiertos ||
        b.total - a.total ||
        a.carpeta.localeCompare(b.carpeta, 'es'),
    );

    // Lo unico que viene de Microsoft entra desde cache y, si no hay, se pide en
    // segundo plano. Esto es lo que hacia lenta la recarga: `listarCarpetasAsignadas`
    // encadena varias llamadas a Graph y el dashboard las esperaba todas.
    const sinAsesor = this.carpetasHuerfanas(syncs, asignadas);
    const estadoCarpetas = this.estadoCarpetas();

    // El ultimo error de Graph se reporta en la respuesta siguiente: al no
    // esperar la llamada, el aviso no puede viajar en la misma.
    if (this.carpetasError) {
      avisos.push(
        `No se pudieron leer las carpetas de ${this.carpetas.nombreCarpetaPadre()} en Graph ` +
          `(${this.carpetasError}). Suele faltar el permiso Application "Mail.Read" con admin ` +
          'consent; los datos por asesor siguen siendo correctos.',
      );
    }

    const resumen: ResumenCorreosAdmin = {
      generadoEn: new Date().toISOString(),
      buzon: this.carpetas.upnBuzon(),
      carpetaPadre: this.carpetas.nombreCarpetaPadre(),
      asesores: filas,
      sinAsesor,
      totales: this.sumarTotales(filas),
      porNivel: this.contarPorNivel(filas),
      conAiertos: filas.filter((f) => f.abiertos > 0).length,
      estadoCarpetas,
      carpetasActualizadasEn: this.carpetasLeidasEn,
      avisos,
    };

    this.memoResumen = { valor: resumen, exp: Date.now() + TTL_MEMO_RESUMEN_MS };
    return resumen;
  }

  /**
   * Carpetas de ASIGNADOS que no pertenecen a ningun asesor del sistema.
   *
   * Se consulta Graph porque una carpeta nunca sincronizada no tiene fila en
   * `correo_carpeta_sync`, y son justo las que hay que señalar: puede que en
   * Outlook el nombre no coincida con ningun usuario y su correo no se este
   * mirando. Graph ya devuelve `totalItemCount` y `unreadItemCount` en la misma
   * llamada, asi que no cuesta ninguna peticion extra.
   *
   * **No se espera a Graph.** Se devuelve lo que haya en cache (puede ser la
   * lista de hace diez minutos, o vacia si nunca se pudo leer) y la lectura
   * sigue en segundo plano. La alternativa, esperar, era lo que hacia que el
   * boton "Actualizar" tardara varios segundos.
   */
  private carpetasHuerfanas(
    syncs: CorreoCarpetaSync[],
    asignadas: Map<string, CorreoCarpetaSync>,
  ): CarpetaSinAsesor[] {
    this.pedirCarpetasSiHacenFalta();

    const crudas = this.carpetasCache?.valor;
    if (!crudas?.length) return [];

    const reclamadas = new Set([...asignadas.values()].map((s) => s.folderId));

    return crudas
      .filter((f) => !reclamadas.has(f.id))
      .map((f) => ({
        carpeta: f.displayName ?? '(sin nombre)',
        carpetaId: f.id,
        totalEnGraph: f.totalItemCount ?? 0,
        noLeidosEnGraph: f.unreadItemCount ?? 0,
        sincronizada: syncs.some((s) => s.folderId === f.id),
      }))
      .sort(
        (a, b) => b.totalEnGraph - a.totalEnGraph || a.carpeta.localeCompare(b.carpeta, 'es'),
      );
  }

  /**
   * Lanza la lectura de carpetas en segundo plano si la cache esta vencida.
   *
   * No se espera: `carpetasEnVuelo` evita que varias recargas simultaneas
   * abran N llamadas a Microsoft por el mismo dato.
   */
  private pedirCarpetasSiHacenFalta(): void {
    const vigente = this.carpetasCache && this.carpetasCache.exp > Date.now();
    if (vigente || this.carpetasEnVuelo) return;

    this.carpetasEnVuelo = this.carpetas
      .listarCarpetasAsignadas()
      .then((valor) => {
        this.carpetasCache = { valor, exp: Date.now() + TTL_CARPETAS_MS };
        this.carpetasLeidasEn = new Date().toISOString();
        this.carpetasError = null;
        this.memoResumen = null;
        return valor;
      })
      .catch((err: any) => {
        const motivo = err?.message ?? String(err);
        this.carpetasError = motivo;
        this.logger.warn(`No se pudieron listar las carpetas sin asesor: ${motivo}`);
        // Se devuelve la lista vacia y se marca como fallida: el proximo resumen
        // lo muestra en `avisos` en lugar de fallar entero.
        this.carpetasCache = { valor: [], exp: Date.now() + TTL_CARPETAS_MS };
        this.memoResumen = null;
        return [] as GraphMailFolder[];
      })
      .finally(() => {
        this.carpetasEnVuelo = null;
      });
  }

  /** Como debe interpretarse la lista de carpetas huerfanas que se devuelve. */
  private estadoCarpetas(): EstadoCarpetas {
    if (this.carpetasError) return 'sin_permiso';
    if (this.carpetasEnVuelo && !this.carpetasCache) return 'calculando';
    return 'al_dia';
  }

  /**
   * Agrega todos los correos en memoria.
   *
   * Agrupa por `(asesor, categorias)` y no mensaje a mensaje: son decenas de
   * filas, no cientos, y las categorias crudas de Outlook ("-EN PROCESO",
   * "✓ RESUELTO") llegan tal cual en cada grupo.
   */
  private async agregarMensajes(): Promise<Map<string, AcumuladoAsesor>> {
    const filas = await this.mensajeRepo
      .createQueryBuilder('m')
      .select('m.asesor_id', 'asesorId')
      .addSelect('m.categorias', 'categorias')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE m.is_read = false)', 'noLeidos')
      .addSelect('MAX(m.received_at)', 'ultimo')
      .groupBy('m.asesor_id')
      .addGroupBy('m.categorias')
      .getRawMany<{
        asesorId: string;
        categorias: string | null;
        total: string;
        noLeidos: string;
        ultimo: Date | string | null;
      }>();

    const mapa = new Map<string, AcumuladoAsesor>();

    for (const fila of filas) {
      let entrada = mapa.get(fila.asesorId);
      if (!entrada) {
        entrada = { conteo: conteoVacio(), noLeidos: 0, ultimoRecibido: null };
        mapa.set(fila.asesorId, entrada);
      }

      acumular(entrada.conteo, parsearCategorias(fila.categorias), Number(fila.total));
      entrada.noLeidos += Number(fila.noLeidos);

      // El ultimo recibido es el maximo entre todos los grupos del asesor.
      const ultimo = aIso(fila.ultimo);
      if (ultimo && (!entrada.ultimoRecibido || ultimo > entrada.ultimoRecibido)) {
        entrada.ultimoRecibido = ultimo;
      }
    }

    return mapa;
  }

  /**
   * Empareja cada asesor con su fila de `correo_carpeta_sync`.
   *
   * Esa tabla no guarda `asesor_id` (el id de carpeta de Graph es opaco y no se
   * puede comparar entre buzones), asi que el vinculo es el nombre. Se reutiliza
   * `coincideCarpeta`, que ya es el criterio con el que la bandeja resuelve la
   * carpeta y que admite el apellido abreviado ("10.Jean M." para "Jean Munoz").
   *
   * Si un asesor llegara a tener dos carpetas sincronizadas gana la mas reciente:
   * la otra suele ser una carpeta vieja que se borro y se recreo.
   */
  private asignarCarpetas(
    asesores: Array<Pick<User, 'id' | 'name'>>,
    syncs: CorreoCarpetaSync[],
  ): Map<string, CorreoCarpetaSync> {
    const resultado = new Map<string, CorreoCarpetaSync>();

    for (const asesor of asesores) {
      const candidatas = syncs.filter((s) =>
        CorreosCarpetaService.coincideCarpeta(s.folderDisplayName, asesor.name),
      );
      if (!candidatas.length) continue;

      candidatas.sort((a, b) => (b.lastSyncAt?.getTime() ?? 0) - (a.lastSyncAt?.getTime() ?? 0));
      resultado.set(asesor.id, candidatas[0]);
    }

    return resultado;
  }

  /** Suma las filas ya calculadas en un unico registro de totales. */
  private sumarTotales(filas: FilaAsesorSla[]): FilaSla {
    const conteo = conteoVacio();
    for (const f of filas) {
      conteo.pendiente += f.pendiente;
      conteo.en_proceso += f.enProceso;
      conteo.gestionado += f.gestionado;
      conteo.escalado += f.escalado;
      conteo.resuelto += f.resuelto;
      conteo.otros += f.otros;
    }
    const total = filas.reduce((suma, f) => suma + f.total, 0);
    const abiertos = filas.reduce((suma, f) => suma + f.abiertos, 0);
    return { ...filaDesdeConteo(conteo), total, abiertos, nivel: nivelSla(abiertos) };
  }

  private contarPorNivel(filas: FilaAsesorSla[]): Record<NivelSla, number> {
    const porNivel: Record<NivelSla, number> = {
      al_dia: 0,
      estable: 0,
      en_riesgo: 0,
      critico: 0,
    };
    for (const f of filas) porNivel[f.nivel] += 1;
    return porNivel;
  }

  // -- Detalle de un asesor (solo lectura) -------------------------

  /**
   * Bandeja de un asesor para el admin. Solo metadatos: el admin ve lo que hay,
   * pero no responde, mueve ni clasifica. El cuerpo se pide aparte con
   * `cuerpoDeAsesor`, que ya devuelve el HTML sanitizado.
   */
  async mensajesDeAsesor(asesorId: string, opciones: FiltrosListadoAsesor = {}): Promise<ListadoAsesor> {
    const asesor = await this.userRepo.findOne({
      where: { id: asesorId },
      select: ['id', 'name', 'role', 'active'],
    });
    if (!asesor || asesor.role !== 'advisor' || !asesor.active) {
      throw new NotFoundException('Asesor no encontrado.');
    }

    const limite = Math.min(Math.max(opciones.limite ?? 50, 1), 200);
    const offset = Math.max(opciones.offset ?? 0, 0);

    const qb = this.mensajeRepo
      .createQueryBuilder('m')
      .where('m.asesor_id = :asesorId', { asesorId })
      .orderBy('m.received_at', 'DESC', 'NULLS LAST')
      .addOrderBy('m.id', 'DESC');

    if (opciones.soloNoLeidos) qb.andWhere('m.is_read = false');

    const texto = opciones.buscar?.trim();
    if (texto) {
      const patron = `%${escaparLike(texto)}%`;
      qb.andWhere(
        `(m.subject ILIKE :patron ESCAPE '\\'` +
          ` OR m.from_nombre ILIKE :patron ESCAPE '\\'` +
          ` OR m.from_email ILIKE :patron ESCAPE '\\'` +
          ` OR m.body_preview ILIKE :patron ESCAPE '\\')`,
        { patron },
      );
    }

    if (opciones.cubo) {
      const filtro = this.filtroPorCubo(opciones.cubo);
      qb.andWhere(filtro.sql, filtro.params);
    }

    const mensajes = await qb.limit(limite).offset(offset).getMany();

    // El filtro de cubo si se refleja en el total, porque es una opcion de la
    // propia pantalla. El texto y "solo no leidos" no, para que el encabezado no
    // se mueva mientras el admin escribe.
    const qbConteo = this.mensajeRepo
      .createQueryBuilder('m')
      .select('COUNT(*)', 'total')
      .where('m.asesor_id = :asesorId', { asesorId });
    if (opciones.cubo) {
      const filtro = this.filtroPorCubo(opciones.cubo);
      qbConteo.andWhere(filtro.sql, filtro.params);
    }
    const totalConFiltro = Number((await qbConteo.getRawOne<{ total: string }>())?.total ?? 0);

    const totalEnCarpeta = await this.mensajeRepo.count({ where: { asesorId } });

    const adjuntosPorMensaje = await this.contarAdjuntos(mensajes.map((m) => m.id));

    return {
      asesor: { id: asesor.id, nombre: asesor.name },
      mensajes: mensajes.map((m) => this.aListado(m, adjuntosPorMensaje.get(m.id) ?? 0)),
      total: totalConFiltro,
      totalEnCarpeta,
      limite,
      offset,
    };
  }

  /**
   * Predicado SQL que deja pasar solo los mensajes de un cubo.
   *
   * No basta con preguntar si el mensaje tiene la categoria: uno con "EN PROCESO"
   * y "✓ RESUELTO" es resuelto por precedencia, asi que el filtro de "en proceso"
   * tiene que excluirlo igual que hace `clasificarMensaje`. De lo contrario el
   * detalle contradiria al conteo de la tabla.
   */
  private filtroPorCubo(cubo: CuboCorreo): {
    sql: string;
    params: Record<string, string | string[]>;
  } {
    // Sin categorias: las tres formas de vacio de la columna simple-json.
    if (cubo === 'pendiente') {
      return {
        sql: `(m.categorias IS NULL OR m.categorias IN ('[]', 'null'))`,
        params: {},
      };
    }

    const existe = (condicion: string) =>
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(${ARREGLO_CATEGORIAS}) t(cat) WHERE ${condicion})`;

    if (cubo === 'otros') {
      // Tiene alguna categoria, pero ninguna de las cuatro conocidas.
      return {
        sql:
          `NOT (m.categorias IS NULL OR m.categorias IN ('[]', 'null')) AND ` +
          existe(`${CATEGORIA_NORMALIZADA} <> ALL(:conocidas)`),
        params: { conocidas: CATEGORIAS_CONOCIDAS },
      };
    }

    // Todo lo que va por delante en la precedencia desplaza a este cubo.
    const superiores = PRECEDENCIA_CUBOS.slice(0, PRECEDENCIA_CUBOS.indexOf(cubo))
      .map((c) => CATEGORIA_POR_CUBO[c])
      .filter((c): c is string => !!c);

    const sql =
      existe(`${CATEGORIA_NORMALIZADA} = :propia`) +
      (superiores.length ? ` AND NOT ${existe(`${CATEGORIA_NORMALIZADA} = ANY(:superiores)`)}` : '');

    return { sql, params: { propia: CATEGORIA_POR_CUBO[cubo] ?? '', superiores } };
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

  /** Mismo mapeo a listado que usa la bandeja del asesor. */
  private aListado(m: CorreoMensaje, adjuntos: number): MensajeListado {
    return {
      id: m.id,
      graphMessageId: m.graphMessageId,
      subject: m.subject,
      fromNombre: m.fromNombre,
      fromEmail: m.fromEmail,
      para: Array.isArray(m.para) ? m.para : [],
      cc: Array.isArray(m.cc) ? m.cc : [],
      categorias: Array.isArray(m.categorias) ? m.categorias : [],
      bodyPreview: m.bodyPreview,
      isRead: m.isRead,
      hasAttachments: m.hasAttachments,
      importance: m.importance,
      conversationId: m.conversationId,
      receivedAt: m.receivedAt ? new Date(m.receivedAt).toISOString() : null,
      sentAt: m.sentAt ? new Date(m.sentAt).toISOString() : null,
      origen: m.origen,
      adjuntos,
    };
  }

  /**
   * Cuerpo de un correo del asesor, ya sanitizado.
   *
   * Reusa `CorreosService.cuerpo` con el id del asesor al que pertenece el
   * mensaje: es el mismo codigo de sanitizado que ya usa el asesor, sin duplicarlo
   * ni abrir una via nueva para saltarse la validacion de pertenencia.
   */
  async cuerpoDeAsesor(
    asesorId: string,
    mensajeId: string,
    urlBase: string,
  ): Promise<{ html: string; truncado: boolean; mensaje: MensajeListado }> {
    const asesor = await this.userRepo.findOne({
      where: { id: asesorId, role: 'advisor' },
      select: ['id', 'active'],
    });
    if (!asesor || !asesor.active) throw new NotFoundException('Asesor no encontrado.');
    return this.correos.cuerpo(mensajeId, asesorId, urlBase);
  }
}

/** `timestamptz` a ISO, tolerando que el driver devuelva Date o texto. */
function aIso(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/** Escapa los comodines de LIKE para que la busqueda sea literal. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}