import { readFile } from 'fs/promises';
import { basename } from 'path';
import axios from 'axios';

export interface MailsenderCredencial {
  email: string;
  usuario: string;
  password: string;
  nombre: string;
  port: number;
  servidorsmtp: string;
  seguridadssl: boolean;
  protocolo_Tls12: boolean;
  azure_TenantId: string;
  azure_ClientId: string;
  azure_ClientSecret: string;
}

export interface MailsenderArchivo {
  FileName: string;
  ContentBase64: string;
}

export interface EnviarMailsenderOptions {
  baseUrl: string;
  credencial: MailsenderCredencial;
  asunto: string;
  correosNormales?: string;
  correosBcc?: string;
  html: string;
  archivos?: MailsenderArchivo[];
  timeoutMs?: number;
}

export interface MailsenderResult {
  ok: boolean;
  message: string;
}

export const MAILSENDER_DEFAULT_URL =
  String(process.env.MAILSENDER_URL ?? '').trim() ||
  'https://mailsender.innovacloud.co';

/**
 * Completa una credencial parcial con los valores por defecto del gateway
 * Mailsender. El API usa la vía OAuth (azure_*) cuando el SMTP va "vacio";
 * si vienen los campos SMTP completos, enruta por SMTP directo.
 */
export function normalizarCredencialMailsender(
  raw: Partial<MailsenderCredencial> | null | undefined,
): MailsenderCredencial | null {
  if (!raw) return null;
  const email = String(raw.email ?? '').trim();
  const usuario = String(raw.usuario ?? '').trim();
  const password = String(raw.password ?? '');
  if (!email || !usuario || !password) return null;

  return {
    email,
    usuario,
    password,
    nombre: String(raw.nombre ?? '').trim() || 'Soporte',
    port: Math.max(1, Math.min(65535, Number(raw.port) || 587)),
    servidorsmtp: String(raw.servidorsmtp ?? '').trim(),
    seguridadssl: raw.seguridadssl !== false,
    protocolo_Tls12: raw.protocolo_Tls12 !== false,
    azure_TenantId: String(raw.azure_TenantId ?? '').trim(),
    azure_ClientId: String(raw.azure_ClientId ?? '').trim(),
    azure_ClientSecret: String(raw.azure_ClientSecret ?? ''),
  };
}

export function credencialMailsenderValida(
  c: MailsenderCredencial | null | undefined,
): boolean {
  return Boolean(c && c.email && c.usuario && c.password);
}

/**
 * Envia un correo a traves del gateway Mailsender.
 * IMPORTANTE (confirmado con llamadas reales a la API):
 *  - El gateway entrega los destinatarios en `correos_bcc`; `correos_normales`
 *    con valor provoca "Error interno del servidor". Por eso SIEMPRE se mapea
 *    el/los destinatario(s) a `correos_bcc` (uno por llamada en modo
 *    individual, o varios separados por coma/semicolon en modo lote).
 *  - Exito => HTTP 200 con { data: true, mensaje }. Fallo => body con
 *    { data: false, mensaje } (presente o no como status HTTP 400) o,
 *    en validacion, un ProblemDetails { errors, title, status }.
 */
export async function enviarCorreoMailsender(
  opts: EnviarMailsenderOptions,
): Promise<MailsenderResult> {
  const base = String(opts.baseUrl || '').trim() || MAILSENDER_DEFAULT_URL;
  const url = `${base.replace(/\/$/, '')}/apicorreos/conexion/Correos/EnviarCorreo`;
  const destinatarios = String(
    opts.correosBcc || opts.correosNormales || '',
  ).trim();

  try {
    const res = await axios.post(
      url,
      {
        credencial: opts.credencial,
        informacion: {
          asunto: opts.asunto,
          correos_normales: '',
          correos_bcc: destinatarios,
          replicar_correos: [],
          mensaje: opts.html,
          archivos: opts.archivos ?? [],
        },
      },
      {
        timeout: opts.timeoutMs ?? 60000,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const falloEnBody =
      res.data &&
      typeof res.data === 'object' &&
      (res.data as Record<string, unknown>)['data'] === false;

    if (falloEnBody) {
      return {
        ok: false,
        message: extraerMensajeRespuesta(res.data),
      };
    }
    return {
      ok: true,
      message: extraerMensajeRespuesta(res.data),
    };
  } catch (err: any) {
    return { ok: false, message: friendlyMailsenderError(err, url) };
  }
}

/**
 * Lee un archivo del disco y devuelve la data-URI base64 que espera el campo
 * `archivos[].ContentBase64` del gateway.
 */
export async function archivoAUri(
  path: string,
): Promise<{ FileName: string; ContentBase64: string }> {
  const buf = await readFile(path);
  const name = basename(path).replace(/^\d+-/, '');
  return {
    FileName: name,
    ContentBase64: `data:application/octet-stream;base64,${buf.toString('base64')}`,
  };
}

function extraerMensajeRespuesta(data: unknown): string {
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 300);
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const mensaje = d['mensaje'];
    if (typeof mensaje === 'string' && mensaje.trim()) {
      return mensaje.trim().slice(0, 300);
    }
    const candidatos = [
      d['message'],
      d['Message'],
      d['title'],
      d['error'],
      d['detail'],
      d['msg'],
    ];
    for (const c of candidatos) {
      if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 300);
    }
    if (d['errors'] && typeof d['errors'] === 'object') {
      const textos: string[] = [];
      for (const valor of Object.values(
        d['errors'] as Record<string, unknown>,
      )) {
        if (Array.isArray(valor)) {
          for (const v of valor) {
            if (typeof v === 'string' && v.trim()) textos.push(v.trim());
          }
        } else if (typeof valor === 'string' && valor.trim()) {
          textos.push(valor.trim());
        }
      }
      if (textos.length) return textos.join('. ').slice(0, 300);
    }
    try {
      return JSON.stringify(d).slice(0, 300);
    } catch {
      return 'Respuesta desconocida del servicio de correo.';
    }
  }
  return 'Correo enviado correctamente.';
}

/**
 * Traduce errores del gateway a mensajes claros en español.
 * El formato de respuesta exacto se confirmara con una llamada de prueba real.
 */
export function friendlyMailsenderError(err: any, url: string): string {
  const status = Number(err?.response?.status ?? 0);
  const data = err?.response?.data;
  const dataMsg = extraerMensajeRespuesta(data);
  const base = 'El servicio de correo rechazo el envio.';

  if (err?.code === 'ECONNABORTED') {
    return 'El servicio de correo no respondio a tiempo. Revisa la conexion y reintenta.';
  }
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
    return `No se pudo resolver el servidor de correo (${url}). Verifica la direccion configurada.`;
  }
  if (status) {
    const detalle =
      dataMsg && dataMsg !== 'Respuesta desconocida del servicio de correo.'
        ? ` ${dataMsg}`
        : '';
    if (status === 401 || status === 403) {
      return `Autenticacion rechazada por el servicio de correo. Revisa el email, usuario y password o las credenciales de Azure.${detalle}`;
    }
    if (status === 400) {
      return `${base}${detalle}`;
    }
    if (status >= 500) {
      return `El servicio de correo tuvo un error interno (${status}). Reintenta mas tarde.${detalle}`;
    }
    return `${base} (${status})${detalle}`;
  }
  const msg = String(err?.message ?? err ?? '');
  return msg ? `No se pudo enviar el correo: ${msg.slice(0, 300)}` : base;
}
