import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Configuracion,
  HorarioAlmuerzo,
  HorarioSlot,
} from './entities/configuracion.entity';
import { cleanText } from '../common/security/sanitize.helper';

export interface HorarioEstado {
  enJornada: boolean;
  diaHoy: number;
  horarios: HorarioSlot[];
  mensaje: string;
  proximaApertura: string;
  horaApertura: string;
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

  private configCache = new Map<
    string,
    { data: Configuracion; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(Configuracion)
    private readonly repo: Repository<Configuracion>,
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
      DEFAULT 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.'
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

    const count = await this.repo.count({ where: { advisorId: null as any } });
    if (count === 0) {
      await this.getGlobal();
    }
  }

  private cacheKey(advisorId?: string): string {
    return advisorId ? `advisor:${advisorId}` : 'global';
  }

  private getFromCache(key: string): Configuracion | null {
    const entry = this.configCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.configCache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: Configuracion): void {
    this.configCache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  private invalidateCache(advisorId?: string): void {
    this.configCache.delete(this.cacheKey(advisorId));
  }

  async getEfectiva(advisorId?: string): Promise<Configuracion> {
    const key = this.cacheKey(advisorId);
    const cached = this.getFromCache(key);
    if (cached) return cached;

    if (advisorId) {
      const override = await this.repo.findOne({ where: { advisorId } });
      if (override) {
        this.setCache(key, override);
        return override;
      }
    }

    const global = await this.repo.findOne({
      where: { advisorId: null as any },
    });
    if (global) {
      this.setCache('global', global);
      return global;
    }

    const defaults: Partial<Configuracion> = {
      mensajeBienvenida: '¡Bienvenido! ¿En qué puedo ayudarte?',
      asesorInactividadMsg:
        'El asesor se ha desconectado. En breve lo atenderá otro.',
      clienteInactividadMsg: '¿Sigues ahí? Escribe algo para continuar.',
      clienteCierreMsg: 'Gracias por contactarnos. Que tengas un buen día.',
      horarioFueraMsg:
        'Estamos fuera del horario de atención. Vuelve en nuestro horario habitual.',
      whatsappAssignmentMsg:
        'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
      whatsappQueueMsg:
        'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
      whatsappOutOfHoursMsg:
        'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
      whatsappCallUnavailableMsg:
        'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
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
    };
    const nueva = this.repo.create({ ...defaults, advisorId: null });
    const saved = await this.repo.save(nueva);
    this.setCache('global', saved);
    return saved;
  }

  async getGlobal(): Promise<Configuracion> {
    return this.getEfectiva();
  }

  async guardar(
    data: Partial<Configuracion>,
    advisorId?: string,
  ): Promise<Configuracion> {
    this.sanitizeConfigText(data);

    if (Array.isArray(data.whatsappQuickReplies)) {
      data.whatsappQuickReplies = data.whatsappQuickReplies
        .map((reply) => cleanText(reply, 500))
        .filter(Boolean)
        .slice(0, 20);
    }

    const existing = await this.repo.findOne({
      where: { advisorId: (advisorId ?? null) as any },
    });

    let saved: Configuracion;

    if (existing) {
      Object.assign(existing, data);
      saved = await this.repo.save(existing);
    } else {
      const nueva = this.repo.create({ ...data, advisorId: advisorId ?? null });
      saved = await this.repo.save(nueva);
    }

    this.invalidateCache(advisorId);
    if (!advisorId) {
      this.invalidateCache(undefined);
    }

    return saved;
  }

  private sanitizeConfigText(data: Partial<Configuracion>): void {
    const textKeys: (keyof Configuracion)[] = [
      'mensajeBienvenida',
      'asesorInactividadMsg',
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
    const horarios = config.horarios ?? [];
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
      };
    }

    const slotHoy = horarios.find((h) => h.dia === diaHoy);
    const enJornada = slotHoy
      ? hhmm >= slotHoy.inicio && hhmm < slotHoy.fin
      : false;
    const proxima = this.getProximaApertura(horarios, ahora);

    return {
      enJornada,
      diaHoy,
      horarios,
      mensaje: config.horarioFueraMsg,
      proximaApertura: proxima.label,
      horaApertura: proxima.hora,
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
  ): { label: string; hora: string } {
    if (!horarios.length)
      return { label: 'en nuestro proximo horario', hora: '' };

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
          return { label: `hoy a las ${slot.inicio}`, hora: slot.inicio };
        if (offset === 1)
          return { label: `manana a las ${slot.inicio}`, hora: slot.inicio };
        return {
          label: `el ${this.dias[dia]} a las ${slot.inicio}`,
          hora: slot.inicio,
        };
      }
    }

    return { label: 'en nuestro proximo horario', hora: '' };
  }

  private hhmm(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private toMinutes(hora: string): number {
    const [h = 0, m = 0] = hora.split(':').map(Number);
    return h * 60 + m;
  }
}
