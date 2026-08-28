import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  createSmtpTransport,
  friendlySmtpError,
} from '../common/mail/smtp.helper';
import { embedInlineImages } from '../common/mail/email-assets.helper';
import {
  Configuracion,
  HorarioAlmuerzo,
  HorarioSlot,
} from './entities/configuracion.entity';
import {
  cleanText,
  normalizeText,
  sanitizeEmailHtml,
  sanitizeSenderName,
} from '../common/security/sanitize.helper';

export interface HorarioEstado {
  enJornada: boolean;
  diaHoy: number;
  horarios: HorarioSlot[];
  mensaje: string;
  proximaApertura: string;
  horaApertura: string;
  proximaTipo: 'hoy' | 'manana' | 'fecha' | '';
  proximaDia: number;
  proximaInicio: string;
}

@Injectable()
export class ConfiguracionService implements OnModuleInit {
  private readonly dias = [
    'domingo',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
  ];

  private readonly CACHE_PREFIX = 'config:';
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(Configuracion)
    private readonly repo: Repository<Configuracion>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS whatsapp_quick_replies jsonb NOT NULL
      DEFAULT '["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]'::jsonb
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS whatsapp_call_unavailable_msg text NOT NULL
      DEFAULT 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_activado boolean NOT NULL DEFAULT true
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_whatsapp varchar(30) NOT NULL DEFAULT 'whatsapp1'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_asesor varchar(30) NOT NULL DEFAULT 'asesor1'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_cliente varchar(30) NOT NULL DEFAULT 'cliente1'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS sonido_asignacion varchar(30) NOT NULL DEFAULT 'asignacion1'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ai_prompt_config jsonb DEFAULT NULL
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS asesor_reconexion_seg int NOT NULL DEFAULT 120
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS asesor_reconexion_msg text NOT NULL
      DEFAULT 'El agente se ha desconectado. Por favor inicia una nueva conversacion.'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS almuerzos jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS whatsapp_max_active_chats_per_advisor int NOT NULL DEFAULT 3
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_activo boolean NOT NULL DEFAULT true
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_asunto text
      DEFAULT 'Tu caso {{codigo}} fue registrado'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_cuerpo text
      DEFAULT 'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de Soporte'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_design jsonb DEFAULT NULL
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_sender_name text DEFAULT 'Soporte'
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_include_info boolean NOT NULL DEFAULT true
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_send_copy boolean NOT NULL DEFAULT false
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS ticket_email_attachments boolean NOT NULL DEFAULT false
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS smtp_host text DEFAULT ''
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS smtp_port int NOT NULL DEFAULT 465
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS smtp_secure boolean NOT NULL DEFAULT true
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS smtp_user text DEFAULT ''
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS smtp_pass text DEFAULT ''
    `);
    await this.repo.query(`
      ALTER TABLE IF EXISTS public.configuracion
      ADD COLUMN IF NOT EXISTS mail_from text DEFAULT ''
    `);

    await this.repo.query(`
      UPDATE public.configuracion
      SET ticket_email_cuerpo = REPLACE(ticket_email_cuerpo, 'ReportaCasos', 'Soporte')
      WHERE ticket_email_cuerpo LIKE '%ReportaCasos%'
    `);

    const count = await this.repo.count({ where: { advisorId: IsNull() } });
    if (count === 0) {
      await this.getGlobal();
    }
  }

  private cacheKey(advisorId?: string): string {
    return advisorId ? `${this.CACHE_PREFIX}advisor:${advisorId}` : `${this.CACHE_PREFIX}global`;
  }

  private async getFromCache(key: string): Promise<Configuracion | null> {
    try {
      return (await this.cache.get<Configuracion>(key)) ?? null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, data: Configuracion): Promise<void> {
    try {
      await this.cache.set(key, data, this.CACHE_TTL_MS);
    } catch {}
  }

  async exportQuickRepliesCsv(): Promise<string> {
    const config = await this.getGlobal();
    const replies = config.whatsappQuickReplies ?? [];
    const header = '"name";"content"';
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const rows = replies.map((r: any) => [esc(r.name), esc(r.content)].join(';'));
    return [header, ...rows].join('\n');
  }

  async importQuickRepliesCsv(csv: string): Promise<{ imported: number; skipped: number }> {
    const lines = csv.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return { imported: 0, skipped: 0 };

    const header = lines[0].toLowerCase();
    const cols = header.split(';').map((c: string) => c.trim().replace(/"/g, ''));
    const nIdx = cols.indexOf('name');
    const cIdx = cols.indexOf('content');

    if (nIdx === -1 || cIdx === -1)
      throw new BadRequestException('CSV debe tener columnas "name" y "content"');

    const parsed: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = this.parseQuickReplyCsvLine(lines[i]);
      const name = vals[nIdx]?.trim();
      const content = vals[cIdx]?.trim();
      if (name && content) {
        parsed.push({ name: name.slice(0, 60), content: content.slice(0, 500) });
      }
    }

    if (!parsed.length) return { imported: 0, skipped: 0 };

    return this.importBulkQuickReplies(parsed);
  }

  async importBulkQuickReplies(items: { name: string; content: string }[]): Promise<{ imported: number; skipped: number }> {
    const config = await this.getGlobal();
    const existing = Array.isArray(config.whatsappQuickReplies) ? config.whatsappQuickReplies : [];

    let nextId = 1;
    for (const r of existing) {
      if (r.id && /^qr_\d+$/.test(String(r.id))) {
        const num = parseInt(String(r.id).slice(3), 10);
        if (num >= nextId) nextId = num + 1;
      }
    }

    const existingNames = new Set<string>();
    for (const r of existing) {
      if (r.name) existingNames.add(normalizeText(String(r.name)).toLowerCase().trim());
    }

    const imported: any[] = [];
    let skipped = 0;

    for (const item of items) {
      const name = String(item.name).trim().slice(0, 60);
      if (!name) { skipped++; continue; }
      const normalizedName = normalizeText(name).toLowerCase();
      if (existingNames.has(normalizedName)) { skipped++; continue; }
      existingNames.add(normalizedName);

      imported.push({
        id: `qr_${nextId++}`,
        name,
        content: String(item.content).trim().slice(0, 500),
      });
    }

    if (!imported.length) return { imported: 0, skipped };

    const merged = [...existing, ...imported];
    await this.guardar({ whatsappQuickReplies: merged }, undefined);
    return { imported: imported.length, skipped };
  }

  async deleteBulkQuickReplies(ids: string[]): Promise<{ deleted: number }> {
    const config = await this.getGlobal();
    const existing = Array.isArray(config.whatsappQuickReplies) ? config.whatsappQuickReplies : [];
    const idSet = new Set(ids);
    const before = existing.length;
    const remaining = existing.filter((r: any) => !idSet.has(String(r.id)));
    const deleted = before - remaining.length;
    if (deleted > 0) {
      await this.guardar({ whatsappQuickReplies: remaining }, undefined);
    }
    return { deleted };
  }

  private parseQuickReplyCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ';' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  private async invalidateCache(advisorId?: string): Promise<void> {
    try {
      await this.cache.del(this.cacheKey(advisorId));
    } catch {}
  }

  private async invalidateAll(): Promise<void> {
    try {
      const cache = this.cache as any;
      // La clave global se borra siempre (respuesta garantizada).
      await this.cache.del(this.cacheKey());
      // El adaptador de Redis no expone store.keys(): se enumeran las claves
      // a traves del iterador SCAN de Keyv y se borran las de este servicio.
      const keyv = cache.store;
      const store = keyv?.opts?.store;
      if (store && typeof store.iterator === 'function') {
        const keys: string[] = [];
        for await (const [k] of store.iterator()) {
          if (
            String(k).startsWith(this.CACHE_PREFIX) &&
            String(k) !== this.cacheKey()
          ) {
            keys.push(String(k));
          }
        }
        for (const k of keys) {
          await this.cache.del(k);
        }
      }
    } catch {}
  }

  async getEfectiva(advisorId?: string): Promise<Configuracion> {
    const key = this.cacheKey(advisorId);
    const cached = await this.getFromCache(key);
    if (cached) return cached;

    const global = await this.getGlobalRow();

    if (!advisorId) {
      await this.setCache(this.cacheKey(), global);
      return global;
    }

    const override = await this.repo.findOne({ where: { advisorId } });
    const efectiva = override ? this.mergePersonal(global, override) : global;
    await this.setCache(key, efectiva);
    return efectiva;
  }

  /**
   * La configuracion de bienvenida, inactividad y mensajes es GLOBAL
   * (la gestiona el administrador). El asesor solo puede personalizar su
   * almuerzo. Por eso el override solo aporta `almuerzos`; el resto siempre
   * proviene de la configuracion global para que todos tengan la misma.
   */
  private mergePersonal(global: Configuracion, override: Configuracion): Configuracion {
    return {
      ...global,
      id: override.id,
      advisorId: override.advisorId,
      almuerzos: override.almuerzos ?? global.almuerzos ?? [],
      createdAt: override.createdAt,
      updatedAt: override.updatedAt,
    };
  }

  private async getGlobalRow(): Promise<Configuracion> {
    const global = await this.repo.findOne({
      where: { advisorId: IsNull() },
    });
    if (global) return global;

    const defaults: Partial<Configuracion> = {
      mensajeBienvenida: '¡Bienvenido! ¿En qué puedo ayudarte?',
      asesorInactividadMsg:
        'El agente se ha desconectado. En breve lo atenderá otro.',
      asesorReconexionSeg: 120,
      asesorReconexionMsg:
        'El agente se ha desconectado. Por favor inicia una nueva conversacion.',
      clienteInactividadMsg: '¿Sigues ahí? Escribe algo para continuar.',
      clienteCierreMsg: 'Gracias por contactarnos. Que tengas un buen día.',
      horarioFueraMsg:
        'Estamos fuera del horario de atención. Vuelve en nuestro horario habitual.',
      whatsappAssignmentMsg:
        'Hola, soy {{agente}}. Ya fui asignado a tu conversacion y revisare tu caso.',
      whatsappQueueMsg:
        'Te encuentras en cola. En breves momentos un agente se comunicara contigo.',
      whatsappOutOfHoursMsg:
        'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
      whatsappCallUnavailableMsg:
        'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.',
      ticketCategories: [
        'Soporte tecnico',
        'Administrativo',
        'Academico',
        'Facturacion',
        'Otro',
      ],
      sonidoActivado: true,
      sonidoWhatsapp: 'whatsapp1',
      sonidoAsesor: 'asesor1',
      sonidoCliente: 'cliente1',
      sonidoAsignacion: 'asignacion1',
      whatsappMaxActiveChatsPerAdvisor: 3,
      ticketEmailActivo: true,
      ticketEmailAsunto: 'Tu caso {{codigo}} fue registrado',
      ticketEmailCuerpo:
        'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de Soporte',
      ticketEmailDesign: null,
      ticketEmailSenderName: 'Soporte',
      ticketEmailIncludeInfo: true,
      ticketEmailSendCopy: false,
      ticketEmailAttachments: false,
      smtpHost: '',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: '',
      smtpPass: '',
      mailFrom: '',
    };
    const nueva = this.repo.create({ ...defaults, advisorId: null });
    const saved = await this.repo.save(nueva);
    await this.setCache(this.cacheKey(), saved);
    return saved;
  }

  async getEfectivaBatch(advisorIds: string[]): Promise<Map<string, Configuracion>> {
    const result = new Map<string, Configuracion>();
    const missingIds: string[] = [];

    const globalConfig = await this.getGlobalRow();

    for (const id of advisorIds) {
      const cached = await this.getFromCache(this.cacheKey(id));
      if (cached) {
        result.set(id, cached);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      const overrides = await this.repo
        .createQueryBuilder('c')
        .where('c.advisor_id IN (:...ids)', { ids: missingIds })
        .getMany();

      const overrideMap = new Map(overrides.map(o => [o.advisorId!, o]));
      for (const id of missingIds) {
        const override = overrideMap.get(id);
        const efectiva = override
          ? this.mergePersonal(globalConfig, override)
          : globalConfig;
        await this.setCache(this.cacheKey(id), efectiva);
        result.set(id, efectiva);
      }
    }

    return result;
  }

  async getGlobal(): Promise<Configuracion> {
    return this.getEfectiva();
  }

  async guardar(
    data: Partial<Configuracion>,
    advisorId?: string,
  ): Promise<Configuracion> {
    this.sanitizeConfigText(data);

    if (data.smtpPort !== undefined) {
      data.smtpPort = Math.max(1, Math.min(65535, Number(data.smtpPort) || 465));
    }
    if (typeof data.smtpSecure === 'string') {
      data.smtpSecure = data.smtpSecure !== 'false';
    }

    for (const key of [
      'ticketEmailIncludeInfo',
      'ticketEmailSendCopy',
      'ticketEmailAttachments',
    ] as const) {
      if (data[key] !== undefined) {
        (data as any)[key] = Boolean(data[key]);
      }
    }

    if (Array.isArray(data.almuerzos)) {
      data.almuerzos = this.normalizeAlmuerzos(data.almuerzos);
    }

    if (Array.isArray(data.whatsappQuickReplies)) {
      const first = data.whatsappQuickReplies[0];

      let nextId = 1;
      for (const r of data.whatsappQuickReplies) {
        if (r.id && /^qr_\d+$/.test(String(r.id))) {
          const num = parseInt(String(r.id).slice(3), 10);
          if (num >= nextId) nextId = num + 1;
        }
      }

      if (typeof first === 'string') {
        data.whatsappQuickReplies = (data.whatsappQuickReplies as string[])
          .map((text, i) => {
            const clean = cleanText(text, 500);
            if (!clean) return null;
            return { id: `qr_${i + 1}`, name: clean.slice(0, 60), content: clean };
          })
          .filter(Boolean) as any;
      } else {
        data.whatsappQuickReplies = (data.whatsappQuickReplies as any[])
          .filter((r) => r?.name && r?.content)
          .map((r) => ({
            id: r.id || `qr_${nextId++}`,
            name: String(r.name).slice(0, 60),
            content: cleanText(String(r.content), 500) || '',
          }))
          .filter((r) => r.content);
      }
    }

    const existing = await this.repo.findOne({
      where: advisorId ? { advisorId } : { advisorId: IsNull() },
    });

    let saved: Configuracion;

    if (existing) {
      const readOnlyKeys = ['id', 'advisorId', 'createdAt', 'updatedAt'];
      for (const key of readOnlyKeys) {
        delete (data as any)[key];
      }
      Object.assign(existing, data);
      saved = await this.repo.save(existing);
    } else {
      const global = await this.repo.findOne({
        where: { advisorId: IsNull() },
      });
      const defaults = global ? { ...global } : {};
      delete (defaults as any).id;
      delete (defaults as any).advisorId;
      const nueva = this.repo.create({ ...defaults, ...data, advisorId: advisorId ?? null });
      saved = await this.repo.save(nueva);
    }

    if (advisorId) {
      await this.invalidateCache(advisorId);
    } else {
      await this.invalidateAll();
    }

    return saved;
  }

  /**
   * Prueba la conexion SMTP con las credenciales recibidas (todavia no se
   * guardan) enviando un correo de prueba. Devuelve { ok, message }.
   */
  async probarConexionSmtp(body: {
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    mailFrom?: string;
    senderName?: string;
    to?: string;
    cuerpo?: string;
    asunto?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const to = String(body.to ?? '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new BadRequestException('Indica un correo valido para recibir la prueba.');
    }
    const host = String(body.smtpHost ?? '').trim();
    const user = String(body.smtpUser ?? '').trim();
    const pass = String(body.smtpPass ?? '');
    if (!host || !user || !pass) {
      throw new BadRequestException('Completa el servidor SMTP, el correo de la cuenta y su contrasena.');
    }

    const from = String(body.mailFrom ?? '').trim() || user;
    const port = Math.max(1, Math.min(65535, Number(body.smtpPort) || 465));
    const secure = body.smtpSecure !== false;

    // Si llega el cuerpo del editor visual, la prueba envia el diseno real
    // (con las imagenes incrustadas) para que el admin vea exactamente lo que
    // recibira el cliente. Si no, envia el mensaje simple de conexion.
    let html = '';
    let attachments: Array<{ filename: string; path: string; cid: string; contentType?: string }> | undefined;
    if (typeof body.cuerpo === 'string' && body.cuerpo.trim()) {
      const { html: htmlFinal, smtpAttachments } = await embedInlineImages(body.cuerpo);
      html = htmlFinal;
      attachments = smtpAttachments.length ? smtpAttachments : undefined;
    }

    const { transporter, connectHost, resolved } = await createSmtpTransport({
      host,
      port,
      secure,
      user,
      pass,
    });

    try {
      await transporter.verify();
      const senderName = body.senderName
        ? sanitizeSenderName(body.senderName, 80)
        : 'Soporte';
      const info = await transporter.sendMail({
        from: `"${senderName}" <${from}>`,
        to,
        subject:
          String(body.asunto ?? '').trim() || 'Prueba de conexion de correo',
        text: html
          ? 'Si recibes este correo, la conexion de correo para los tickets esta funcionando correctamente.'
          : undefined,
        html: html
          ? html
          : '<p>Si recibes este correo, la conexion de correo para los tickets esta funcionando correctamente.</p>',
        attachments,
      });
      transporter.close();
      return {
        ok: true,
        message: `Conexion exitosa con ${host}${resolved ? ` (IPv4 ${connectHost})` : ''}. Correo de prueba enviado a ${to}${info.messageId ? ` (${info.messageId})` : ''}.`,
      };
    } catch (err: any) {
      transporter.close();
      return { ok: false, message: friendlySmtpError(err, host, port) };
    }
  }

  private sanitizeConfigText(data: Partial<Configuracion>): void {
    const textKeys: (keyof Configuracion)[] = [
      'mensajeBienvenida',
      'asesorInactividadMsg',
      'asesorReconexionMsg',
      'clienteInactividadMsg',
      'clienteCierreMsg',
      'horarioFueraMsg',
      'whatsappAssignmentMsg',
      'whatsappQueueMsg',
      'whatsappOutOfHoursMsg',
      'whatsappCallUnavailableMsg',
      'ticketEmailAsunto',
      'ticketEmailCuerpo',
      'smtpHost',
      'smtpUser',
      'mailFrom',
    ];

    for (const key of textKeys) {
      const value = data[key];
      if (typeof value === 'string') {
        if (key === 'ticketEmailCuerpo') {
          (data as any)[key] = sanitizeEmailHtml(value, 200000);
        } else {
          (data as any)[key] = cleanText(value, 4096);
        }
      }
    }

    if (typeof data.ticketEmailSenderName === 'string') {
      data.ticketEmailSenderName = sanitizeSenderName(
        data.ticketEmailSenderName,
        80,
      );
    }

    if (data.ticketEmailDesign !== undefined && !Array.isArray(data.ticketEmailDesign)) {
      data.ticketEmailDesign = null;
    }

    if (Array.isArray(data.ticketCategories)) {
      data.ticketCategories = data.ticketCategories
        .map((c) => cleanText(c, 100))
        .filter(Boolean)
        .slice(0, 20);
    }

    if (data.aiPromptConfig && typeof data.aiPromptConfig === 'object') {
      const aiCfg = data.aiPromptConfig as Record<string, any>;
      if (typeof aiCfg.nombreAsistente === 'string') {
        aiCfg.nombreAsistente = cleanText(aiCfg.nombreAsistente, 200);
      }
      if (typeof aiCfg.especialidad === 'string') {
        aiCfg.especialidad = cleanText(aiCfg.especialidad, 200);
      }
      if (typeof aiCfg.instruccionesGenerales === 'string') {
        aiCfg.instruccionesGenerales = cleanText(aiCfg.instruccionesGenerales, 2000);
      }
      if (typeof aiCfg.feedbackPositivo === 'string') {
        aiCfg.feedbackPositivo = cleanText(aiCfg.feedbackPositivo, 500);
      }
      if (Array.isArray(aiCfg.frasesTransferencia)) {
        aiCfg.frasesTransferencia = aiCfg.frasesTransferencia
          .map((f: any) => cleanText(String(f), 50))
          .filter(Boolean)
          .slice(0, 20);
      }
      if (typeof aiCfg.promptPersonalizado === 'string') {
        aiCfg.promptPersonalizado = cleanText(aiCfg.promptPersonalizado, 10000);
      }
      if (Array.isArray(aiCfg.palabrasProhibidas)) {
        aiCfg.palabrasProhibidas = aiCfg.palabrasProhibidas
          .map((p: any) => cleanText(String(p), 50))
          .filter(Boolean)
          .slice(0, 100);
      }
      if (typeof aiCfg.mensajeGroseria === 'string') {
        aiCfg.mensajeGroseria = cleanText(aiCfg.mensajeGroseria, 500);
      }
      if (typeof aiCfg.limiteGroserias !== 'undefined') {
        aiCfg.limiteGroserias = Math.max(1, Math.min(10, Number(aiCfg.limiteGroserias) || 3));
      }
      if (typeof aiCfg.mensajeSesionTerminada === 'string') {
        aiCfg.mensajeSesionTerminada = cleanText(aiCfg.mensajeSesionTerminada, 500);
      }
      if (typeof aiCfg.mensajeSinInformacion === 'string') {
        aiCfg.mensajeSinInformacion = cleanText(aiCfg.mensajeSinInformacion, 500);
      }
      if (typeof aiCfg.sugerirAsesorAutomatico !== 'undefined') {
        aiCfg.sugerirAsesorAutomatico = Boolean(aiCfg.sugerirAsesorAutomatico);
      }
      if (aiCfg.roles && typeof aiCfg.roles === 'object') {
        const validKeys = ['administrador', 'docente', 'estudiante', 'padre'];
        for (const key of Object.keys(aiCfg.roles)) {
          if (!validKeys.includes(key)) {
            delete aiCfg.roles[key];
            continue;
          }
          const role = aiCfg.roles[key];
          if (typeof role.descripcion === 'string') {
            role.descripcion = cleanText(role.descripcion, 500);
          }
          if (typeof role.mensajeRestringido === 'string') {
            role.mensajeRestringido = cleanText(role.mensajeRestringido, 500);
          }
          if (Array.isArray(role.temasRestringidos)) {
            role.temasRestringidos = role.temasRestringidos
              .map((t: any) => cleanText(String(t), 50))
              .filter(Boolean)
              .slice(0, 30);
          }
        }
      }
      if (Array.isArray(aiCfg.temasInstitucionales)) {
        aiCfg.temasInstitucionales = aiCfg.temasInstitucionales
          .slice(0, 30)
          .map((t: any) => {
            if (!t || typeof t !== 'object') return null;
            return {
              tema: cleanText(String(t.tema ?? ''), 100),
              mensaje:
                typeof t.mensaje === 'string' ? cleanText(t.mensaje, 500) : '',
            };
          })
          .filter((x: any) => x && x.tema);
      }
      if (typeof aiCfg.mensajeRedireccionGenerico === 'string') {
        aiCfg.mensajeRedireccionGenerico = cleanText(
          aiCfg.mensajeRedireccionGenerico,
          500,
        );
      }
      const jsonStr = JSON.stringify(aiCfg);
      if (jsonStr.length > 50000) {
        data.aiPromptConfig = null;
      }
    }
  }

  private normalizeAlmuerzos(almuerzos: HorarioAlmuerzo[]): HorarioAlmuerzo[] {
    const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    const byDia = new Map<number, HorarioAlmuerzo>();
    for (const a of almuerzos) {
      if (
        !a ||
        !Number.isInteger(a.dia) ||
        a.dia < 0 ||
        a.dia > 6 ||
        typeof a.inicio !== 'string' ||
        typeof a.fin !== 'string' ||
        !HHMM_RE.test(a.inicio) ||
        !HHMM_RE.test(a.fin)
      ) {
        continue;
      }
      const [h1, m1] = a.inicio.split(':').map(Number);
      const [h2, m2] = a.fin.split(':').map(Number);
      if (h1 * 60 + m1 >= h2 * 60 + m2) continue;
      byDia.set(a.dia, { dia: a.dia, inicio: a.inicio, fin: a.fin });
    }
    return [...byDia.values()].sort((a, b) => a.dia - b.dia);
  }

  async resetearOverride(advisorId: string): Promise<{ ok: boolean }> {
    await this.repo.delete({ advisorId });
    return { ok: true };
  }

  async estaEnHorario(_advisorId?: string): Promise<boolean> {
    const estado = await this.getHorarioEstado();
    return estado.enJornada;
  }

  async getHorarioEstado(): Promise<HorarioEstado> {
    const config = await this.getGlobal();
    const horarios = [...(config.horarios ?? [])].sort(
      (a, b) => a.dia - b.dia,
    );
    const ahora = new Date();
    const diaHoy = ahora.getDay();
    const hhmm = this.hhmm(ahora);

    if (!config.horariosActivos) {
      return {
        enJornada: true,
        diaHoy,
        horarios,
        mensaje: '',
        proximaApertura: '',
        horaApertura: '',
        proximaTipo: '',
        proximaDia: -1,
        proximaInicio: '',
      };
    }

    const slotsHoy = horarios.filter((h) => h.dia === diaHoy);
    const enJornada = slotsHoy.some(
      (slot) => hhmm >= slot.inicio && hhmm < slot.fin,
    );
    const proxima = this.getProximaApertura(horarios, ahora);

    return {
      enJornada,
      diaHoy,
      horarios,
      mensaje: config.horarioFueraMsg,
      proximaApertura: proxima.label,
      horaApertura: proxima.hora,
      proximaTipo: proxima.tipo,
      proximaDia: proxima.dia,
      proximaInicio: proxima.hora,
    };
  }

  async estaEnAlmuerzo(advisorId: string): Promise<boolean> {
    const config = await this.getEfectiva(advisorId);
    return this.slotActivo(config.almuerzos ?? []);
  }

  private slotActivo(slots: HorarioAlmuerzo[]): boolean {
    const ahora = new Date();
    const dia = ahora.getDay();
    const hhmm = this.hhmm(ahora);
    const slot = slots.find((item) => item.dia === dia);
    return !!slot && hhmm >= slot.inicio && hhmm < slot.fin;
  }

  private getProximaApertura(
    horarios: HorarioSlot[],
    ahora: Date,
  ): { label: string; hora: string; tipo: HorarioEstado['proximaTipo']; dia: number } {
    if (!horarios.length)
      return { label: 'en nuestro proximo horario', hora: '', tipo: '', dia: -1 };

    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const diaHoy = ahora.getDay();

    for (let offset = 0; offset <= 7; offset++) {
      const dia = (diaHoy + offset) % 7;
      const slotsDia = horarios
        .filter((slot) => slot.dia === dia)
        .sort((a, b) => this.toMinutes(a.inicio) - this.toMinutes(b.inicio));

      for (const slot of slotsDia) {
        if (offset === 0 && this.toMinutes(slot.inicio) <= minutosAhora)
          continue;
        if (offset === 0)
          return { label: `hoy a las ${slot.inicio}`, hora: slot.inicio, tipo: 'hoy', dia };
        if (offset === 1)
          return { label: `manana a las ${slot.inicio}`, hora: slot.inicio, tipo: 'manana', dia };
        return {
          label: `el ${this.dias[dia]} a las ${slot.inicio}`,
          hora: slot.inicio,
          tipo: 'fecha',
          dia,
        };
      }
    }

    return { label: 'en nuestro proximo horario', hora: '', tipo: '', dia: -1 };
  }

  private hhmm(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private toMinutes(hora: string): number {
    const [h = 0, m = 0] = hora.split(':').map(Number);
    return h * 60 + m;
  }
}
