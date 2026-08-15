import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import { resolve, normalize, sep } from 'path';
import { Resend } from 'resend';
import { createSmtpTransport } from '../common/mail/smtp.helper';
import {
  emailificarHtml,
  embedInlineImages,
} from '../common/mail/email-assets.helper';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { Ticket } from './ticket.entity';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');

interface AdjuntoTicket {
  id: string;
  url: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number | null;
  path: string;
}

interface AdjuntoEmail {
  filename: string;
  path: string;
  contentType: string;
}

interface AdjuntoResend {
  content: string;
  filename: string;
  contentId: string;
}

@Injectable()
export class TicketMailService {
  private readonly logger = new Logger(TicketMailService.name);
  private readonly resend: Resend;

  constructor(
    private readonly config: ConfigService,
    private readonly configuracion: ConfiguracionService,
  ) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }

  /**
   * Envia el correo de confirmacion del ticket al email del cliente.
   * El asunto y el cuerpo se toman de la configuracion global del admin
   * (variables {{...}}). Si el admin configuro SMTP (correo propio) se envia
   * por ahi; si no, se usa Resend con las variables de entorno.
   *
   * Devuelve `{ enviado, requerido }` para que el creador del ticket decida
   * si la falta de envio debe bloquear la generacion:
   *  - `enviado: true`  → el correo salio OK.
   *  - `enviado: false` con `requerido: false` → envio omitido por diseno
   *    (sin email del cliente, correo desactivado o ticket no-web sin copia).
   *  - `enviado: false` con `requerido: true` → el correo debia enviarse pero
   *    fallo (sin remitente configurado o error del proveedor).
   */
  async enviarTicket(
    ticket: Ticket,
    to: string,
  ): Promise<{ enviado: boolean; requerido: boolean }> {
    try {
      const email = String(to ?? '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { enviado: false, requerido: false };
      }

      const cfg = await this.configuracion.getGlobal();
      if (cfg.ticketEmailActivo === false) {
        return { enviado: false, requerido: false };
      }

      // Los tickets creados por el asesor (manual / WhatsApp, sourceType != web)
      // solo se envian si el admin activo "Enviar copia al cliente".
      if (ticket.sourceType !== 'web' && cfg.ticketEmailSendCopy !== true) {
        return { enviado: false, requerido: false };
      }

      const subject = this.resolveSubject(ticket, cfg);
      const html = this.buildHtml(ticket, cfg);
      const {
        html: htmlFinal,
        smtpAttachments,
        resendAttachments,
      } = await embedInlineImages(html);

      let extraSmtp: AdjuntoEmail[] = [];
      let extraResend: AdjuntoResend[] = [];
      if (cfg.ticketEmailAttachments === true) {
        const adjuntos = await this.colectarAdjuntos(ticket);
        extraSmtp = adjuntos.map((a) => ({
          filename: this.sanitizarNombreArchivo(a.originalName || a.fileName),
          path: a.path,
          contentType: a.mimeType || 'application/octet-stream',
        }));
        for (const a of adjuntos) {
          let buffer: Buffer | null = null;
          try {
            buffer = await readFile(a.path);
          } catch {
            buffer = null;
          }
          if (!buffer) continue;
          extraResend.push({
            content: buffer.toString('base64'),
            filename: this.sanitizarNombreArchivo(a.originalName || a.fileName),
            contentId: `ticket_${a.id}`,
          });
        }
      }
      const smtpFinal: Array<{
        filename: string;
        path: string;
        cid?: string;
        contentType?: string;
      }> = [...smtpAttachments, ...extraSmtp];
      const resendFinal = resendAttachments.concat(extraResend);

      const smtpUser = cfg.smtpUser?.trim() || '';
      const smtpHost = cfg.smtpHost?.trim() || '';
      const smtpPass = cfg.smtpPass?.trim() || '';
      const rawFrom =
        cfg.mailFrom?.trim() ||
        smtpUser ||
        String(this.config.get('MAIL_FROM') ?? '');
      const from = this.resolveFrom(rawFrom, cfg.ticketEmailSenderName);

      if (smtpHost && smtpUser && smtpPass) {
        await this.sendSmtp(
          cfg,
          smtpHost,
          smtpUser,
          smtpPass,
          from,
          ticket,
          email,
          subject,
          htmlFinal,
          smtpFinal,
        );
        return { enviado: true, requerido: true };
      }

      if (!from) {
        this.logger.warn(
          `Sin remitente configurado (SMTP vacio y MAIL_FROM no configurado). No se envio el correo del ticket ${ticket.codigo}.`,
        );
        return { enviado: false, requerido: true };
      }

      const { data, error } = await this.resend.emails.send({
        from,
        to: email,
        subject,
        html: htmlFinal,
        attachments: resendFinal.length ? resendFinal : undefined,
      });

      if (error) {
        this.logger.error(
          `Error enviando correo del ticket ${ticket.codigo}: ${error.message}`,
        );
        return { enviado: false, requerido: true };
      }

      this.logger.log(
        `Correo del ticket ${ticket.codigo} enviado a ${email}${data?.id ? ` (${data.id})` : ''}`,
      );
      return { enviado: true, requerido: true };
    } catch (err: any) {
      this.logger.error(
        `Error enviando correo del ticket ${ticket.codigo}: ${err?.message ?? err}`,
      );
      return { enviado: false, requerido: true };
    }
  }

  private async sendSmtp(
    cfg: Configuracion,
    host: string,
    user: string,
    pass: string,
    from: string,
    ticket: Ticket,
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{
      filename: string;
      path: string;
      cid?: string;
      contentType?: string;
    }>,
  ): Promise<void> {
    const { transporter } = await createSmtpTransport({
      host,
      port: Number(cfg.smtpPort) || 465,
      secure: cfg.smtpSecure !== false,
      user,
      pass,
    });
    try {
      const info = await transporter.sendMail({
        from: from || user,
        to,
        subject,
        html,
        attachments,
      });
      this.logger.log(
        `Correo del ticket ${ticket.codigo} enviado a ${to} via SMTP (${host})${info.messageId ? ` (${info.messageId})` : ''}`,
      );
    } finally {
      transporter.close();
    }
  }

  private resolveSubject(ticket: Ticket, cfg: Configuracion): string {
    const raw =
      cfg.ticketEmailAsunto?.trim() || 'Tu caso {{codigo}} fue registrado';
    return this.fill(raw, {
      codigo: this.escapeHtml(ticket.codigo),
      titulo: this.escapeHtml(ticket.titulo),
      prioridad: this.escapeHtml(this.prioridadLabel(ticket.priority)),
      fecha: this.escapeHtml(this.formatFecha(ticket.createdAt)),
      nombre: this.escapeHtml(ticket.clientName || 'Cliente'),
    }).trim();
  }

  private buildHtml(ticket: Ticket, cfg: Configuracion): string {
    const includeInfo = cfg.ticketEmailIncludeInfo !== false;
    const infoHtml = includeInfo ? this.buildInfoSection(ticket) : '';
    const convHtml = includeInfo
      ? this.buildConversationSection(ticket, cfg.ticketEmailAttachments === true)
      : '';

    const raw = cfg.ticketEmailCuerpo ?? '';
    const filled = this.fill(raw, {
      codigo: this.escapeHtml(ticket.codigo),
      titulo: this.escapeHtml(ticket.titulo),
      descripcion: this.escapeHtml(ticket.descripcion || ''),
      prioridad: this.escapeHtml(this.prioridadLabel(ticket.priority)),
      fecha: this.escapeHtml(this.formatFecha(ticket.createdAt)),
      nombre: this.escapeHtml(ticket.clientName || 'Cliente'),
      informacion: infoHtml,
      conversacion: convHtml,
      firma: 'Atentamente,<br/>Equipo de Soporte',
    });

    // Diseño completo del admin (editor visual): se envia tal cual se
    // personalizo, solo rellenando variables y absolutizando assets.
    if (/<!doctype html|<html[\s>]/i.test(raw)) {
      const normalized = emailificarHtml(filled);
      return this.absolutizarAssets(normalized);
    }

    // Legacy: cuerpo de texto plano → envoltorio estandar.
    const blocks = filled.split(/\n{2,}/);
    const cuerpoHtml = blocks
      .map(
        (b) =>
          `<p style="margin:0 0 14px;padding:0;">${b.replace(/\n/g, '<br/>')}</p>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px;background:#4338ca;">
              <p style="margin:0 0 4px;color:#c7d2fe;font-size:13px;">Registro de solicitud</p>
              <h1 style="margin:0;color:#ffffff;font-size:20px;">Tu caso ${this.escapeHtml(ticket.codigo)} fue registrado</h1>
              <p style="margin:6px 0 0;color:#e0e7ff;font-size:14px;">${this.escapeHtml(ticket.titulo)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;color:#1e293b;font-size:15px;line-height:1.6;">
              ${cuerpoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este correo se envio automaticamente al registrar tu solicitud. Si respondes a este mensaje, tu respuesta llega a nuestro equipo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private absolutizarAssets(html: string): string {
    const base = String(process.env.APP_URL ?? 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
    return html.replace(
      /(src|href)="(\/uploads\/[^"]+)"/g,
      (match, attr: string, path: string) => `${attr}="${base}${path}"`,
    );
  }

  /**
   * Compone el remitente como "Nombre visible" <email>. Si `raw` ya trae
   * formato "Nombre" <email> se extrae solo la direccion y se recompone con
   * el nombre configurado (que gana).
   */
  private resolveFrom(raw: string, senderName?: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const email = trimmed.replace(/^.*<([^<>]+)>.*$/, '$1').trim();
    const name = String(senderName ?? '')
      .replace(/["\\<>]/g, '')
      .trim();
    if (!email) return trimmed;
    return name ? `${name} <${email}>` : email;
  }

  private buildInfoSection(ticket: Ticket): string {
    const info = ticket.clientInfo ?? {};
    const candidates: Array<[string, string]> = [
      ['Identificacion', info['identificacion']],
      ['Rol', info['rol']],
      ['Colegio', info['colegio']],
      ['Tipo de solicitud', info['tipoSolicitud']],
      ['Telefono', info['phone'] ?? info['celular']],
      ['Correo', info['email']],
    ];

    const rows = candidates
      .filter(
        ([, val]) =>
          val !== undefined &&
          val !== null &&
          String(val).trim() !== '' &&
          String(val) !== 'null',
      )
      .map(
        ([label, val]) =>
          `<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;vertical-align:top;">${this.escapeHtml(label)}</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(String(val))}</td></tr>`,
      )
      .join('');

    if (!rows) return '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">${rows}</table>`;
  }

  private buildConversationSection(
    ticket: Ticket,
    mostrarAdjuntos: boolean,
  ): string {
    const conv = Array.isArray(ticket.conversation) ? ticket.conversation : [];
    if (!conv.length) return '';

    const items = conv
      .map((m: any) => {
        const role = m?.role === 'client' ? 'client' : 'advisor';
        const name = this.escapeHtml(
          m?.name || (role === 'client' ? 'Cliente' : 'Asesor'),
        );
        const content = this.escapeHtml(String(m?.content ?? ''));
        const time = m?.timestamp
          ? this.escapeHtml(this.formatFecha(m.timestamp))
          : '';
        const adjuntos = mostrarAdjuntos
          ? this.renderAdjuntos(
              Array.isArray(m?.attachments) ? m.attachments : [],
            )
          : '';
        const bg = role === 'client' ? '#f1f5f9' : '#e0e7ff';
        const border = role === 'client' ? '#cbd5e1' : '#a5b4fc';
        return `<div style="margin:10px 0;padding:10px 12px;background:${bg};border:1px solid ${border};border-radius:8px;">
  <div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong style="color:#334155;">${name}</strong>${time ? ` · ${time}` : ''}</div>
  <div style="font-size:14px;color:#1e293b;white-space:pre-wrap;">${content}</div>
  ${adjuntos}
</div>`;
      })
      .join('');

    return `<div>${items}</div>`;
  }

  /**
   * Renderiza los adjuntos de un mensaje dentro de la conversacion del correo:
   * las imagenes se incrustan como miniatura (embedInlineImages las convierte
   * a cid:) y el resto se muestra como chip con nombre y tamano, ambos
   * enlazados al archivo original.
   */
  private renderAdjuntos(adjuntos: any[]): string {
    const valids = adjuntos.filter(
      (a: any) => a && typeof a.url === 'string' && a.url.trim() !== '',
    );
    if (!valids.length) return '';

    return (
      '<div style="margin-top:8px;">' +
      valids
        .map((a: any) => {
          const url = this.escapeHtml(a.url);
          const name = this.escapeHtml(
            a.originalName || a.fileName || 'archivo',
          );
          const size = this.formatearTamaño(a.size);
          const mime = String(a.mimeType || '');
          if (/^image\//i.test(mime)) {
            return `<div style="margin:0 0 8px;">
  <a href="${url}" style="text-decoration:none;"><img src="${url}" alt="${name}" style="max-width:180px;height:auto;border:1px solid #e2e8f0;border-radius:6px;display:block;margin-bottom:2px;"/></a>
  <a href="${url}" style="font-size:12px;color:#2563eb;text-decoration:underline;">${name}${size ? ` (${size})` : ''}</a>
</div>`;
          }
          const ext = this.extensionDe(normalize(a.fileName || a.originalName || ''));
          return `<div style="margin:0 0 6px;display:inline-flex;align-items:center;gap:8px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;max-width:100%;">
  <span style="font-size:11px;font-weight:bold;color:#2563eb;">${this.escapeHtml(ext)}</span>
  <div>
    <a href="${url}" style="display:block;font-size:13px;color:#1e293b;text-decoration:none;font-weight:600;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</a>
    ${size ? `<span style="font-size:11px;color:#64748b;">${size}</span>` : ''}
  </div>
</div>`;
        })
        .join('') +
      '</div>'
    );
  }

  /**
   * Recolecta los adjuntos reales del ticket (conversacion) y resuelve su ruta
   * local en disco. Deduplica por URL y omite archivos inexistentes para que
   * nunca falle el envio por adjuntos borrados.
   */
  private async colectarAdjuntos(ticket: Ticket): Promise<AdjuntoTicket[]> {
    const conv = Array.isArray(ticket.conversation) ? ticket.conversation : [];
    const seen = new Set<string>();
    const result: AdjuntoTicket[] = [];

    for (const m of conv) {
      let items: any[] = Array.isArray(m?.attachments) ? m.attachments : [];
      if (!items.length && typeof m?.mediaUrl === 'string' && m.mediaUrl) {
        items = [
          {
            url: m.mediaUrl,
            fileName: m.mediaUrl.split('/').pop() || null,
            originalName: m.mediaUrl.split('/').pop() || null,
            mimeType: m.mimeType || 'application/octet-stream',
            size: m.size ?? m.fileSize ?? null,
          },
        ];
      }

      for (const a of items) {
        const url = a?.url;
        if (!url || typeof url !== 'string' || seen.has(url)) continue;
        seen.add(url);

        const resuelto = this.resolverRutaAdjunto(url);
        if (!resuelto) continue;

        try {
          await access(resuelto.path);
        } catch {
          continue;
        }

        result.push({
          id: a.id || url,
          url,
          fileName: String(a.fileName || resuelto.fileName || 'archivo'),
          originalName: String(a.originalName || a.fileName || 'archivo'),
          mimeType: String(a.mimeType || 'application/octet-stream'),
          size: a.size != null ? Number(a.size) : null,
          path: resuelto.path,
        });
      }
    }

    return result;
  }

  /**
   * Convierte una URL de adjunto (/uploads/... o absoluta) en la ruta local
   * bajo el directorio de uploads. Devuelve null si la URL no apunta a
   * uploads o intenta escapar del directorio.
   */
  private resolverRutaAdjunto(url: string): {
    path: string;
    fileName: string;
  } | null {
    const cleanUrl = String(url).split(/[?#]/)[0];
    const m = cleanUrl.match(/\/uploads\/(.+)$/);
    if (!m) return null;
    const safe = normalize(m[1])
      .replace(/^(\.\.[/\\])+/, '')
      .replace(/^[/\\]+/, '');
    const filePath = resolve(UPLOADS_ROOT, safe);
    const rootWithSep = UPLOADS_ROOT.endsWith(sep)
      ? UPLOADS_ROOT
      : UPLOADS_ROOT + sep;
    if (!filePath.startsWith(rootWithSep)) return null;
    return {
      path: filePath,
      fileName: safe.split(/[\\/]/).pop() || 'archivo',
    };
  }

  private sanitizarNombreArchivo(value: string): string {
    const clean = String(value ?? '')
      .replace(/[/\\]/g, '_')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    return clean || 'archivo';
  }

  private extensionDe(fileName: string): string {
    const m = String(fileName || '').match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toUpperCase() : 'FILE';
  }

  private formatearTamaño(size: number | null | undefined): string {
    if (size == null || Number.isNaN(Number(size))) return '';
    const bytes = Number(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private fill(text: string, tokens: Record<string, string>): string {
    return text.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (match, key: string) => {
        const value = tokens[key];
        return value !== undefined ? value : match;
      },
    );
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private prioridadLabel(priority: string | null | undefined): string {
    switch (priority) {
      case 'critical':
        return 'Critica';
      case 'high':
        return 'Alta';
      case 'low':
        return 'Baja';
      default:
        return 'Media';
    }
  }

  private formatFecha(value: string | Date | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
