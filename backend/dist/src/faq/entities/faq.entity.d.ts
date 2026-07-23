export declare class Faq {
    id: number;
    pregunta: string;
    respuesta: string;
    categoria: string | null;
    keywords: string[] | null;
    colegioId: number | null;
    orden: number;
    activo: boolean;
    createdAt: Date;
    updatedAt: Date;
}
