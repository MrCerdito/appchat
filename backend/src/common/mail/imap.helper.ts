import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import axios from 'axios';

export interface ImapOpciones {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Host/port manuales de IMAP configurados por el usuario (override). */
  imapHost?: string;
  imapPort?: number;
  /** Token OAuth2 (XOAUTH2) para cuentas Microsoft 365 sin auth básica. */
  accessToken?: string;
}

let oauthCache: { accessToken: string; expiresOn: number } | null = null;

/**
 * Obtiene (con cache en memoria) el access token OAuth2 por flujo client
 * credentials de una App Registration de Azure, con el scope que requiere
 * IMAP de Exchange Online (outlook.office.com). Usado para XOAUTH2.
 */
export async function obtenerTokenOAuth2Imap(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const now = Date.now();
  if (oauthCache && oauthCache.expiresOn > now) {
    return oauthCache.accessToken;
  }
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  try {
    const res = await axios.post(
      url,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://outlook.office.com/.default',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      },
    );
    const data = res.data;
    const accessToken = String(data?.access_token ?? '');
    const expiresIn = Number(data?.expires_in) || 3000;
    if (!accessToken) return null;
    oauthCache = {
      accessToken,
      expiresOn: now + (expiresIn - 60) * 1000,
    };
    return accessToken;
  } catch {
    return null;
  }
}

export interface RebotadoInfo {
  email: string;
  motivo: string;
  comunicadoId?: string;
}

export interface ResultadoImap {
  procesados: number;
  rebotados: RebotadoInfo[];
  error?: string;
}

/**
 * Deriva el servidor/puerto IMAP del host SMTP configurado. Si se indican
 * host/puerto manuales, se respetan esos. El usuario de IMAP es el mismo de
 * SMTP en la mayoria de los proveedores.
 */
export function resolverConfigImap(opts: ImapOpciones): {
  host: string;
  port: number;
  user: string;
  pass: string;
} {
  const manualHost = String(opts.imapHost ?? '').trim();
  const manualPort = Number(opts.imapPort) || 0;

  const h = opts.host.toLowerCase();
  let host = manualHost || 'imap.' + h;
  let port = manualPort || 993;

  if (!manualHost) {
    if (h.includes('gmail')) host = 'imap.gmail.com';
    else if (
      h.includes('outlook') ||
      h.includes('hotmail') ||
      h.includes('live.com') ||
      h.includes('office365') ||
      h.includes('microsoft.com')
    )
      host = 'outlook.office365.com';
    else if (h.includes('zoho')) host = 'imap.zoho.com';
    else if (h.includes('hostinger')) host = 'imap.hostinger.com';
    else if (h.includes('yahoo')) host = 'imap.mail.yahoo.com';
  }
  if (!manualPort) {
    if (host === 'imap.gmail.com' || host === 'outlook.office365.com')
      port = 993;
  }

  return {
    host,
    port: Math.max(1, Math.min(65535, port)),
    user: opts.user,
    pass: opts.pass,
  };
}

const ASUNTOS_REBOTE =
  /delivery (status|failure|failed)|undeliverable|returned mail|returned to sender|mail (delivery|server) (failed|failure)|failure notice|non[- ]?delivery|not delivered|bounce|address rejected|mailer[- ]daemon/iu;

const esAsuntoDeRebote = (subject: string): boolean =>
  ASUNTOS_REBOTE.test(String(subject ?? ''));

const normalizarEmail = (v: string): string =>
  String(v ?? '')
    .trim()
    .replace(/^<+/g, '')
    .replace(/>+$/g, '')
    .toLowerCase();

function extraerEmail(texto: string): string {
  const m = String(texto ?? '').match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  );
  return m ? normalizarEmail(m[1]) : '';
}

function extraerEmailDelCabezal(valor: string): string {
  const limpio = String(valor ?? '')
    .trim()
    .replace(/^[^<]*<|>.*$/g, '');
  return normalizarEmail(limpio);
}

function extraerMotivo(texto: string): string {
  const t = String(texto ?? '');
  const m =
    t.match(/(?:diagnostic[ -]?code|smtp;)\s*:?\s*([^\r\n]{0,220})/i) ||
    t.match(/(?:status|action)\s*:?\s*([45]\.[\d.]+[^\r\n]{0,160})/i) ||
    t.match(/[45]\.\d{1,3}\.\d{1,3}[^\r\n]{0,180}/);
  if (m) return m[1]?.trim() ?? '';
  const linea = t
    .split(/\r?\n/)
    .find((l) =>
      /rejected|failed|does not exist|not exist|full|quota|spam/i.test(l),
    );
  return linea?.trim() ?? '';
}

function extraerMotivoLegible(detalle: string): string {
  if (!detalle)
    return 'Rebotado por el servidor del destinatario (sin detalle).';
  const d = detalle.toLowerCase();
  if (
    /5\.1\.1|no such user|user unknown|does not exist|not exist|recipient.*rejected|invalid.*address/i.test(
      d,
    )
  )
    return 'Casilla de destino inexistente o rechazada por el servidor.';
  if (/5\.2\.2|quota|mailbox.*full|over.*(quota|limit)/i.test(d))
    return 'Casilla de destino llena (superó la cuota de almacenamiento).';
  if (/5\.7\.1|5\.7\.350|5\.7\.14|blocked|policy|spam|rate limit/i.test(d))
    return 'Rechazado por el servidor: el destinatario o el dominio bloqueó el correo (spam/política).';
  if (/^[45]\.\d{1,3}\.\d{1,3}/.test(detalle))
    return `Rebote del servidor (${detalle.trim()}).`;
  return detalle.trim().slice(0, 220);
}

/**
 * Conecta por IMAP a la bandeja del remitente y procesa los mensajes de
 * rebote (NDR) NO leídos: extrae el email fallido y el motivo, y marca como
 * visto cada mensaje procesado para no re-procesarlo.
 */
export async function revisarBandejaImap(
  opts: ImapOpciones,
): Promise<ResultadoImap> {
  const cfg = resolverConfigImap(opts);
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: opts.accessToken
      ? { user: cfg.user, pass: '', accessToken: opts.accessToken }
      : { user: cfg.user, pass: cfg.pass },
    logger: false,
    connectionTimeout: 20000,
    socketTimeout: 60000,
  });

  const resultado: ResultadoImap = { procesados: 0, rebotados: [] };

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX');
    if (!mailbox || mailbox.exists === 0) return resultado;

    const uids = await client.search({ seen: false }, { uid: true });
    if (!Array.isArray(uids) || uids.length === 0) return resultado;

    const vistos: number[] = [];

    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(
          `${uid}`,
          { uid: true, source: true },
          { uid: true },
        );
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const asunto = parsed.subject || '';
        if (!esAsuntoDeRebote(asunto)) continue;

        const cuerpo = `${parsed.text || ''}\n${(parsed.textAsHtml || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')}`;

        let email = '';
        const failedHeaders = parsed.headers?.get('x-failed-recipients');
        if (failedHeaders) {
          email = extraerEmailDelCabezal(String(failedHeaders));
        }
        if (!email) email = extraerEmail(cuerpo);
        if (!email && parsed.headers?.get('x-rc-email')) {
          email = extraerEmailDelCabezal(
            String(parsed.headers.get('x-rc-email')),
          );
        }
        if (!email) continue;

        const comunicadoHeader = parsed.headers?.get('x-rc-comunicado');
        const detalle =
          extraerMotivo(cuerpo) ||
          String(parsed.text || '')
            .replace(/\s+/g, ' ')
            .slice(0, 220);

        resultado.rebotados.push({
          email,
          motivo: extraerMotivoLegible(detalle),
          comunicadoId: comunicadoHeader ? String(comunicadoHeader) : undefined,
        });
        vistos.push(uid);
      } catch {
        // Un mensaje con error no debe cortar el resto del lote.
      }
    }

    resultado.procesados = uids.length;

    if (vistos.length > 0) {
      await client.messageFlagsAdd(vistos, ['\\Seen'], { uid: true });
    }
  } catch (err: any) {
    resultado.error = String(err?.message ?? err);
  } finally {
    await client.logout().catch(() => {});
  }

  return resultado;
}
