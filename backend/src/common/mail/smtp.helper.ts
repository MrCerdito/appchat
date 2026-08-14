import { lookup } from 'dns/promises';
import { createTransport, Transporter } from 'nodemailer';

export interface SmtpConnectionOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface SmtpTransportResult {
  transporter: Transporter;
  host: string;
  connectHost: string;
  resolved: boolean;
}

/**
 * Crea el transporter SMTP resolviendo el host forzando IPv4. En maquinas
 * sin ruta IPv6 (localhost, redes corporativas) el DNS puede devolver una
 * IPv6 primero y la conexion falla con ENETUNREACH. Al conectar por la IP
 * IPv4 se mantiene SNI con `tls.servername` para que el certificado siga
 * validando. Con secure=false se fuerza STARTTLS (Outlook 587).
 */
export async function createSmtpTransport(
  opts: SmtpConnectionOptions,
): Promise<SmtpTransportResult> {
  let connectHost = opts.host;
  let resolved = false;

  const isIp =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(opts.host) || opts.host.includes(':');

  if (!isIp) {
    try {
      const { address } = await lookup(opts.host, { family: 4 });
      if (address && address !== opts.host) {
        connectHost = address;
        resolved = true;
      }
    } catch {
      // No se pudo resolver por IPv4: dejamos que nodemailer resuelva solo.
    }
  }

  const transporter = createTransport({
    host: connectHost,
    port: opts.port,
    secure: opts.secure,
    requireTLS: !opts.secure,
    auth: { user: opts.user, pass: opts.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: resolved ? { servername: opts.host } : undefined,
  });

  return { transporter, host: opts.host, connectHost, resolved };
}

export function friendlySmtpError(
  err: any,
  host: string,
  port: number,
): string {
  const code = err?.code;
  const base = `No se pudo conectar con ${host}:${port}.`;
  switch (code) {
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return `${base} No hay ruta de red hacia el servidor (intento por IPv6). Revisa que el equipo tenga salida a internet y que el firewall permita el puerto ${port}.`;
    case 'ECONNREFUSED':
      return `${base} El servidor rechazo la conexion. Revisa el puerto (Outlook usa 587, Gmail 465 o 587).`;
    case 'ETIMEDOUT':
      return `${base} El servidor no respondio a tiempo. Revisa host/puerto y la conectividad de red.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `${base} No se pudo resolver el nombre del servidor. Revisa que este bien escrito.`;
    case 'EAUTH':
      return `Autenticacion rechazada por ${host}. Revisa el correo de la cuenta y que uses una app password.`;
    default:
      return `${base} ${err?.message ?? err}`;
  }
}
