import {
  Injectable,
  Logger,
  ForbiddenException,
  ServiceUnavailableException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Stream } from 'stream';

const GRAFOS = 'https://graph.microsoft.com/v1.0';

/**
 * Graph responde 410 Gone cuando un `deltaLink` caduco (Microsoft los rota cada
 * pocos dias) o cuando se borro la carpeta. No es un fallo de Graph sino la
 * senal normal de que hay que resincronizar desde cero.
 *
 * Se propaga como error propio, SIN envolver en BadGatewayException, para que
 * `CorreosSyncService` lo distinga de un error real de red.
 */
export class DeltaLinkExpiradoError extends Error {
  readonly status = 410;
  readonly code = 'SyncStateNotFound';
  constructor(readonly motivo = 'deltaLink expirado') {
    super(`Microsoft Graph devolvio 410 (${motivo}); hay que resincronizar.`);
    this.name = 'DeltaLinkExpiradoError';
  }
}

/**
 * Cliente de Microsoft Graph para el buzon de correo.
 *
 * Se autentica con `client_credentials` (la app se comporta con su propia
 * identidad, sin usuario de por medio), por eso no hay redirect URI ni refresh
 * token. El token se cachea en memoria hasta un minuto antes de expirar.
 *
 * SEGURIDAD: aqui nunca se registra el client secret ni el access token. Los
 * errores de Graph se loguean sin cabeceras de autorizacion.
 */
@Injectable()
export class MicrosoftGraphMailService {
  private readonly logger = new Logger(MicrosoftGraphMailService.name);
  private readonly http: AxiosInstance;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({ baseURL: GRAFOS, timeout: 30_000 });
  }

  /** Tenant de la app. MICROSOFT_APP_TENANT_ID permite separar recurso y directorio. */
  private tenantId(): string {
    return (
      this.config.get<string>('MICROSOFT_APP_TENANT_ID') ||
      this.config.getOrThrow<string>('MICROSOFT_TENANT_ID')
    );
  }

  private clientId(): string {
    return this.config.getOrThrow<string>('MICROSOFT_CLIENT_ID');
  }

  private async token(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }

    const body = new URLSearchParams({
      client_id: this.clientId(),
      client_secret: this.config.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    let data: any;
    try {
      const res = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId()}/oauth2/v2.0/token`,
        body,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      data = res.data;
    } catch (err: any) {
      // Solo el codigo de error: el body podria incluir eco del secret enviado.
      this.logger.error(
        `client_credentials fallo contra tenant ${this.tenantId()}: ` +
          `${err?.response?.data?.error ?? err?.message ?? 'desconocido'}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo autenticar la aplicacion contra Microsoft. Revisa MICROSOFT_CLIENT_ID, ' +
          'MICROSOFT_CLIENT_SECRET y MICROSOFT_APP_TENANT_ID.',
      );
    }

    const expiresIn = Number(data?.expires_in ?? 3600);
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    };
    return this.tokenCache.token;
  }

  private async authHeaders(
    extra: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.token()}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /**
   * Traduce errores de Graph a excepciones de Nest con un mensaje accionable.
   * `ErrorAccessDenied` casi siempre significa "falta un permiso en Entra ID",
   * asi que se dice exactamente cual.
   */
  private mapError(err: any, permiso: string): Error | null {
    const status = err?.response?.status;
    const code = err?.response?.data?.error?.code;

    if (code === 'ErrorAccessDenied' || status === 403) {
      return new ForbiddenException(
        `Microsoft denego el acceso. Agrega el permiso Application "${permiso}" ` +
          'a la app Korvix y luego "Grant admin consent" en Entra ID.',
      );
    }
    if (status === 404) {
      return new NotFoundException(
        'Microsoft no encontro el recurso. Si es una carpeta, puede haberse ' +
          'borrado o recreado (su id cambia).',
      );
    }
    // 410 no es "fallo de Graph": el deltaLink caduco y hay que resincronizar.
    if (status === 410 || code === 'SyncStateNotFound' || code === 'resyncRequired') {
      return new DeltaLinkExpiradoError(code ?? '410 Gone');
    }
    // El 401 se resuelve con un retry en get() tras limpiar el token; aqui no se
    // convierte en Forbidden para no reportar "sin permisos" cuando solo vencio.
    if (status === 401) {
      this.limpiarToken();
      return null;
    }
    return null;
  }

  /** GET con hasta 3 intentos y backoff exponencial en 429/5xx. */
  async get<T = any>(
    url: string,
    opciones: { headers?: Record<string, string>; permiso?: string } = {},
  ): Promise<T> {
    const permiso = opciones.permiso ?? 'Mail.Read';
    let ultimo: any;

    for (let intento = 0; intento < 3; intento++) {
      try {
        const res = await this.http.get<T>(url, {
          headers: await this.authHeaders(opciones.headers),
        });
        return res.data;
      } catch (err: any) {
        ultimo = err;
        const mapeado = this.mapError(err, permiso);
        if (mapeado) throw mapeado;

        const status = err?.response?.status;

        // 401: el token pudo expirar o revocarse. mapError ya lo limpio, asi que
        // un reintento con token nuevo suele bastar. No cuenta como error fatal.
        if (status === 401 && intento < 2) {
          this.logger.warn(`Graph 401; reintento ${intento + 1}/3 con token nuevo.`);
          continue;
        }

        if (status === 429 || (status >= 500 && status < 600)) {
          const retryAfter = Number(err?.response?.headers?.['retry-after'] ?? 0);
          const espera = retryAfter > 0 ? retryAfter * 1000 : 2 ** intento * 500;
          this.logger.warn(
            `Graph ${status}; reintento ${intento + 1}/3 en ${espera}ms (${url.split('?')[0]})`,
          );
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
        throw new BadGatewayException(
          `Microsoft Graph fallo: ${err?.message ?? 'error desconocido'}`,
        );
      }
    }
    throw new BadGatewayException(
      `Microsoft Graph fallo tras 3 intentos: ${ultimo?.message ?? 'error desconocido'}`,
    );
  }

  async post<T = any>(
    url: string,
    payload: unknown,
    opciones: { permiso?: string } = {},
  ): Promise<T> {
    try {
      const res = await this.http.post<T>(url, payload, {
        headers: await this.authHeaders(),
      });
      return res.data;
    } catch (err: any) {
      const mapeado = this.mapError(err, opciones.permiso ?? 'Mail.ReadWrite');
      if (mapeado) throw mapeado;
      throw new BadGatewayException(
        `Microsoft Graph fallo: ${err?.message ?? 'error desconocido'}`,
      );
    }
  }

  /**
   * Descarga binaria en streaming. Se usa para adjuntos: asi un PDF de 20 MB
   * no pasa por el buffer del proceso ni por el heap de Node.
   */
  async stream(url: string, permiso = 'Mail.Read'): Promise<Stream> {
    let res;
    try {
      res = await this.http.get<Stream>(url, {
        headers: await this.authHeaders(),
        responseType: 'stream',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (err: any) {
      const mapeado = this.mapError(err, permiso);
      throw mapeado ?? new BadGatewayException(`No se pudo descargar: ${err?.message ?? err}`);
    }
    return res.data;
  }

  /** Util para diagnostico: devuelve la identidad de la app segun el token actual. */
  async tokenInfo(): Promise<{ appId?: string; tenantId?: string }> {
    const token = await this.token();
    try {
      const [, payload] = token.split('.');
      const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return { appId: json.appid, tenantId: json.tid };
    } catch {
      return {};
    }
  }

  /** Se usa cuando un 401 obliga a renovar. */
  limpiarToken(): void {
    this.tokenCache = null;
  }
}
