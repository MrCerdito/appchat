import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { createSmtpTransport } from '../common/mail/smtp.helper';
import {
  emailificarHtml,
  embedInlineImages,
} from '../common/mail/email-assets.helper';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { Ticket } from './ticket.entity';

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
   * por ahi; si no, se usa Resend con las variables de entorno. No se bloquea
   * la creacion del ticket.
   */
  async enviarTicket(ticket: Ticket, to: string): Promise<void> {
    try {
      const email = String(to ?? '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

      const cfg = await this.configuracion.getGlobal();
      if (cfg.ticketEmailActivo === false) return;

      const subject = this.resolveSubject(ticket, cfg);
      const html = this.buildHtml(ticket, cfg);
      const { html: htmlFinal, smtpAttachments, resendAttachments } =
        await embedInlineImages(html);

      const smtpUser = cfg.smtpUser?.trim() || '';
      const smtpHost = cfg.smtpHost?.trim() || '';
      const smtpPass = cfg.smtpPass?.trim() || '';
      const from =
        cfg.mailFrom?.trim() || smtpUser || String(this.config.get('MAIL_FROM') ?? '');

      if (smtpHost && smtpUser && smtpPass) {
        await this.sendSmtp(cfg, smtpHost, smtpUser, smtpPass, from, ticket, email, subject, htmlFinal, smtpAttachments);
        return;
      }

      if (!from) {
        this.logger.warn(
          `Sin remitente configurado (SMTP vacio y MAIL_FROM no configurado). No se envio el correo del ticket ${ticket.codigo}.`,
        );
        return;
      }

      const { data, error } = await this.resend.emails.send({
        from,
        to: email,
        subject,
        html: htmlFinal,
        attachments: resendAttachments.length ? resendAttachments : undefined,
      });

      if (error) {
        this.logger.error(
          `Error enviando correo del ticket ${ticket.codigo}: ${error.message}`,
        );
      } else {
        this.logger.log(
          `Correo del ticket ${ticket.codigo} enviado a ${email}${data?.id ? ` (${data.id})` : ''}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error enviando correo del ticket ${ticket.codigo}: ${err?.message ?? err}`,
      );
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
    attachments?: Array<{ filename: string; path: string; cid: string; contentType?: string }>,
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
    const raw = cfg.ticketEmailAsunto?.trim() || 'Tu caso {{codigo}} fue registrado';
    return this.fill(raw, {
      codigo: this.escapeHtml(ticket.codigo),
      titulo: this.escapeHtml(ticket.titulo),
      prioridad: this.escapeHtml(this.prioridadLabel(ticket.priority)),
      fecha: this.escapeHtml(this.formatFecha(ticket.createdAt)),
      nombre: this.escapeHtml(ticket.clientName || 'Cliente'),
    }).trim();
  }

  private buildHtml(ticket: Ticket, cfg: Configuracion): string {
    const infoHtml = this.buildInfoSection(ticket);
    const convHtml = this.buildConversationSection(ticket);

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
      .map((b) => `<p style="margin:0 0 14px;padding:0;">${b.replace(/\n/g, '<br/>')}</p>`)
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
    const base = String(process.env.APP_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
    return html.replace(
      /(src|href)="(\/uploads\/[^"]+)"/g,
      (match, attr: string, path: string) => `${attr}="${base}${path}"`,
    );
  }

  private buildInfoSection(ticket: Ticket): string {
    const info = (ticket.clientInfo ?? {}) as Record<string, any>;
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

  private buildConversationSection(ticket: Ticket): string {
    const conv = Array.isArray(ticket.conversation) ? ticket.conversation : [];
    if (!conv.length) return '';

    const items = conv
      .map((m: any) => {
        const role = m?.role === 'client' ? 'client' : 'advisor';
        const name = this.escapeHtml(
          m?.name || (role === 'client' ? 'Cliente' : 'Asesor'),
        );
        const content = this.escapeHtml(String(m?.content ?? ''));
        const time = m?.timestamp ? this.escapeHtml(this.formatFecha(m.timestamp)) : '';
        const bg = role === 'client' ? '#f1f5f9' : '#e0e7ff';
        const border = role === 'client' ? '#cbd5e1' : '#a5b4fc';
        return `<div style="margin:10px 0;padding:10px 12px;background:${bg};border:1px solid ${border};border-radius:8px;">
  <div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong style="color:#334155;">${name}</strong>${time ? ` · ${time}` : ''}</div>
  <div style="font-size:14px;color:#1e293b;white-space:pre-wrap;">${content}</div>
</div>`;
      })
      .join('');

    return `<div>${items}</div>`;
  }

  private fill(text: string, tokens: Record<string, string>): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
      const value = tokens[key];
      return value !== undefined ? value : match;
    });
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
