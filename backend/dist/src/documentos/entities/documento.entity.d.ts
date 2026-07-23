export declare class Documento {
    id: string;
    nombre: string;
    descripcion: string | null;
    contenido: string;
    chunkIndex: number;
    totalChunks: number;
    embedding: string | null;
    pdfPath: string | null;
    pdfUrl: string | null;
    colegio: string | null;
    categoria: string | null;
    rolesPermitidos: string | null;
    activo: boolean;
    createdAt: Date;
}
