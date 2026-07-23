import { Repository } from 'typeorm';
import { AiLog } from './entities/ai-log.entity';
export interface LogData {
    sessionId?: string;
    colegio?: string;
    rol?: string;
    tipoSolicitud?: string;
    clientName?: string;
    pregunta: string;
    respuesta?: string;
    chunksUsados?: {
        nombre: string;
        categoria: string | null;
        chunkIndex: number;
        distancia: number | null;
        fragmento: string;
    }[];
    tuvoContexto?: boolean;
    tiempoRespuestaMs?: number;
    tokensEstimados?: number;
    transfer?: boolean;
    feedback?: boolean;
    esRestringido?: boolean;
    huboError?: boolean;
    errorMsg?: string;
}
export declare class AiLogsService {
    private readonly repo;
    private readonly logger;
    constructor(repo: Repository<AiLog>);
    guardar(data: LogData): Promise<void>;
    actualizarFeedback(sessionId: string, pregunta: string, util: boolean): Promise<void>;
    getStats(colegio?: string): Promise<{
        total: number;
        conContexto: number;
        transfers: number;
        errores: number;
        feedbackUtil: number;
        tiempoPromedioMs: number;
        tasaContexto: number;
        tasaTransfer: number;
        tasaFeedbackUtil: number;
    }>;
}
