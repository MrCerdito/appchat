// src/sharepoint/sharepoint.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { MicrosoftGraphMailService } from '../correos/microsoft-graph-mail.service';

const GRAFOS = 'https://graph.microsoft.com/v1.0';

/** Permiso de APLICACION que la app necesita en Entra ID para leer el sitio. */
const PERMISO = 'Sites.Read.All';

/** Cuanto tiempo se confia en la resolucion del sitio/biblioteca. */
const TTL_SESION_MS = 10 * 60_000;

/** Cuanto tiempo se cachea el contenido de una carpeta (metadatos nomas). */
const TTL_LISTADO_MS = 60_000;

/** Aristas de Graph por llamada y tope de paginas por listado. */
const TAMANIO_PAGINA = 200;
const MAX_PAGINAS = 10;

export interface ItemSharepoint {
  id: string;
  nombre: string;
  tipo: 'carpeta' | 'archivo';
  /** Id de la carpeta contenedora; null cuando esta en la raiz de la biblioteca. */
  parentId: string | null;
  parentNombre?: string;
  tamano?: number;
  extension?: string;
  creado?: string;
  modificado?: string;
  modificadoPor?: string;
  /** true si Graph reporta el elemento como compartido (link/invitados). */
  compartido?: boolean;
  /** Enlace web directo de SharePoint (solo para abrir en otra pestana). */
  webUrl?: string;
}

export interface ListadoSharepoint {
  carpeta: { id: string | null; nombre: string } | null;
  items: ItemSharepoint[];
  /** Indica si el listado es una busqueda (los items pueden venir de varias carpetas). */
  busqueda?: string;
}

export interface SesionSharepoint {
  sitioId: string;
  sitioNombre: string;
  sitioUrl: string;
  bibliotecaId: string;
  bibliotecaNombre: string;
  bibliotecaUrl: string;
}

export interface DescargaSharepoint {
  stream: NodeJS.ReadableStream;
  contentType: string;
  /** Tamano declarado por Graph; null si no lo trae. */
  contentLength: number | null;
  filename: string;
}

interface EntradaCache<T> {
  valor: T;
  expira: number;
}

/**
 * Lectura (solo lectura) de la biblioteca de documentos del sitio de SharePoint.
 *
 * No descarga ni guarda archivos en el servidor: a lo sumo pide metadatos de
 * carpetas y, cuando el usuario pide un archivo, lo enstreama de Graph al
 * navegador con `@microsoft.graph.downloadUrl`. Nada se persiste en disco.
 *
 * Reutiliza `MicrosoftGraphMailService` (exportado por `CorreosModule`) para el
 * token de aplicacion: es el unico cliente de Graph con client_credentials,
 * cache de token, reintento 429/5xx y traduccion del 403 al permiso que falta.
 * La descarga en cambio se hace contra la URL pre-autorizada de Graph, sin
 * header Authorization, para no filtrar el token hacia el CDN de SharePoint.
 */
@Injectable()
export class SharepointService {
  private readonly logger = new Logger(SharepointService.name);
  private readonly http: AxiosInstance = axios.create({ timeout: 60_000 });
  private cacheSesion: EntradaCache<SesionSharepoint> | null = null;
  private readonly cacheListados = new Map<string, EntradaCache<ListadoSharepoint>>();

  constructor(
    private readonly config: ConfigService,
    private readonly graph: MicrosoftGraphMailService,
  ) {}

  private hostname(): string {
    return (
      this.config.get<string>('SHAREPOINT_HOSTNAME') || 'innovacloud1.sharepoint.com'
    );
  }

  /** Ruta del sitio dentro del host, p. ej. `/sites/Soporte`. */
  private rutaSitio(): string {
    const ruta = (this.config.get<string>('SHAREPOINT_SITE_PATH') || '/sites/Soporte').trim();
    if (!ruta.startsWith('/')) return `/${ruta}`;
    return ruta.replace(/\/+$/, '');
  }

  private claveCache(prefix: string, ...partes: (string | undefined | null)[]): string {
    return [prefix, ...partes].join('|');
  }

  /**
   * Resuelve el sitio y su biblioteca por defecto (`Documentos compartidos`)
   * y los cachea. Si el sitio se borra/recrea el id cambia, por eso el TTL.
   */
  async sesion(): Promise<SesionSharepoint> {
    if (this.cacheSesion && this.cacheSesion.expira > Date.now()) return this.cacheSesion.valor;

    const path = this.rutaSitio();
    const sitio = await this.graph.get<any>(
      `${GRAFOS}/sites/${this.hostname()}:${path}`,
      { permiso: PERMISO },
    );

    // Biblioteca por defecto; SHAREPOINT_LIBRARY permite elegir otra por nombre.
    const biblioteca = await this.bibliotecaDe(sitio.id);

    this.cacheSesion = {
      valor: {
        sitioId: sitio.id,
        sitioNombre: sitio.displayName ?? path,
        sitioUrl: sitio.webUrl ?? '',
        bibliotecaId: biblioteca.id,
        bibliotecaNombre: biblioteca.name,
        bibliotecaUrl: biblioteca.webUrl ?? '',
      },
      expira: Date.now() + TTL_SESION_MS,
    };
    this.cacheListados.clear();
    return this.cacheSesion.valor;
  }

  private async bibliotecaDe(sitioId: string): Promise<any> {
    const nombre = (this.config.get<string>('SHAREPOINT_LIBRARY') || '').trim();
    if (!nombre) {
      // Biblioteca por defecto: "Documentos compartidos" (Shared Documents).
      return this.graph.get<any>(`${GRAFOS}/sites/${sitioId}/drive`, {
        permiso: PERMISO,
      });
    }

    const { value = [] } = await this.graph.get<any>(
      `${GRAFOS}/sites/${sitioId}/drives?$select=id,name,webUrl`,
      { permiso: PERMISO },
    );
    const encontrada = value.find(
      (d: any) => String(d?.name ?? '').toLowerCase() === nombre.toLowerCase(),
    );
    if (!encontrada) {
      throw new NotFoundException(
        `No existe la biblioteca "${nombre}" en el sitio. Revisa SHAREPOINT_LIBRARY.`,
      );
    }
    return encontrada;
  }

  /** Info del sitio para el encabezado de la pantalla. */
  async info(): Promise<SesionSharepoint> {
    return this.sesion();
  }

  /**
   * Lista una carpeta o busca en toda la biblioteca.
   * `parentId` vacio/ausente = raiz. `q` presente = busqueda.
   * `nombre` es el nombre que el cliente ya tiene de la carpeta: si viene, se
   * ahorra la llamada extra a Graph para resolverlo.
   */
  async listar(parentId?: string, q?: string, nombre?: string): Promise<ListadoSharepoint> {
    const sesion = await this.sesion();
    const consulta = (q ?? '').trim();

    if (consulta) {
      return this.buscar(sesion, consulta);
    }

    const carpetaId = (parentId ?? '').trim() || 'root';
    const clave = this.claveCache('lista', sesion.bibliotecaId, carpetaId);
    const cacheada = this.cacheListados.get(clave);
    if (cacheada && cacheada.expira > Date.now()) return cacheada.valor;

    const url =
      `${GRAFOS}/drives/${sesion.bibliotecaId}/items/${carpetaId}/children` +
      `?$select=id,name,folder,file,size,createdDateTime,lastModifiedDateTime,` +
      `lastModifiedBy,parentReference,shared,webUrl&$top=${TAMANIO_PAGINA}`;

    // El nombre de la carpeta viaja en paralelo (y solo si el cliente no lo trae).
    const datoNombre = (nombre ?? '').trim();
    const promesaNombre =
      carpetaId === 'root' || datoNombre
        ? Promise.resolve(datoNombre)
        : this.nombreDeCarpeta(sesion, carpetaId);

    const [{ items, paginas }, carpetaNombre] = await Promise.all([
      this.paginar(url),
      promesaNombre,
    ]);

    const listado: ListadoSharepoint = {
      carpeta:
        carpetaId === 'root'
          ? { id: null, nombre: 'Raíz' }
          : { id: carpetaId, nombre: carpetaNombre },
      items: items.map((i: any) => this.mapear(i, carpetaId === 'root' ? null : carpetaId)),
    };

    this.cacheListados.set(clave, { valor: listado, expira: Date.now() + TTL_LISTADO_MS });
    if (this.cacheListados.size > 300) this.cacheListados.clear();
    if (paginas >= MAX_PAGINAS) {
      this.logger.warn(`Carpeta ${carpetaId} truncada a ${MAX_PAGINAS} paginas.`);
    }
    return listado;
  }

  /** Busqueda global en la biblioteca (`/root/search(q=...)`). */
  private async buscar(sesion: SesionSharepoint, consulta: string): Promise<ListadoSharepoint> {
    const q = consulta.replace(/'/g, "''");
    const url =
      `${GRAFOS}/drives/${sesion.bibliotecaId}/root/search(q='${q}')` +
      `?$select=id,name,folder,file,size,createdDateTime,lastModifiedDateTime,` +
      `lastModifiedBy,parentReference,shared,webUrl&$top=${TAMANIO_PAGINA}`;

    const { items } = await this.paginar(url);
    return {
      carpeta: null,
      busqueda: consulta,
      items: items
        .filter((i: any) => i?.file || i?.folder)
        .map((i: any) =>
        this.mapear(i, i?.parentReference?.id ?? null, this.nombreParent(i?.parentReference)),
      ),
    };
  }

  /**
   * `parentReference.name` no siempre viene. En su defecto se toma el último
   * segmento de `path` (p. ej. `/drive/root:/Carpeta/Sub` → `Sub`).
   */
  private nombreParent(ref?: any): string | undefined {
    if (ref?.name) return String(ref.name);
    const path: string | undefined = ref?.path;
    if (!path) return undefined;
    const corte = Math.max(path.lastIndexOf('/'), path.lastIndexOf(':'));
    const seg = (corte >= 0 ? path.slice(corte + 1) : path).trim();
    return seg && !seg.includes('/') ? seg : undefined;
  }

  private async paginar(
    url: string,
  ): Promise<{ items: any[]; paginas: number }> {
    const items: any[] = [];
    let siguiente: string | null = url;
    let paginas = 0;

    while (siguiente && paginas < MAX_PAGINAS) {
      const res: any = await this.graph.get<any>(siguiente, { permiso: PERMISO });
      items.push(...(res?.value ?? []));
      siguiente = res?.['@odata.nextLink'] ?? null;
      paginas++;
    }
    return { items, paginas };
  }

  private async nombreDeCarpeta(sesion: SesionSharepoint, id: string): Promise<string> {
    try {
      const meta = await this.graph.get<any>(
        `${GRAFOS}/drives/${sesion.bibliotecaId}/items/${id}?$select=id,name`,
        { permiso: PERMISO },
      );
      return meta?.name ?? '';
    } catch {
      return '';
    }
  }

  private mapear(
    item: any,
    parentId: string | null,
    parentNombre?: string,
  ): ItemSharepoint {
    const nombre: string = item?.name ?? '(sin nombre)';
    const punto = nombre.lastIndexOf('.');
    return {
      id: item?.id ?? '',
      nombre,
      tipo: item?.folder ? 'carpeta' : 'archivo',
      parentId,
      parentNombre,
      tamano: item?.folder ? undefined : Number(item?.size ?? 0),
      extension: punto > 0 ? nombre.slice(punto + 1).toLowerCase() : undefined,
      creado: item?.createdDateTime,
      modificado: item?.lastModifiedDateTime,
      modificadoPor:
        item?.lastModifiedBy?.user?.displayName ??
        item?.lastModifiedBy?.application?.name ??
        undefined,
      compartido: !!item?.shared,
      webUrl: item?.webUrl,
    };
  }

  /**
   * Prepara la descarga: pide los metadatos del item (que siempre salen del
   * sitio configurado) y devuelve la URL pre-autorizada de Graph. El archivo
   * nunca pasa por el disco del servidor: el controller lo enstreama.
   */
  async descarga(id: string): Promise<DescargaSharepoint> {
    const sesion = await this.sesion();
    const meta = await this.graph.get<any>(
      `${GRAFOS}/drives/${sesion.bibliotecaId}/items/${id}` +
        `?$select=id,name,file,size,@microsoft.graph.downloadUrl`,
      { permiso: PERMISO },
    );

    if (meta?.folder) {
      throw new NotFoundException('Eso es una carpeta; no se puede descargar.');
    }
    const downloadUrl: string | undefined = meta?.['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      throw new NotFoundException('Microsoft no devolvio una URL de descarga para este archivo.');
    }

    let res;
    try {
      res = await this.http.get(downloadUrl, {
        responseType: 'stream',
        // Sin Authorization: la URL ya viene firmada por Graph y caduca en ~1h.
        // 'identity' evita gzip: si viniera comprimido, el Content-Length que
        // reenviamos al navegador no calzaría con el stream.
        headers: { 'Accept-Encoding': 'identity' },
        maxRedirects: 5,
      });
    } catch (err: any) {
      this.logger.error(`Fallo la descarga de ${id}: ${err?.message ?? 'error desconocido'}`);
      throw new ServiceUnavailableException('No se pudo descargar el archivo desde SharePoint.');
    }

    const filename = String(meta?.name ?? 'archivo');
    const comprimido = !!res.headers?.['content-encoding'];
    const largo = Number(res.headers?.['content-length'] ?? 0);
    return {
      stream: res.data,
      contentType: String(res.headers?.['content-type'] || 'application/octet-stream'),
      // Si Graph comprimió igual, mejor no declarar el largo: Node lo calcula.
      contentLength: !comprimido && largo > 0 ? largo : Number(meta?.size ?? 0) || null,
      filename,
    };
  }
}
