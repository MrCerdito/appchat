import { Comunicado } from './comunicado.entity';
export declare class ComunicadoEvento {
    id: string;
    comunicado: Comunicado;
    email: string;
    tipo: string;
    urlDestino: string | null;
    userAgent: string | null;
    ip: string | null;
    createdAt: Date;
}
