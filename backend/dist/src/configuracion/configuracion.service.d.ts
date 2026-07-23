import { OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Configuracion, HorarioSlot } from './entities/configuracion.entity';
export interface HorarioEstado {
    enJornada: boolean;
    diaHoy: number;
    horarios: HorarioSlot[];
    mensaje: string;
    proximaApertura: string;
    horaApertura: string;
}
export declare class ConfiguracionService implements OnModuleInit {
    private readonly repo;
    private readonly dias;
    private configCache;
    private readonly CACHE_TTL_MS;
    constructor(repo: Repository<Configuracion>);
    onModuleInit(): Promise<void>;
    private cacheKey;
    private getFromCache;
    private setCache;
    private invalidateCache;
    getEfectiva(advisorId?: string): Promise<Configuracion>;
    getEfectivaBatch(advisorIds: string[]): Promise<Map<string, Configuracion>>;
    getGlobal(): Promise<Configuracion>;
    guardar(data: Partial<Configuracion>, advisorId?: string): Promise<Configuracion>;
    private sanitizeConfigText;
    resetearOverride(advisorId: string): Promise<{
        ok: boolean;
    }>;
    estaEnHorario(_advisorId?: string): Promise<boolean>;
    getHorarioEstado(): Promise<HorarioEstado>;
    estaEnAlmuerzo(advisorId: string): Promise<boolean>;
    private slotActivo;
    private getProximaApertura;
    private hhmm;
    private toMinutes;
}
