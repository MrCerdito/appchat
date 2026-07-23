import { ConfiguracionService } from './configuracion.service';
import { GuardarConfigGlobalDto } from './dto/guardar-config-global.dto';
import { GuardarConfigAdvisorDto } from './dto/guardar-config-advisor.dto';
export declare class ConfiguracionController {
    private readonly svc;
    constructor(svc: ConfiguracionService);
    horarioHoy(): Promise<import("./configuracion.service").HorarioEstado>;
    getEfectiva(req: any): Promise<import("./entities/configuracion.entity").Configuracion>;
    getGlobal(): Promise<import("./entities/configuracion.entity").Configuracion>;
    guardar(body: GuardarConfigAdvisorDto, req: any): Promise<import("./entities/configuracion.entity").Configuracion>;
    guardarGlobal(body: GuardarConfigGlobalDto): Promise<import("./entities/configuracion.entity").Configuracion>;
    getQuickReplies(): Promise<any[]>;
    guardarQuickReplies(body: {
        whatsappQuickReplies: any[];
    }): Promise<import("./entities/configuracion.entity").Configuracion>;
    resetear(req: any): Promise<{
        ok: boolean;
    }>;
    getTicketCategories(): Promise<string[]>;
}
