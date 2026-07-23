import { Repository, DataSource } from 'typeorm';
import { Documento } from './entities/documento.entity';
import { ConfigService } from '@nestjs/config';
export declare class DocumentosService {
    private readonly docRepo;
    private readonly config;
    private readonly dataSource;
    private readonly logger;
    private readonly apiKey;
    private readonly embedUrl;
    private readonly CHUNK_SIZE;
    private readonly CHUNK_OVERLAP;
    constructor(docRepo: Repository<Documento>, config: ConfigService, dataSource: DataSource);
    procesarPdf(data: {
        nombre: string;
        descripcion: string;
        categoria: string;
        colegio?: string;
        rolesPermitidos: string[];
        pdfBuffer: Buffer;
        pdfPath: string;
        pdfUrl: string;
    }): Promise<{
        ok: boolean;
        chunks: number;
        nombre: string;
    }>;
    buscarRelevantes(query: string, colegio?: string, rol?: string, topK?: number): Promise<{
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
    listar(): Promise<any[]>;
    actualizarRoles(nombre: string, data: {
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
    repararEmbeddingVec(): Promise<{
        reparados: number;
        errores: number;
    }>;
    private extraerTextoPdf;
    private dividirEnChunks;
    private generarEmbedding;
    private buscarPorTexto;
}
