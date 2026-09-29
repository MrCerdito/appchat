import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Comunicado, Destinatario } from './entities/comunicado.entity';
import { ComunicadoTemplate } from './entities/comunicado-template.entity';
import { ComunicadoTemplateLog } from './entities/comunicado-template-log.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { PiCampo } from '../perfil-institucional/entities/pi-campo.entity';
import { PiValor } from '../perfil-institucional/entities/pi-valor.entity';
import { User } from '../auth/entities/user.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
import {
  ConfiguracionService,
  metodoCorreoActivo,
} from '../configuracion/configuracion.service';
import {
  credencialMailsenderValida,
  enviarCorreoMailsender,
  MailsenderCredencial,
  normalizarCredencialMailsender,
} from '../common/mail/mailsender.helper';
import { createSmtpTransport } from '../common/mail/smtp.helper';
import { embedInlineImages } from '../common/mail/email-assets.helper';

const MAX_LOG_FRAGMENT = 600;

/**
 * Resuelve la URL base publica del backend en este orden: APP_URL (se ignora si
 * es solo el placeholder localhost:3001), BACKEND_URL/PUBLIC_URL, host del
 * request (X-Forwarded-Host/Host). Evita quedarse clavado en localhost:3001
 * cuando el despliegue no setea APP_URL (rompia las imagenes y el tracking).
 */
function resolverBaseUrl(
  config: ConfigService,
  req?: { headers?: Record<string, string | undefined> },
): string {
  const appUrl = String(
    config.get<string>('APP_URL') ?? process.env.APP_URL ?? '',
  ).trim();
  if (
    /^https?:\/\//i.test(appUrl) &&
    !/^http:\/\/localhost(?::\d+)?$/.test(appUrl)
  ) {
    return appUrl.replace(/\/+$/, '');
  }
  for (const candidato of [process.env.BACKEND_URL, process.env.PUBLIC_URL]) {
    const limpio = String(candidato ?? '').trim();
    if (/^https?:\/\//i.test(limpio)) return limpio.replace(/\/+$/, '');
  }
  const headers = req?.headers;
  if (headers) {
    const forwardedHost = String(headers['x-forwarded-host'] || '').trim();
    const forwardedProto = String(
      headers['x-forwarded-proto'] || '',
    ).trim();
    let host = forwardedHost || String(headers['host'] || '').trim();
    if (host) {
      if (!/^https?:\/\//i.test(host)) {
        const proto =
          forwardedProto && /^https?:\/\//i.test(forwardedProto)
            ? forwardedProto
            : `${forwardedProto || 'http'}://`;
        host = `${proto}${host}`;
      }
      return host.replace(/\/+$/, '');
    }
  }
  return 'http://localhost:3001';
}

function truncarLog(texto: string, max = MAX_LOG_FRAGMENT): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max)}…`;
}

@Injectable()
export class ComunicadosService {
  private readonly logger = new Logger(ComunicadosService.name);

  constructor(
    @InjectRepository(ComunicadoEvento)
    private readonly eventoRepo: Repository<ComunicadoEvento>,
    @InjectRepository(Comunicado)
    private readonly comunicadoRepo: Repository<Comunicado>,
    @InjectRepository(ComunicadoTemplate)
    private readonly templateRepo: Repository<ComunicadoTemplate>,
    @InjectRepository(ComunicadoTemplateLog)
    private readonly templateLogRepo: Repository<ComunicadoTemplateLog>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    @InjectRepository(PiCampo)
    private readonly piCampoRepo: Repository<PiCampo>,
    @InjectRepository(PiValor)
    private readonly piValorRepo: Repository<PiValor>,
    private readonly config: ConfigService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async findAll(userId: string, role: string): Promise<Comunicado[]> {
    if (role === 'admin') {
      return this.comunicadoRepo.find({
        relations: { sender: true },
        order: { createdAt: 'DESC' },
      });
    }
    return this.comunicadoRepo.find({
      where: { sender: { id: userId } },
      relations: { sender: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Comunicado> {
    const c = await this.comunicadoRepo.findOne({
      where: { id },
      relations: { sender: true },
    });
    if (!c) throw new NotFoundException('Comunicado no encontrado');
    return c;
  }

  private assertCanManage(c: Comunicado, user: User): void {
    if (user.role !== 'admin' && c.sender?.id !== user.id) {
      throw new ForbiddenException(
        'Acceso denegado: solo puedes gestionar tus propios comunicados',
      );
    }
  }

  async saveDraft(
    asunto: string,
    cuerpo: string,
    destinatarios: Destinatario[],
    user: User,
    design: unknown[] | null = null,
  ): Promise<Comunicado> {
    const c = this.comunicadoRepo.create({
      asunto,
      cuerpo,
      design,
      destinatarios,
      sender: user,
      senderName: user.name,
      status: 'draft',
    });
    return this.comunicadoRepo.save(c);
  }

  async updateDraft(
    id: string,
    asunto: string,
    cuerpo: string,
    destinatarios: Destinatario[],
    design: unknown[] | null = null,
    user: User,
  ): Promise<Comunicado> {
    const c = await this.findOne(id);
    this.assertCanManage(c, user);
    if (c.status === 'sent')
      throw new BadRequestException('No se puede editar un comunicado enviado');
    c.asunto = asunto;
    c.cuerpo = cuerpo;
    c.design = design;
    c.destinatarios = destinatarios.map((d) => ({
      email: d.email,
      nombre: d.nombre,
    }));
    return this.comunicadoRepo.save(c);
  }

  async send(
    id: string,
    user: User,
    req?: { headers?: Record<string, string | undefined> },
  ): Promise<{
    id: string;
    status: 'sending';
    total: number;
    proveedor: string;
    limiteDia: number;
    enviadosHoy: number;
    restanteDisponible: number;
  }> {
    const c = await this.findOne(id);
    this.assertCanManage(c, user);
    if (c.status === 'sent') throw new BadRequestException('Ya fue enviado');
    if (c.status === 'sending')
      throw new BadRequestException('El envío ya está en curso');
    if (!c.destinatarios.length)
      throw new BadRequestException('Sin destinatarios');

    // Normaliza correos multiples: un colegio puede tener varios correos
    // separados por |, , o ; y duplicados. Un destinatario por correo.
    const vistos = new Set<string>();
    const normalizados: Destinatario[] = [];
    for (const d of c.destinatarios) {
      const correos = String(d.email ?? '')
        .split(/[|,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const email of correos) {
        const clave = email.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        normalizados.push({ email, nombre: d.nombre });
      }
    }
    c.destinatarios = normalizados;
    if (!c.destinatarios.length)
      throw new BadRequestException('Sin destinatarios válidos');

    const baseUrl = resolverBaseUrl(this.config, req);
    const cfg = await this.configuracion.getGlobal();
    const mailRedirectTo = String(
      process.env.MAIL_REDIRECT_TO ?? this.config.get('MAIL_REDIRECT_TO') ?? '',
    ).trim();
    if (mailRedirectTo) {
      this.logger.warn(
        `MAIL_REDIRECT_TO activo: todos los correos de comunicados se redirigen a ${mailRedirectTo} en vez de a los destinatarios reales`,
      );
    }

    const credencial = normalizarCredencialMailsender(
      cfg.mailsenderCredencial as Record<string, unknown> | null | undefined,
    );
    const metodo = metodoCorreoActivo(cfg);
    const esSmtp = metodo === 'smtp';
    const smtpHost = cfg.smtpHost?.trim() || '';
    const smtpUser = cfg.smtpUser?.trim() || '';
    const smtpPass = cfg.smtpPass?.trim() || '';
    const smtpListo = Boolean(smtpHost && smtpUser && smtpPass);

    if (esSmtp) {
      if (!smtpListo) {
        throw new BadRequestException(
          'Para enviar por SMTP configura el host, usuario y clave del servidor SMTP en Configuración > Correo.',
        );
      }
    } else if (!credencial || !credencialMailsenderValida(credencial)) {
      throw new BadRequestException(
        'Configura la credencial del correo en Configuración (email, usuario y password del servicio Mailsender) antes de enviar.',
      );
    }

    const mailsenderUrl = cfg.mailsenderUrl?.trim() || '';
    const modo = cfg.mailsenderModo === 'lote' ? 'lote' : 'individual';
    const total = c.destinatarios.length;

    // Lote diario segun el proveedor activo (Mailsender API o SMTP directo).
    const proveedor = esSmtp
      ? this.proveedorSmtp(smtpHost)
      : this.proveedorMailsender(credencial as MailsenderCredencial);
    const limiteDia = esSmtp
      ? this.limiteDiarioSmtp(smtpHost)
      : this.limiteDiarioMailsender(credencial as MailsenderCredencial);
    const enviadosHoy = await this.contarEnviadosHoy();
    const restanteDisponible = Math.max(0, limiteDia - enviadosHoy);

    if (restanteDisponible <= 0) {
      throw new BadRequestException(
        `Alcanzaste el límite diario (${limiteDia} correos) de tu proveedor ${proveedor}. Los envíos se podrán retomar mañana.`,
      );
    }
    if (total > restanteDisponible) {
      throw new BadRequestException(
        `Este comunicado tiene ${total} destinatarios pero hoy solo quedan ${restanteDisponible} correos disponibles (límite ${limiteDia}/día de ${proveedor}). Reducí la lista o reintentalo mañana.`,
      );
    }

    // Redireccion de correos SOLO explicita y opt-in (MAIL_REDIRECT_TO).
    // Sin esa variable se envia a los destinatarios reales ("Para") siempre.
    const destinos = c.destinatarios.map((d) => ({
      ...d,
      emailFinal: mailRedirectTo || d.email,
    }));

    c.destinatarios = c.destinatarios.map((d) => ({
      email: d.email,
      nombre: d.nombre,
    }));
    c.status = 'sending';
    c.totalEnviados = 0;
    await this.comunicadoRepo.save(c);

    void this.ejecutarEnvio(
      c,
      destinos,
      baseUrl,
      credencial as MailsenderCredencial,
      mailsenderUrl,
      modo,
      esSmtp ? 'smtp' : 'mailsender',
    ).catch((err: any) => {
      this.logger.error(
        `Fallo global al enviar el comunicado ${c.id}: ${String(err?.message ?? err)}`,
      );
      void this.comunicadoRepo
        .update({ id: c.id }, { status: 'failed' })
        .catch(() => {});
    });

    return {
      id: c.id,
      status: 'sending',
      total,
      proveedor,
      limiteDia,
      enviadosHoy,
      restanteDisponible: restanteDisponible - total,
    };
  }

  /**
   * Envia una prueba del correo (asunto + cuerpo actuales) a una lista corta
   * de correos SIN crear comunicado ni consumir cuota diaria. Reusa el canal
   * activo (Mailsender o SMTP directo) y las URLs publicas de imagenes.
   */
  async enviarPrueba(
    emails: string[],
    asunto: string,
    cuerpo: string,
    req?: { headers?: Record<string, string | undefined> },
  ): Promise<{ ok: boolean; enviados: number; mensaje: string }> {
    const destinos = this.normalizarTestEmails(emails);
    if (!destinos.length)
      throw new BadRequestException(
        'Ingresa al menos un correo de prueba válido para enviar la prueba.',
      );

    const asuntoPrueba = /^\(PRUEBA\)\s+/i.test(asunto)
      ? asunto
      : `(PRUEBA) ${asunto}`;

    const baseUrl = resolverBaseUrl(this.config, req);
    const cfg = await this.configuracion.getGlobal();
    const credencial = normalizarCredencialMailsender(
      cfg.mailsenderCredencial as Record<string, unknown> | null | undefined,
    );
    const esSmtp = metodoCorreoActivo(cfg) === 'smtp';
    const smtpHost = cfg.smtpHost?.trim() || '';
    const smtpUser = cfg.smtpUser?.trim() || '';
    const smtpPass = cfg.smtpPass?.trim() || '';
    const smtpListo = Boolean(smtpHost && smtpUser && smtpPass);

    if (esSmtp) {
      if (!smtpListo)
        throw new BadRequestException(
          'Para enviar por SMTP configura el host, usuario y clave en Configuración > Correo.',
        );
    } else if (!credencial || !credencialMailsenderValida(credencial)) {
      throw new BadRequestException(
        'Configura la credencial de correo del servicio en Configuración antes de enviar la prueba.',
      );
    }

    const fallos: string[] = [];
    let enviados = 0;

    if (esSmtp) {
      const { transporter } = await createSmtpTransport({
        host: smtpHost,
        port: Number(cfg.smtpPort) || 587,
        secure: cfg.smtpSecure !== false,
        user: smtpUser,
        pass: smtpPass,
      });
      const from =
        cfg.mailFrom?.trim() ||
        smtpUser ||
        String(this.config.get('MAIL_FROM') ?? '');
      const senderName = cfg.ticketEmailSenderName?.trim() || 'Soporte';
      const remitente = from ? `${senderName} <${from}>` : '';
      const { html: htmlEmbebido, smtpAttachments } = await embedInlineImages(
        cuerpo,
      );
      const htmlFinal = this.absolutizarUploads(htmlEmbebido, baseUrl);
      try {
        for (const email of destinos) {
          try {
            await transporter.sendMail({
              from: remitente,
              to: email,
              subject: asuntoPrueba,
              html: htmlFinal,
              attachments: smtpAttachments.length
                ? smtpAttachments
                : undefined,
            });
            enviados++;
          } catch (err: any) {
            fallos.push(
              `${email}: ${String(err?.message ?? err).slice(0, 200)}`,
            );
          }
        }
      } finally {
        transporter.close();
      }
      if (!enviados)
        throw new BadRequestException(
          `La prueba no se envió. ${fallos.join(' | ')}`,
        );
      return {
        ok: true,
        enviados,
        mensaje: fallos.length
          ? `Prueba enviada a ${enviados} correo(s) via SMTP. Fallaron: ${fallos.join(' | ')}`
          : `Prueba enviada a ${enviados} correo(s) via SMTP.`,
      };
    }

    const mailsenderUrl = cfg.mailsenderUrl?.trim() || '';
    const htmlFinal = this.absolutizarUploads(cuerpo, baseUrl);
    for (const email of destinos) {
      const res = await enviarCorreoMailsender({
        baseUrl: mailsenderUrl,
        credencial: credencial as MailsenderCredencial,
        asunto: asuntoPrueba,
        correosNormales: email,
        html: htmlFinal,
      });
      if (res.ok) enviados++;
      else fallos.push(`${email}: ${res.message}`);
    }
    if (!enviados)
      throw new BadRequestException(
        `La prueba no se envió. ${fallos.join(' | ')}`,
      );
    return {
      ok: true,
      enviados,
      mensaje: fallos.length
        ? `Prueba enviada a ${enviados} correo(s). Fallaron: ${fallos.join(' | ')}`
        : `Prueba enviada a ${enviados} correo(s) via ${this.proveedorMailsender(credencial as MailsenderCredencial)}.`,
    };
  }

  private normalizarTestEmails(emails: string[]): string[] {
    const vistos = new Set<string>();
    const fuera: string[] = [];
    for (const e of Array.isArray(emails) ? emails : []) {
      const correos = String(e ?? '')
        .split(/[|,;]+/)
        .map((s) => s.trim().replace(/^["']+|["']+$/g, ''))
        .filter(Boolean);
      for (const c of correos) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) continue;
        const clave = c.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        fuera.push(c);
        if (fuera.length >= 50) return fuera;
      }
    }
    return fuera;
  }

  /**
   * Correos de prueba guardados globalmente (compartidos por todos los
   * asesores). Los lee de la configuracion global.
   */
  async getTestCorreos(): Promise<string[]> {
    return this.configuracion.getComunicadoTestEmails();
  }

  /**
   * Guarda globalmente los perfiles de correo de prueba. Devuelve la lista
   * normalizada que quedo persistida.
   */
  async guardarTestCorreos(emails: string[]): Promise<string[]> {
    const limpios = this.normalizarTestEmails(emails);
    const guardados = await this.configuracion.saveComunicadoTestEmails(limpios);
    if (guardados.length && guardados.length !== limpios.length) {
      this.logger.warn(
        `Se persistieron ${guardados.length} correos de prueba (esperados ${limpios.length})`,
      );
    }
    return guardados;
  }

  /**
   * Ejecuta el envio por pool (1 correo por destinatario) o en una sola llamada
   * (modo lote) guardando el progreso para que el frontend muestre el contador
   * decreciente en vivo. Al terminar fija el estado final y totalEnviados.
   */
  private async ejecutarEnvio(
    c: Comunicado,
    destinos: Array<Destinatario & { emailFinal: string }>,
    baseUrl: string,
    credencial: MailsenderCredencial,
    mailsenderUrl: string,
    modo: 'individual' | 'lote',
    canal: 'mailsender' | 'smtp',
  ): Promise<void> {
    try {
      if (canal === 'smtp') {
        await this.sendPoolSmtp(destinos, c, baseUrl);
      } else {
        await this.sendWithPool(
          destinos,
          c,
          baseUrl,
          credencial,
          mailsenderUrl,
          modo,
        );
      }

      const enviados = c.destinatarios.filter(
        (d) => d.sendStatus === 'ok',
      ).length;
      c.status = enviados > 0 ? 'sent' : 'failed';
      c.sentAt = enviados > 0 ? new Date() : null;
      c.totalEnviados = enviados;
      await this.comunicadoRepo.save(c);
      this.logger.log(
        `Comunicado ${c.id} finalizado: ${enviados}/${c.destinatarios.length} enviados (${c.status})`,
      );
    } catch (err: any) {
      this.logger.error(
        `Fallo al ejecutar envio del comunicado ${c.id}: ${String(err?.message ?? err)}`,
      );
      c.status = 'failed';
      await this.comunicadoRepo.save(c).catch(() => {});
    }
  }

  private async sendWithPool(
    destinos: Array<Destinatario & { emailFinal: string }>,
    c: Comunicado,
    baseUrl: string,
    credencial: MailsenderCredencial,
    mailsenderUrl: string,
    modo: 'individual' | 'lote',
  ): Promise<void> {
    if (modo === 'lote') {
      await this.enviarEnLote(destinos, c, baseUrl, credencial, mailsenderUrl);
      return;
    }

    const CONCURRENCIA = 3;
    let index = 0;

    const esTransitorio = (msg: string): boolean =>
      /(socket|connection|timed? ?out|reset|temporarily unusable|try again|no respondio a tiempo|ECONN|ESOCKET|ETIMEDOUT)/i.test(
        String(msg ?? ''),
      );

    const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const trabajadores = Array.from(
      { length: Math.min(CONCURRENCIA, destinos.length) },
      async () => {
        while (index < destinos.length) {
          const pos = index++;
          const dest = destinos[pos];
          const redirigido = dest.emailFinal !== dest.email;

          try {
            const pixelUrl = `${baseUrl}/track/open/${c.id}/${encodeURIComponent(dest.email)}`;
            const cuerpoFinal = this.insertarPixel(
              this.injectTracking(c.cuerpo, c.id, dest.email, baseUrl),
              pixelUrl,
            );
            const htmlFinal = this.absolutizarUploads(cuerpoFinal, baseUrl);

            let mensajeOk = '';
            for (let intento = 1; intento <= 2; intento++) {
              const res = await enviarCorreoMailsender({
                baseUrl: mailsenderUrl,
                credencial,
                asunto: c.asunto,
                correosNormales: dest.emailFinal,
                html: htmlFinal,
              });
              if (res.ok) {
                mensajeOk = res.message;
                break;
              }
              if (intento === 1 && esTransitorio(res.message)) {
                this.logger.warn(
                  `Comunicado ${c.id} (${c.asunto}): reintento ${intento + 1}/2 de ${dest.email} luego de: ${res.message}`,
                );
                await pausa(1500);
                continue;
              }
              throw new Error(res.message);
            }

            this.logger.log(
              `Comunicado ${c.id} (${c.asunto}) enviado a ${dest.email}${redirigido ? ` (redirigido a ${dest.emailFinal})` : ''}${mensajeOk ? ` (${mensajeOk})` : ''}`,
            );

            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'ok',
            };
          } catch (err: any) {
            const error = this.friendlyEnvioError(err);
            this.logger.error(
              `Comunicado ${c.id} (${c.asunto}): fallo envio a ${dest.email}${redirigido ? ` (redirigido a ${dest.emailFinal})` : ''}: ${String(err?.message ?? err)}`,
            );
            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'failed',
              sendError: error,
            };
          }

          // Pequeña pausa para no saturar el gateway y persistir el progreso.
          await pausa(200);
          this.encolarGuardado(c);
        }
      },
    );

    await Promise.all(trabajadores);
    await this.colaGuardado;
  }

  /**
   * Modo lote: una sola llamada al gateway con todos los destinatarios en BCC.
   * Exito marca todos como 'ok'; error marca todos como 'failed' con el mismo
   * motivo. No hay tracking individual (un solo mensaje).
   */
  private async enviarEnLote(
    destinos: Array<Destinatario & { emailFinal: string }>,
    c: Comunicado,
    baseUrl: string,
    credencial: MailsenderCredencial,
    mailsenderUrl: string,
  ): Promise<void> {
    try {
      const htmlFinal = this.absolutizarUploads(c.cuerpo, baseUrl);
      const res = await enviarCorreoMailsender({
        baseUrl: mailsenderUrl,
        credencial,
        asunto: c.asunto,
        correosBcc: destinos.map((d) => d.emailFinal).join(', '),
        html: htmlFinal,
      });
      if (!res.ok) throw new Error(res.message);
      c.destinatarios = destinos.map((d) => ({
        email: d.email,
        nombre: d.nombre,
        sendStatus: 'ok',
      }));
      this.logger.log(
        `Comunicado ${c.id} (${c.asunto}) enviado en lote a ${destinos.length} destinatarios`,
      );
    } catch (err: any) {
      const error = this.friendlyEnvioError(err);
      this.logger.error(
        `Comunicado ${c.id} (${c.asunto}): fallo envio en lote: ${String(err?.message ?? err)}`,
      );
      c.destinatarios = destinos.map((d) => ({
        email: d.email,
        nombre: d.nombre,
        sendStatus: 'failed',
        sendError: error,
      }));
    }
    this.encolarGuardado(c);
  }

  /**
   * Envio por SMTP directo (nodemailer con pool): un correo por destinatario
   * con tracking individual y reintentos ante fallos transitorios. El canal
   * SMTP no soporta el modo "lote" por destinatarios ocultos porque el estado
   * se registra por destinatario.
   */
  private async sendPoolSmtp(
    destinos: Array<Destinatario & { emailFinal: string }>,
    c: Comunicado,
    baseUrl: string,
  ): Promise<void> {
    const cfg = await this.configuracion.getGlobal();
    const host = cfg.smtpHost?.trim() || '';
    const user = cfg.smtpUser?.trim() || '';
    const pass = cfg.smtpPass?.trim() || '';
    if (!host || !user || !pass) {
      throw new BadRequestException(
        'Para enviar por SMTP configura el host, usuario y clave del servidor SMTP en Configuración > Correo.',
      );
    }
    const { transporter } = await createSmtpTransport({
      host,
      port: Number(cfg.smtpPort) || 587,
      secure: cfg.smtpSecure !== false,
      user,
      pass,
    });
    const from =
      cfg.mailFrom?.trim() ||
      user ||
      String(this.config.get('MAIL_FROM') ?? '');
    const senderName = cfg.ticketEmailSenderName?.trim() || 'Soporte';
    const remitente = from ? `${senderName} <${from}>` : '';

    const CONCURRENCIA = 3;
    let index = 0;

    const esTransitorio = (msg: string): boolean =>
      /(socket|connection|timed? ?out|reset|temporarily unusable|try again|no respondio a tiempo|ECONN|ESOCKET|ETIMEDOUT)/i.test(
        String(msg ?? ''),
      );

    const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const trabajadores = Array.from(
      { length: Math.min(CONCURRENCIA, destinos.length) },
      async () => {
        while (index < destinos.length) {
          const pos = index++;
          const dest = destinos[pos];
          const redirigido = dest.emailFinal !== dest.email;

          try {
            const pixelUrl = `${baseUrl}/track/open/${c.id}/${encodeURIComponent(dest.email)}`;
            const cuerpoFinal = this.insertarPixel(
              this.injectTracking(c.cuerpo, c.id, dest.email, baseUrl),
              pixelUrl,
            );
            const { html: htmlEmbebido, smtpAttachments } =
              await embedInlineImages(cuerpoFinal);
            const htmlFinal = this.absolutizarUploads(
              htmlEmbebido,
              baseUrl,
            );

            let enviado = false;
            for (let intento = 1; intento <= 2; intento++) {
              try {
                await transporter.sendMail({
                  from: remitente,
                  to: dest.emailFinal,
                  subject: c.asunto,
                  html: htmlFinal,
                  attachments: smtpAttachments.length
                    ? smtpAttachments
                    : undefined,
                });
                enviado = true;
                break;
              } catch (err: any) {
                if (
                  intento === 1 &&
                  esTransitorio(String(err?.message ?? err))
                ) {
                  this.logger.warn(
                    `Comunicado ${c.id} (${c.asunto}): reintento ${intento + 1}/2 de ${dest.email} via SMTP luego de: ${String(err?.message ?? err)}`,
                  );
                  await pausa(1500);
                  continue;
                }
                throw err;
              }
            }
            if (!enviado) throw new Error('Fallo el envio SMTP');

            this.logger.log(
              `Comunicado ${c.id} (${c.asunto}) enviado a ${dest.email} via SMTP${redirigido ? ` (redirigido a ${dest.emailFinal})` : ''}`,
            );

            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'ok',
            };
          } catch (err: any) {
            const error = this.friendlyEnvioError(err);
            this.logger.error(
              `Comunicado ${c.id} (${c.asunto}): fallo envio a ${dest.email} via SMTP${redirigido ? ` (redirigido a ${dest.emailFinal})` : ''}: ${String(err?.message ?? err)}`,
            );
            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'failed',
              sendError: error,
            };
          }

          await pausa(200);
          this.encolarGuardado(c);
        }
      },
    );

    try {
      await Promise.all(trabajadores);
    } finally {
      transporter.close();
    }
    await this.colaGuardado;
  }

  private proveedorSmtp(host: string): string {
    const h = host.toLowerCase();
    if (h.includes('gmail') || h.includes('googlemail')) return 'Gmail';
    if (h.includes('outlook') || h.includes('office365') || h.includes('live'))
      return 'Outlook / Microsoft 365';
    return 'SMTP';
  }

  private limiteDiarioSmtp(host: string): number {
    const proveedor = this.proveedorSmtp(host);
    if (proveedor === 'Gmail') return 500;
    if (proveedor === 'Outlook / Microsoft 365') return 300;
    return 500;
  }

  /**
   * Lote/consumo diario del gateway Mailsender: usado por el endpoint de
   * consulta antes de abrir el modal de confirmación de envío.
   */
  async obtenerCuota(): Promise<{
    configurado: boolean;
    proveedor: string;
    limiteDia: number;
    enviadosHoy: number;
    restante: number;
  }> {
    const cfg = await this.configuracion.getGlobal();
    if (metodoCorreoActivo(cfg) === 'smtp') {
      const smtpHost = cfg.smtpHost?.trim() || '';
      const smtpUser = cfg.smtpUser?.trim() || '';
      const smtpPass = cfg.smtpPass?.trim() || '';
      const configurado = Boolean(smtpHost && smtpUser && smtpPass);
      if (!configurado) {
        return {
          configurado,
          proveedor: '—',
          limiteDia: 0,
          enviadosHoy: 0,
          restante: 0,
        };
      }
      const enviadosHoy = await this.contarEnviadosHoy();
      const limiteDia = this.limiteDiarioSmtp(smtpHost);
      return {
        configurado,
        proveedor: this.proveedorSmtp(smtpHost),
        limiteDia,
        enviadosHoy,
        restante: Math.max(0, limiteDia - enviadosHoy),
      };
    }
    const credencial = normalizarCredencialMailsender(
      cfg.mailsenderCredencial as Record<string, unknown> | null | undefined,
    );
    const configurado = credencialMailsenderValida(credencial);
    if (!configurado || !credencial) {
      return {
        configurado,
        proveedor: '—',
        limiteDia: 0,
        enviadosHoy: 0,
        restante: 0,
      };
    }
    const enviadosHoy = await this.contarEnviadosHoy();
    const limiteDia = this.limiteDiarioMailsender(credencial);
    return {
      configurado,
      proveedor: this.proveedorMailsender(credencial),
      limiteDia,
      enviadosHoy,
      restante: Math.max(0, limiteDia - enviadosHoy),
    };
  }

  private async contarEnviadosHoy(): Promise<number> {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fila = await this.comunicadoRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.total_enviados), 0)', 'sum')
      .where('c.sent_at >= :inicio', { inicio })
      .getRawOne();
    return Number(fila?.sum ?? 0);
  }

  private proveedorMailsender(c: MailsenderCredencial): string {
    const email = c.email.toLowerCase();
    if (email.includes('gmail')) return 'Gmail';
    if (
      email.includes('outlook') ||
      email.includes('hotmail') ||
      email.includes('live.com')
    )
      return 'Outlook';
    if (
      email.includes('office365') ||
      email.includes('microsoft.com') ||
      c.azure_ClientId
    )
      return 'Microsoft 365';
    return 'Mailsender';
  }

  private limiteDiarioMailsender(c: MailsenderCredencial): number {
    const email = c.email.toLowerCase();
    if (email.includes('gmail')) return 2000;
    if (
      email.includes('outlook') ||
      email.includes('hotmail') ||
      email.includes('live.com')
    )
      return 300;
    if (
      email.includes('office365') ||
      email.includes('microsoft.com') ||
      c.azure_ClientId
    )
      return 10000;
    return 500;
  }

  /**
   * Traduce el error crudo de un destinatario a un mensaje claro en español.
   */
  private friendlyEnvioError(err: any): string {
    const code = String(err?.code ?? '');
    const msg = String(err?.message ?? err ?? '');
    const response = String(err?.response ?? '');
    const text = `${msg}\n${response}`;

    if (code === 'EENVELOPE')
      return 'El correo no se pudo armar (remitente inválido). Revisá el remitente en Configuración.';
    if (code === 'ESOCKET' || code === 'ETIMEDOUT')
      return 'Se perdió la conexión con el servidor SMTP al enviar. Reintentalo.';

    const smtpCode = String(
      err?.responseCode ?? response.match(/\b([45]\d\d)\b/)?.[0] ?? '',
    );

    if (
      /5\.1\.1|5\.7\.4/.test(text) ||
      /no such user|user unknown|mailbox.*(not )?(available|exist)|recipient.*rejected|address.*rejected|not exist/i.test(
        text,
      )
    )
      return 'Casilla de destino inexistente o rechazada por el servidor.';
    if (/5\.2\.2|quota|mailbox.*(full|over sua quota)/i.test(text))
      return 'Casilla de destino llena (superó la cuota de almacenamiento).';
    if (/5\.1\.8|5\.7\.14|5\.7\.350|policy|too many|rate limit/i.test(text))
      return 'Rechazado por el servidor: excediste el límite de envíos o el remitente está marcado como spam.';
    if (/553|relay accepted/i.test(text))
      return 'La casilla no existe en este dominio (553) o el relay fue denegado.';
    if (smtpCode) {
      const detalle = this.acortar(
        response || msg.replace(/^\s*Error:\s*/i, ''),
      );
      return `El servidor SMTP rechazó el correo (${smtpCode}).${detalle ? ` ${detalle}` : ''}`;
    }
    return this.acortar(msg || 'Error de envío');
  }

  private acortar(v: string, max = 180): string {
    const limpio = String(v ?? '')
      .split(/\r?\n/)[0]
      .trim();
    return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
  }

  /**
   * Guardado del progreso encolado para evitar escrituras concurrentes que
   * se pisen entre sí (solo afecta el contador en vivo; el estado final se
   * persiste completo al terminar).
   */
  private colaGuardado: Promise<void> = Promise.resolve();

  private encolarGuardado(c: Comunicado): void {
    this.colaGuardado = this.colaGuardado
      .then(async () => {
        await this.comunicadoRepo.save({
          id: c.id,
          destinatarios: c.destinatarios,
        });
      })
      .catch(() => {
        this.logger.warn(
          `No se pudo persistir el progreso de envío del comunicado ${c.id}`,
        );
      });
  }

  async getStats(id: string) {
    const c = await this.findOne(id);
    const eventos = await this.eventoRepo.find({
      where: { comunicado: { id } },
      order: { createdAt: 'DESC' },
    });

    const aperturasPorEmail = new Map<string, number>();
    const clicsPorEmail = new Map<string, number>();

    eventos.forEach((e) => {
      if (e.tipo === 'apertura') {
        aperturasPorEmail.set(
          e.email,
          (aperturasPorEmail.get(e.email) ?? 0) + 1,
        );
      } else {
        clicsPorEmail.set(e.email, (clicsPorEmail.get(e.email) ?? 0) + 1);
      }
    });

    return {
      totalEnviados: c.totalEnviados,
      totalAperturas: c.totalAperturas,
      totalClics: c.totalClics,
      tasaApertura:
        c.totalEnviados > 0
          ? Math.round((c.totalAperturas / c.totalEnviados) * 100)
          : 0,
      tasaClics:
        c.totalEnviados > 0
          ? Math.round((c.totalClics / c.totalEnviados) * 100)
          : 0,
      detalle: c.destinatarios.map((d) => ({
        email: d.email,
        nombre: d.nombre,
        aperturas: aperturasPorEmail.get(d.email) ?? 0,
        clics: clicsPorEmail.get(d.email) ?? 0,
        sendStatus: d.sendStatus ?? 'ok',
        sendError: d.sendError ?? null,
      })),
      eventos: eventos.slice(0, 50),
    };
  }

  async remove(id: string, user: User): Promise<void> {
    const c = await this.findOne(id);
    this.assertCanManage(c, user);
    await this.comunicadoRepo.remove(c);
  }

  async getColegios(): Promise<{
    colegios: (Colegio & {
      perfilFiltros: Record<string, string | null>;
    })[];
    filtrosPerfil: {
      id: string;
      nombre: string;
      categoriaId: string | null;
      categoriaNombre: string | null;
    }[];
  }> {
    const [colegios, campos, valores] = await Promise.all([
      this.colegioRepo.find({ order: { nombre: 'ASC' } }),
      this.piCampoRepo.find({
        where: { tipo: 'booleano', filtroComunicados: true, activo: true },
        relations: { categoria: true },
        order: { orden: 'ASC', nombre: 'ASC' },
      }),
      this.piValorRepo.find(),
    ]);

    const campoIds = campos.map((c) => c.id);
    const valoresPorColegio = new Map<string, Record<string, string | null>>();
    for (const v of valores) {
      if (!campoIds.includes(v.campoId)) continue;
      if (!valoresPorColegio.has(v.colegioId))
        valoresPorColegio.set(v.colegioId, {});
      valoresPorColegio.get(v.colegioId)![v.campoId] = v.valor;
    }

    return {
      colegios: colegios.map((c) => ({
        ...c,
        perfilFiltros: valoresPorColegio.get(c.id) ?? {},
      })),
      filtrosPerfil: campos.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        categoriaId: f.categoria?.id ?? null,
        categoriaNombre: f.categoria?.nombre ?? null,
      })),
    };
  }

  async findTemplates(): Promise<ComunicadoTemplate[]> {
    return this.templateRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.createdBy', 'cb')
      .leftJoinAndSelect('t.updatedBy', 'ub')
      .addSelect(['cb.id', 'cb.name', 'cb.email', 'ub.id', 'ub.name', 'ub.email'])
      .orderBy('t.name', 'ASC')
      .getMany();
  }

  async createTemplate(
    data: {
      name: string;
      asunto: string;
      cuerpo: string;
      design: unknown[] | null;
    },
    user: User,
  ): Promise<ComunicadoTemplate> {
    const t = this.templateRepo.create({
      name: data.name,
      asunto: data.asunto,
      cuerpo: data.cuerpo,
      design: data.design ?? null,
      createdBy: user,
      updatedBy: user,
    });
    const saved = await this.templateRepo.save(t);
    await this.registrarTemplateLog(saved.id, saved.name, user, 'crear', null);
    return saved;
  }

  async updateTemplate(
    id: string,
    data: {
      name: string;
      asunto: string;
      cuerpo: string;
      design: unknown[] | null;
    },
    user: User,
  ): Promise<ComunicadoTemplate> {
    const t = await this.templateRepo.findOneBy({ id });
    if (!t) throw new NotFoundException('Plantilla no encontrada');

    const cambios = this.computarCambiosTemplate(t, data);
    t.name = data.name;
    t.asunto = data.asunto;
    t.cuerpo = data.cuerpo;
    t.design = data.design ?? null;
    t.updatedBy = user;
    const saved = await this.templateRepo.save(t);
    if (Object.keys(cambios).length > 0) {
      await this.registrarTemplateLog(
        saved.id,
        saved.name,
        user,
        'editar',
        cambios,
      );
    }
    return saved;
  }

  async deleteTemplate(id: string, user: User): Promise<void> {
    const t = await this.templateRepo.findOneBy({ id });
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    await this.registrarTemplateLog(t.id, t.name, user, 'eliminar', null);
    await this.templateRepo.remove(t);
  }

  async findTemplateLogs(templateId: string | null): Promise<
    ComunicadoTemplateLog[]
  > {
    const qb = this.templateLogRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.usuario', 'u')
      .addSelect(['u.id', 'u.name', 'u.email'])
      .orderBy('l.created_at', 'DESC');
    if (templateId) {
      qb.where('l.template_id = :id', { id: templateId });
    } else {
      qb.limit(100);
    }
    return qb.getMany();
  }

  private async registrarTemplateLog(
    templateId: string | null,
    templateName: string | null,
    user: User,
    accion: string,
    cambios: Record<string, { antes: string | null; nuevo: string | null }> | null,
  ): Promise<void> {
    try {
      await this.templateLogRepo.save(
        this.templateLogRepo.create({
          templateId,
          templateName,
          usuario: user,
          accion,
          cambios,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar el log de plantilla (${accion}): ${(err as Error).message}`,
      );
    }
  }

  private computarCambiosTemplate(
    t: ComunicadoTemplate,
    data: {
      name: string;
      asunto: string;
      cuerpo: string;
      design: unknown[] | null;
    },
  ): Record<string, { antes: string | null; nuevo: string | null }> {
    const cambios: Record<string, { antes: string | null; nuevo: string | null }> = {};
    if (t.name !== data.name) {
      cambios.name = { antes: t.name, nuevo: data.name };
    }
    if (t.asunto !== data.asunto) {
      cambios.asunto = { antes: t.asunto, nuevo: data.asunto };
    }
    if (t.cuerpo !== data.cuerpo) {
      cambios.cuerpo = {
        antes: truncarLog(t.cuerpo, 600),
        nuevo: truncarLog(data.cuerpo, 600),
      };
    }
    if (JSON.stringify(t.design ?? null) !== JSON.stringify(data.design ?? null)) {
      cambios.design = { antes: 'config', nuevo: 'modificado' };
    }
    return cambios;
  }

  async registrarApertura(
    comunicadoId: string,
    email: string,
    userAgent: string,
    ip: string,
  ): Promise<void> {
    await this.eventoRepo.save(
      this.eventoRepo.create({
        comunicado: { id: comunicadoId },
        email,
        tipo: 'apertura',
        userAgent,
        ip,
      }),
    );
    await this.comunicadoRepo.increment(
      { id: comunicadoId },
      'totalAperturas',
      1,
    );
  }

  async registrarClic(
    comunicadoId: string,
    email: string,
    urlDestino: string,
    userAgent: string,
    ip: string,
  ): Promise<string> {
    await this.eventoRepo.save(
      this.eventoRepo.create({
        comunicado: { id: comunicadoId },
        email,
        tipo: 'clic',
        urlDestino,
        userAgent,
        ip,
      }),
    );
    await this.comunicadoRepo.increment({ id: comunicadoId }, 'totalClics', 1);
    return urlDestino;
  }

  private insertarPixel(body: string, pixelUrl: string): string {
    const img = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>`;
    if (/<\/body/i.test(body)) {
      return body.replace(/<\/body/i, `${img}</body`);
    }
    return `${body}\n${img}`;
  }

  private injectTracking(
    html: string,
    comunicadoId: string,
    email: string,
    baseUrl: string,
  ): string {
    return html.replace(/<a\s+href="([^"]+)"/gi, (_, url) => {
      const tracked = `${baseUrl}/track/click/${comunicadoId}/${encodeURIComponent(email)}?url=${encodeURIComponent(url)}`;
      return `<a href="${tracked}"`;
    });
  }

  /**
   * Convierte las rutas locales de imagenes /uploads/... a URLs absolutas
   * (baseUrl + ruta) para que lleguen al correo cargables desde el servidor
   * publico. Normaliza tanto rutas relativas como absolutas ya horneadas con
   * otro host, para que siempre usen la base publica del momento del envio.
   * No incrusta base64 en este canal: infla el mensaje y Gmail/Outlook lo
   * recortan ("mensaje acortado") perdiendo las imagenes.
   */
  private absolutizarUploads(html: string, baseUrl: string): string {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!base) return html;
    return html.replace(
      /(["'()]\s*)(?:https?:\/\/[^\/"'()\s]*)?\/uploads\/([^"'()\s]+)/g,
      (match, quote, ruta) => `${quote}${base}/uploads/${ruta}`,
    );
  }
}
