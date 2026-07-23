import { HorarioSlot, HorarioAlmuerzo } from '../entities/configuracion.entity';
export declare class GuardarConfigGlobalDto {
    mensajeBienvenida?: string;
    asesorInactividadSeg?: number;
    asesorInactividadMsg?: string;
    clienteInactividadSeg?: number;
    clienteInactividadMsg?: string;
    clienteInactividadIters?: number;
    clienteCierreMsg?: string;
    horarios?: HorarioSlot[];
    horarioFueraMsg?: string;
    horariosActivos?: boolean;
    almuerzos?: HorarioAlmuerzo[];
    whatsappAssignmentMsg?: string;
    whatsappQueueMsg?: string;
    whatsappOutOfHoursMsg?: string;
    whatsappCallUnavailableMsg?: string;
    whatsappQuickReplies?: any[];
    ticketCategories?: string[];
    sonidoActivado?: boolean;
    sonidoWhatsapp?: string;
    sonidoAsesor?: string;
    sonidoCliente?: string;
    sonidoAsignacion?: string;
    aiPromptConfig?: Record<string, any>;
}
