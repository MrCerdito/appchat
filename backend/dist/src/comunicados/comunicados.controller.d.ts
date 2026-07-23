import { ComunicadosService } from './comunicados.service';
export declare class ComunicadoDto {
    asunto: string;
    cuerpo: string;
    destinatarios: {
        email: string;
        nombre: string;
    }[];
}
export declare class ComunicadosController {
    private readonly service;
    constructor(service: ComunicadosService);
    findAll(req: any): Promise<import("./entities/comunicado.entity").Comunicado[]>;
    getColegios(): Promise<import("../sessions/entities/colegio.entity").Colegio[]>;
    findOne(id: string): Promise<import("./entities/comunicado.entity").Comunicado>;
    saveDraft(dto: ComunicadoDto, req: any): Promise<import("./entities/comunicado.entity").Comunicado>;
    update(id: string, dto: ComunicadoDto): Promise<import("./entities/comunicado.entity").Comunicado>;
    send(id: string): Promise<import("./entities/comunicado.entity").Comunicado>;
    remove(id: string): Promise<void>;
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
        eventos: import("./entities/comunicado-evento.entity").ComunicadoEvento[];
    }>;
    resendWebhook(body: any): Promise<{
        ok: boolean;
    }>;
}
