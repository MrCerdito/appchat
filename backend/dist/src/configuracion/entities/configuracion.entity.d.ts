export interface HorarioSlot {
    dia: number;
    inicio: string;
    fin: string;
}
export interface HorarioAlmuerzo {
    dia: number;
    inicio: string;
    fin: string;
}
export declare class Configuracion {
    id: string;
    advisorId: string | null;
    mensajeBienvenida: string;
    asesorInactividadSeg: number;
    asesorInactividadMsg: string;
    clienteInactividadSeg: number;
    clienteInactividadMsg: string;
    clienteInactividadIters: number;
    clienteCierreMsg: string;
    horarios: HorarioSlot[];
    horarioFueraMsg: string;
    horariosActivos: boolean;
    whatsappAssignmentMsg: string;
    whatsappQueueMsg: string;
    whatsappOutOfHoursMsg: string;
    whatsappCallUnavailableMsg: string;
    whatsappQuickReplies: any[];
    almuerzos: HorarioAlmuerzo[];
    ticketCategories: string[];
    sonidoActivado: boolean;
    sonidoWhatsapp: string;
    sonidoAsesor: string;
    sonidoCliente: string;
    sonidoAsignacion: string;
    aiPromptConfig: Record<string, any> | null;
    createdAt: Date;
    updatedAt: Date;
}
