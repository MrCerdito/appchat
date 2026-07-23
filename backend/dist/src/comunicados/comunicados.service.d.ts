import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Comunicado, Destinatario } from './entities/comunicado.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { ComunicadoEvento } from './entities/comunicado-evento.entity';
export declare class ComunicadosService {
    private readonly eventoRepo;
    private readonly comunicadoRepo;
    private readonly colegioRepo;
    private readonly config;
    private resend;
    constructor(eventoRepo: Repository<ComunicadoEvento>, comunicadoRepo: Repository<Comunicado>, colegioRepo: Repository<Colegio>, config: ConfigService);
    findAll(userId: string, role: string): Promise<Comunicado[]>;
    findOne(id: string): Promise<Comunicado>;
    saveDraft(asunto: string, cuerpo: string, destinatarios: Destinatario[], user: User): Promise<Comunicado>;
    updateDraft(id: string, asunto: string, cuerpo: string, destinatarios: Destinatario[]): Promise<Comunicado>;
    send(id: string): Promise<Comunicado>;
    getStats(id: string): Promise<{
        totalEnviados: number;
        totalAperturas: number;
        totalClics: number;
        tasaApertura: number;
        tasaClics: number;
        detalle: {
            email: string;
            nombre: string;
            aperturas: number;
            clics: number;
            sendStatus: "ok" | "failed";
            sendError: string | null;
        }[];
        eventos: ComunicadoEvento[];
    }>;
    remove(id: string): Promise<void>;
    getColegios(): Promise<Colegio[]>;
    registrarApertura(comunicadoId: string, email: string, userAgent: string, ip: string): Promise<void>;
    markBounced(email: string, reason: string): Promise<void>;
    registrarClic(comunicadoId: string, email: string, urlDestino: string, userAgent: string, ip: string): Promise<string>;
    private injectTracking;
}
