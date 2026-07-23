import { DocumentosService } from './documentos.service';
export declare class DocumentosController {
    private readonly docService;
    constructor(docService: DocumentosService);
    listar(): Promise<any[]>;
    upload(file: any, body: {
        nombre: string;
        descripcion: string;
        categoria: string;
        colegio?: string;
        rolesPermitidos?: string;
    }): Promise<{
        ok: boolean;
        chunks: number;
        nombre: string;
    }>;
    actualizarRoles(nombre: string, body: {
        descripcion: string;
        categoria: string;
        colegio: string | null;
        rolesPermitidos: string;
    }): Promise<{
        ok: boolean;
    }>;
    eliminar(nombre: string): Promise<{
        ok: boolean;
    }>;
    buscar(body: {
        query: string;
        colegio?: string;
        topK?: number;
    }): Promise<{
        contexto: string;
        documentos: {
            nombre: string;
            pdfUrl: string | null;
            categoria: string | null;
        }[];
        chunks: {
            nombre: string;
            pdfUrl: string | null;
            categoria: string | null;
            chunkIndex: number;
            distancia: number | null;
            contenido: string;
        }[];
    }>;
}
