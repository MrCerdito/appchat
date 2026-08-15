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
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { createSmtpTransport } from '../common/mail/smtp.helper';

@Injectable()
export class ComunicadosService {
  private readonly logger = new Logger(ComunicadosService.name);

  constructor(
    @InjectRepository(ComunicadoEvento)
    private readonly eventoRepo: Repository<ComunicadoEvento>,
    @InjectRepository(Comunicado)
    private readonly comunicadoRepo: Repository<Comunicado>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    private readonly config: ConfigService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async findAll(userId: string, role: string): Promise<Comunicado[]> {
    if (role === 'admin') {
      return this.comunicadoRepo.find({ order: { createdAt: 'DESC' } });
    }
    return this.comunicadoRepo.find({
      where: { sender: { id: userId } },
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

  async send(id: string, user: User): Promise<Comunicado> {
    const c = await this.findOne(id);
    this.assertCanManage(c, user);
    if (c.status === 'sent') throw new BadRequestException('Ya fue enviado');
    if (!c.destinatarios.length) throw new BadRequestException('Sin destinatarios');

    const baseUrl = this.config.get('APP_URL') ?? 'http://localhost:3001';
    const cfg = await this.configuracion.getGlobal();

    const smtpHost = cfg.smtpHost?.trim() || '';
    const smtpUser = cfg.smtpUser?.trim() || '';
    const smtpPass = cfg.smtpPass?.trim() || '';
    const rawFrom =
      cfg.mailFrom?.trim() ||
      smtpUser ||
      String(this.config.get('MAIL_FROM') ?? '');

    if (!smtpHost || !smtpUser || !smtpPass || !rawFrom) {
      throw new BadRequestException(
        'Configura el correo SMTP (servidor, usuario, clave y remitente) en Configuración antes de enviar.',
      );
    }

    const from = this.resolveFrom(rawFrom, c.senderName);

    const { transporter } = await createSmtpTransport({
      host: smtpHost,
      port: Number(cfg.smtpPort) || 465,
      secure: cfg.smtpSecure !== false,
      user: smtpUser,
      pass: smtpPass,
    });

    const isDev = process.env.NODE_ENV !== 'production';

    // ── Modo desarrollo: redirige todos los emails a tu cuenta ──
    const destinos = c.destinatarios.map((d) => ({
      ...d,
      emailFinal: isDev ? 'jeanpfmunozv@gmail.com' : d.email,
    }));

    try {
      await this.sendWithPool(destinos, c, baseUrl, from, transporter);
    } finally {
      transporter.close();
    }

    const enviados = c.destinatarios.filter(
      (d) => d.sendStatus === 'ok',
    ).length;
    c.status = enviados > 0 ? 'sent' : 'failed';
    c.sentAt = enviados > 0 ? new Date() : null;
    c.totalEnviados = enviados;

    return this.comunicadoRepo.save(c);
  }

  private async sendWithPool(
    destinos: Array<Destinatario & { emailFinal: string }>,
    c: Comunicado,
    baseUrl: string,
    from: string,
    transporter: Awaited<ReturnType<typeof createSmtpTransport>>['transporter'],
  ): Promise<void> {
    const CONCURRENCIA = 15;
    let index = 0;
    const dev = process.env.NODE_ENV !== 'production';

    const trabajadores = Array.from(
      { length: Math.min(CONCURRENCIA, destinos.length) },
      async () => {
        while (index < destinos.length) {
          const pos = index++;
          const dest = destinos[pos];

          try {
            const pixelUrl = `${baseUrl}/track/open/${c.id}/${encodeURIComponent(dest.email)}`;
            const cuerpoFinal = `
              ${this.injectTracking(c.cuerpo, c.id, dest.email, baseUrl)}
              <img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>
            `;

            await transporter.sendMail({
              from,
              to: dest.emailFinal,
              subject: dev
                ? `[TEST → ${dest.email}] ${c.asunto}`
                : c.asunto,
              html: cuerpoFinal,
            });

            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'ok',
            };
          } catch (err: any) {
            c.destinatarios[pos] = {
              email: dest.email,
              nombre: dest.nombre,
              sendStatus: 'failed',
              sendError: String(err?.message ?? 'Error de envio'),
            };
          }
        }
      },
    );

    await Promise.all(trabajadores);
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

  async getColegios(): Promise<Colegio[]> {
    return this.colegioRepo.find({ order: { nombre: 'ASC' } });
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
}
