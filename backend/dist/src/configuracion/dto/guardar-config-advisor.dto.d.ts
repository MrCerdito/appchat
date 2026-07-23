import { HorarioAlmuerzo } from '../entities/configuracion.entity';
export declare class GuardarConfigAdvisorDto {
    mensajeBienvenida?: string;
    horarioFueraMsg?: string;
    asesorInactividadSeg?: number;
    asesorInactividadMsg?: string;
    clienteInactividadSeg?: number;
    clienteInactividadMsg?: string;
    clienteInactividadIters?: number;
    clienteCierreMsg?: string;
    almuerzos?: HorarioAlmuerzo[];
    whatsappQuickReplies?: any[];
}
