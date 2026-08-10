import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  Configuracion,
  HorarioAlmuerzo,
  HorarioSlot,
} from './entities/configuracion.entity';
import { cleanText, normalizeText } from '../common/security/sanitize.helper';

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

    const count = await this.repo.count({ where: { advisorId: null as any } });
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

  async getEfectiva(advisorId?: string): Promise<Configuracion> {
    const key = this.cacheKey(advisorId);
    const cached = await this.getFromCache(key);
    if (cached) return cached;

    if (advisorId) {
      const override = await this.repo.findOne({ where: { advisorId } });
      if (override) {
        await this.setCache(key, override);
        return override;
      }
    }

    const global = await this.repo.findOne({
      where: { advisorId: null as any },
    });
    if (global) {
      await this.setCache(this.cacheKey(), global);
      return global;
    }

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
    };
    const nueva = this.repo.create({ ...defaults, advisorId: null });
    const saved = await this.repo.save(nueva);
    await this.setCache(this.cacheKey(), saved);
    return saved;
  }

  async getEfectivaBatch(advisorIds: string[]): Promise<Map<string, Configuracion>> {
    const result = new Map<string, Configuracion>();
    const missingIds: string[] = [];

    const globalCached = await this.getFromCache(this.cacheKey());
    let globalConfig: Configuracion | null = globalCached;

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
        if (override) {
          await this.setCache(this.cacheKey(id), override);
          result.set(id, override);
        } else {
          if (!globalConfig) {
            globalConfig = await this.repo.findOne({ where: { advisorId: null as any } });
            if (globalConfig) await this.setCache(this.cacheKey(), globalConfig);
          }
          if (globalConfig) result.set(id, globalConfig);
        }
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
      where: { advisorId: (advisorId ?? null) as any },
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
      const global = await this.repo.findOne({ where: { advisorId: null as any } });
      const defaults = global ? { ...global } : {};
      delete (defaults as any).id;
      delete (defaults as any).advisorId;
      const nueva = this.repo.create({ ...defaults, ...data, advisorId: advisorId ?? null });
      saved = await this.repo.save(nueva);
    }

    this.invalidateCache(advisorId);
    if (!advisorId) {
      this.invalidateCache();
    }

    return saved;
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
    ];

    for (const key of textKeys) {
      const value = data[key];
      if (typeof value === 'string') {
        (data as any)[key] = cleanText(value, 4096);
      }
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
