export declare class AiLog {
    id: string;
    sessionId: string;
    colegio: string;
    rol: string;
    tipoSolicitud: string;
    clientName: string;
    pregunta: string;
    respuesta: string;
    chunksUsados: {
        nombre: string;
        categoria: string | null;
        chunkIndex: number;
        distancia: number | null;
        fragmento: string;
    }[];
    tuvoContexto: boolean;
    tiempoRespuestaMs: number;
    tokensEstimados: number;
    transfer: boolean;
    feedback: boolean;
    esRestringido: boolean;
    huboError: boolean;
    errorMsg: string;
    creadoEn: Date;
}
