import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { Comunicado, Destinatario } from './entities/comunicado.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';

@Injectable()
export class ComunicadosService {
  private resend: Resend;

  constructor(
    @InjectRepository(ComunicadoEvento)
    private readonly eventoRepo: Repository<ComunicadoEvento>,
    @InjectRepository(Comunicado)
    private readonly comunicadoRepo: Repository<Comunicado>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(config.get('RESEND_API_KEY'));
  }

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
    const c = await this.comunicadoRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Comunicado no encontrado');
    return c;
  }

  async saveDraft(
    asunto: string,
    cuerpo: string,
    destinatarios: Destinatario[],
    user: User,
  ): Promise<Comunicado> {
    const c = this.comunicadoRepo.create({
      asunto,
      cuerpo,
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
  ): Promise<Comunicado> {
    const c = await this.findOne(id);
    if (c.status === 'sent')
      throw new BadRequestException('No se puede editar un comunicado enviado');
    c.asunto = asunto;
    c.cuerpo = cuerpo;
    c.destinatarios = destinatarios.map((d) => ({
      email: d.email,
      nombre: d.nombre,
    }));
    return this.comunicadoRepo.save(c);
  }

  async send(id: string): Promise<Comunicado> {
    const c = await this.findOne(id);
    if (c.status === 'sent') throw new BadRequestException('Ya fue enviado');
    if (!c.destinatarios.length) throw new BadRequestException('Sin destinatarios');

    const baseUrl = this.config.get('APP_URL') ?? 'http://localhost:3001';
    const from = this.config.get('MAIL_FROM');

    // ── Modo desarrollo: redirige todos los emails a tu cuenta ──
    const isDev = process.env.NODE_ENV !== 'production';

    const results = await Promise.allSettled(
      c.destinatarios.map(async (dest) => {
        const emailDestino = isDev ? 'jeanpfmunozv@gmail.com' : dest.email;

        const pixelUrl = `${baseUrl}/track/open/${id}/${encodeURIComponent(dest.email)}`;
        const cuerpoFinal = `
          ${this.injectTracking(c.cuerpo, id, dest.email, baseUrl)}
          <img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>
        `;

        const { data, error } = await this.resend.emails.send({
          from,
          to: emailDestino,
          subject: isDev ? `[TEST → ${dest.email}] ${c.asunto}` : c.asunto,
          html: cuerpoFinal,
        });

        if (error) throw new BadRequestException(error.message);
        return data;
      }),
    );

    c.destinatarios = c.destinatarios.map((dest, i): Destinatario => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        return { email: dest.email, nombre: dest.nombre, sendStatus: 'ok' };
      }
      const msg = String(result.reason?.message ?? 'Error desconocido');
      return {
        email: dest.email,
        nombre: dest.nombre,
        sendStatus: 'failed',
        sendError: msg,
      };
    });

    const enviados = c.destinatarios.filter(
      (d) => d.sendStatus === 'ok',
    ).length;
    c.status = enviados > 0 ? 'sent' : 'failed';
    c.sentAt = enviados > 0 ? new Date() : null;
    c.totalEnviados = enviados;

    return this.comunicadoRepo.save(c);
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

  async remove(id: string): Promise<void> {
    const c = await this.findOne(id);
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

  async markBounced(email: string, reason: string): Promise<void> {
    const comunicados = await this.comunicadoRepo.find({
      where: { status: 'sent' },
      order: { sentAt: 'DESC' },
      take: 10,
    });

    for (const c of comunicados) {
      const idx = c.destinatarios.findIndex(
        (d) => d.email === email && d.sendStatus === 'ok',
      );
      if (idx !== -1) {
        c.destinatarios[idx] = {
          ...c.destinatarios[idx],
          sendStatus: 'failed',
          sendError: `Rebote: ${reason}`,
        };
        await this.comunicadoRepo.save(c);
      }
    }
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
}
