import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicrosoftGraphMailService } from './microsoft-graph-mail.service';
import { GraphCollection, GraphMailFolder, GraphUser } from './graph.types';

const TTL_CACHE_MS = 10 * 60 * 1000;

/**
 * Resuelve la carpeta del asesor dentro del buzon compartido.
 *
 * El arbol real es:
 *   soporte@innovacloud.co
 *   └── ASIGNADOS
 *       ├── 1. Carlos A.
 *       ├── 2. Joel C.
 *       ├── 3. Jorge A.
 *       └── 10. Jean M.
 *
 * Los ids de carpeta de Graph NUNCA se asumen: son opacos, cambian si la carpeta
 * se borra y se recrea, y no se pueden comparar entre buzones. Por eso siempre
 * se buscan por nombre y se cachean con TTL, invalidando la cache si despues
 * Graph responde 404.
 *
* Como los nombres llevan prefijo numerico ("10. Jean M.") la comparacion es
 * normalizada: se quita el prefijo, se quitan tildes y se pasa a minusculas.
 * Asi "10. Jean M." y "Jean M." son el mismo asesor.
 *
 * Ademas el apellido suele venir abreviado ("10. Jean M." para "Jean Munoz"),
 * asi que la busqueda es palabra por palabra y admite abreviaturas; ver
 * `coincideCarpeta`. Con dos carpetas que sirvan para la misma persona no se
 * elige una: se reporta el conflicto para que alguien renombre en Outlook.
 */
@Injectable()
export class CorreosCarpetaService {
  private readonly logger = new Logger(CorreosCarpetaService.name);
  private cache = new Map<string, { valor: string; exp: number }>();

  constructor(
    private readonly graph: MicrosoftGraphMailService,
    private readonly config: ConfigService,
  ) {}

  /** Quita "10. " / "2) " / "3 - " y normaliza a minusculas sin tildes. */
  static normalizar(texto: string | null | undefined): string {
    return (texto ?? '')
      .replace(/^\s*\d+\s*[.)-]\s*/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Palabras de un nombre ya normalizado, sin puntuacion pegada: "Jean M." son
   * ["jean", "m"] y no ["jean", "m."]. El punto final es lo que hacia fallar la
   * comparacion anterior.
   */
  private static palabras(texto: string): string[] {
    return texto
      .split(' ')
      .map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter((p) => p.length > 0);
  }

  /**
   * Si una carpeta corresponde a una persona.
   *
   * En Outlook las carpetas de adviser llevan el apellido abreviado ("10.Jean
   * M."), asi que la igualdad exacta de "Jean M." con "Jean Munoz" nunca
   * cumplia. Se compara palabra por palabra: cada palabra de la carpeta tiene
   * que ser compatible con la de su posicion en el nombre, admitiendo que una
   * sea abreviatura de la otra ("m" de "munoz"). La carpeta puede tener menos
   * palabras que el nombre, nunca mas: "Jean M." no puede ser la carpeta de
   * "Jean", porque eso seria adivinar.
   *
   * Si dos carpetas coinciden ("Jean M." y "Jean Martinez" para "Jean Munoz")
   * NO se elige una: el llamador lanza conflicto y el admin renombra.
   */
  static coincideCarpeta(
    nombreCarpeta: string | null | undefined,
    nombrePersona: string | null | undefined,
  ): boolean {
    const carpeta = CorreosCarpetaService.palabras(
      CorreosCarpetaService.normalizar(nombreCarpeta),
    );
    const persona = CorreosCarpetaService.palabras(
      CorreosCarpetaService.normalizar(nombrePersona),
    );
    if (!carpeta.length || !persona.length) return false;
    if (carpeta.length > persona.length) return false;

    return carpeta.every((p, i) => persona[i].startsWith(p) || p.startsWith(persona[i]));
  }

  /** Distancia de edicion, para sugerir que carpeta revisar en el error. */
  private static distancia(a: string, b: string): number {
    if (a === b) return 0;
    const anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const actual = [i];
      for (let j = 1; j <= b.length; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;
        actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + costo);
      }
      anterior.splice(0, anterior.length, ...actual);
    }
    return anterior[b.length];
  }

  /** Carpeta mas parecida a un nombre, para que el error sea accionable. */
  private static masParecida(
    nombre: string,
    candidatas: Array<string | null | undefined>,
  ): string | null {
    const objetivo = CorreosCarpetaService.normalizar(nombre);
    let mejor: { carpeta: string; d: number } | null = null;
    for (const c of candidatas) {
      if (!c) continue;
      const d = CorreosCarpetaService.distancia(CorreosCarpetaService.normalizar(c), objetivo);
      if (!mejor || d < mejor.d) mejor = { carpeta: c, d };
    }
    return mejor && mejor.d <= 3 ? mejor.carpeta : null;
  }

  private get(key: string): string | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.exp < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.valor;
  }

  private set(key: string, valor: string): void {
    this.cache.set(key, { valor, exp: Date.now() + TTL_CACHE_MS });
  }

  /** UPN del buzon configurado, con fallback al buzon que ya usa Teams. */
  upnBuzon(): string {
    return (
      this.config.get<string>('CORREOS_MAILBOX_UPN') ||
      this.config.get<string>('TEAMS_MEETINGS_ACCOUNT') ||
      'soporte@innovacloud.co'
    );
  }

  /** Nombre de la carpeta padre, configurable por si cambia en Outlook. */
  nombreCarpetaPadre(): string {
    return this.config.get<string>('CORREOS_CARPETA_PADRE') || 'ASIGNADOS';
  }

  /**
   * Paso 1: resolver el buzon compartido. Se usa el UPN como id de Graph, que
   * es valido en la ruta `/users/{id | userPrincipalName}`.
   */
  async buzonId(): Promise<string> {
    const upn = this.upnBuzon();
    const cacheKey = `buzon:${upn}`;
    const hit = this.get(cacheKey);
    if (hit) return hit;

    // OJO: `/users/{id | upn}` devuelve un RECURSO UNO, no una coleccion.
    // Solo las rutas .../messages, .../mailFolders y similares envuelven en { value }.
    const buzon = await this.graph.get<GraphUser>(
      `/users/${encodeURIComponent(upn)}?$select=id,displayName,mail,accountEnabled`,
    );
    if (!buzon?.id) {
      throw new NotFoundException(
        `No existe el buzon "${upn}" en el tenant, o la app no tiene permiso para verlo.`,
      );
    }
    this.set(cacheKey, buzon.id);
    return buzon.id;
  }

  /** Carpetas hijas de una carpeta. `null` significa raiz del buzon. */
  private async collectionDeCarpetas(buzon: string, padreId: string | null): Promise<GraphMailFolder[]> {
    const base = padreId
      ? `/users/${buzon}/mailFolders/${encodeURIComponent(padreId)}/childFolders`
      : `/users/${buzon}/mailFolders`;

    const filtrada = await this.graph.get<GraphCollection<GraphMailFolder>>(
      `${base}?$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount`,
    );
    return filtrada.value ?? [];
  }

  /**
   * Busca una carpeta por nombre exacto. Primero deja que Graph filtre con
   * `$filter=displayName eq '...'`; si no llega nada, compara en memoria con la
   * version normalizada, que cubre acentos y variantes del prefijo numerico.
   */
  private async buscarCarpeta(
    buzon: string,
    padreId: string | null,
    nombre: string,
  ): Promise<GraphMailFolder | null> {
    const base = padreId
      ? `/users/${buzon}/mailFolders/${encodeURIComponent(padreId)}/childFolders`
      : `/users/${buzon}/mailFolders`;
    const select = '&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount';

    try {
      const exacto = await this.graph.get<GraphCollection<GraphMailFolder>>(
        `${base}?$filter=${encodeURIComponent(`displayName eq '${nombre.replace(/'/g, "''")}'`)}${select}`,
      );
      if (exacto.value?.length) return exacto.value[0];
    } catch (err: any) {
      // $filter no siempre esta soportado en mailFolders; no es motivo de fallo.
      this.logger.debug(
        `$filter sobre mailFolders no disponible (${err?.message ?? err}); se compara en memoria.`,
      );
    }

    const todas = await this.collectionDeCarpetas(buzon, padreId);
    const coincide = todas.filter((f) =>
      CorreosCarpetaService.coincideCarpeta(f.displayName, nombre),
    );
    if (coincide.length > 1) {
      throw new ConflictException(
        `Hay ${coincide.length} carpetas que corresponden a "${nombre}": ` +
          `${coincide.map((f) => f.displayName).join(', ')}. ` +
          'Deja una sola o ajusta el nombre en Outlook.',
      );
    }
    return coincide[0] ?? null;
  }

  /**
   * Paso 2 y 3: encuentra la carpeta padre (ASIGNADOS) y, dentro de ella, la que
   * corresponde al asesor conectado.
   */
  async carpetaDelAsesor(nombreAsesor: string): Promise<{
    folderId: string;
    parentFolderId: string;
    displayName: string;
  }> {
    const cacheKey = `asesor:${CorreosCarpetaService.normalizar(nombreAsesor)}`;
    const cacheParent = this.get(`${cacheKey}:parent`);
    const cacheId = this.get(cacheKey);
    if (cacheId && cacheParent) {
      return {
        folderId: cacheId,
        parentFolderId: cacheParent,
        displayName: this.get(`${cacheKey}:name`) ?? '',
      };
    }

    const buzon = await this.buzonId();
    const nombrePadre = this.nombreCarpetaPadre();

    const padre = await this.buscarCarpeta(buzon, null, nombrePadre);
    if (!padre) {
      throw new NotFoundException(
        `No se encontro la carpeta "${nombrePadre}" en ${this.upnBuzon()}. ` +
          'Si el nombre es otro, ajusta CORREOS_CARPETA_PADRE.',
      );
    }

    const hijas = await this.collectionDeCarpetas(buzon, padre.id);
    const candidatas = hijas.filter((f) =>
      CorreosCarpetaService.coincideCarpeta(f.displayName, nombreAsesor),
    );

    if (candidatas.length === 0) {
      const nombres = hijas.map((f) => f.displayName);
      const disponibles = nombres.join(', ') || '(sin subcarpetas)';
      const sugerida = CorreosCarpetaService.masParecida(nombreAsesor, nombres);
      throw new NotFoundException(
        `No hay carpeta para "${nombreAsesor}" dentro de "${nombrePadre}". ` +
          `Carpetas disponibles: ${disponibles}. ` +
          (sugerida
            ? `La mas parecida es "${sugerida}": renombrala en Outlook si no es la tuya. `
            : '') +
          'Se acepta el apellido abreviado (10.Jean M. sirve para "Jean Munoz"), ' +
          'pero nombre e inicial deben coincidir.',
      );
    }
    if (candidatas.length > 1) {
      throw new ConflictException(
        `Varias carpetas corresponden a "${nombreAsesor}": ` +
          `${candidatas.map((f) => f.displayName).join(', ')}. ` +
          'Deja una sola en Outlook para saber cual es la tuya.',
      );
    }

    const elegida = candidatas[0];
    this.set(cacheKey, elegida.id);
    this.set(`${cacheKey}:parent`, padre.id);
    this.set(`${cacheKey}:name`, elegida.displayName ?? '');
    return {
      folderId: elegida.id,
      parentFolderId: padre.id,
      displayName: elegida.displayName ?? '',
    };
  }

  /** Carpetas hijas de ASIGNADOS: alimenta el diagnostico y los errores. */
  async listarCarpetasAsignadas(): Promise<GraphMailFolder[]> {
    const buzon = await this.buzonId();
    const padre = await this.buscarCarpeta(buzon, null, this.nombreCarpetaPadre());
    if (!padre) {
      throw new NotFoundException(
        `No se encontro la carpeta "${this.nombreCarpetaPadre()}" en ${this.upnBuzon()}.`,
      );
    }
    return this.collectionDeCarpetas(buzon, padre.id);
  }

  /** Folder id de la carpeta padre (ASIGNADOS), usado para mover/copiar. */
  async carpetaPadreId(): Promise<string> {
    const buzon = await this.buzonId();
    const padre = await this.buscarCarpeta(buzon, null, this.nombreCarpetaPadre());
    if (!padre) {
      throw new NotFoundException(
        `No se encontro la carpeta "${this.nombreCarpetaPadre()}".`,
      );
    }
    return padre.id;
  }

  /**
   * Se invoca cuando Graph responde 404 sobre una carpeta: normalmente fue
   * borrada y recreada, asi que el id guardado ya no sirve.
   */
  invalidar(nombreAsesor?: string): void {
    if (nombreAsesor) {
      const k = `asesor:${CorreosCarpetaService.normalizar(nombreAsesor)}`;
      this.cache.delete(k);
      this.cache.delete(`${k}:parent`);
      this.cache.delete(`${k}:name`);
      return;
    }
    this.cache.clear();
  }
}
