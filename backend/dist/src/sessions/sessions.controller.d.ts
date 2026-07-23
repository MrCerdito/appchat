import { Repository } from 'typeorm';
import { SessionsService } from './sessions.service';
import { TicketsService } from '../tickets/tickets.service';
import { Message } from '../chat/entities/message.entity';
import { ChatGateway } from '../chat/chat.gateway';
export declare class CreateSessionDto {
    clientName: string;
    identificacion: string;
    apellido: string;
    rol: string;
    colegio: string;
    colegioLink?: string | null;
    tipoSolicitud: string;
}
export declare class SessionsController {
    private readonly sessionsService;
    private readonly ticketsService;
    private readonly messageRepo;
    private readonly chatGateway;
    private readonly logger;
    constructor(sessionsService: SessionsService, ticketsService: TicketsService, messageRepo: Repository<Message>, chatGateway: ChatGateway);
    create(dto: CreateSessionDto): Promise<import("./entities/session.entity").Session>;
    findAll(req: any): Promise<import("./entities/session.entity").Session[]>;
    findAllPaginated(req: any, page?: string, limit?: string): Promise<{
        data: import("./entities/session.entity").Session[];
        total: number;
        page: number;
        pages: number;
    }>;
    findAdvisors(): Promise<{
        status: "online" | "busy" | "offline";
        id: string;
        name: string;
        email: string;
        password: string;
        role: string;
        active: boolean;
        createdAt: Date;
        activeChats: number;
        profilePhotoUrl: string | null;
        sessions: import("./entities/session.entity").Session[];
        refreshToken: string | null;
    }[]>;
    findWaiting(): Promise<import("./entities/session.entity").Session[]>;
    getMetrics(): Promise<{
        total: number;
        active: number;
        waiting: number;
        ai: number;
        closed: number;
        avgMinutes: number;
        medianaMinutos: number;
        p95Minutos: number;
        advisors: import("../auth/entities/user.entity").User[];
    }>;
    getMetricsByAdvisor(id: string, tz?: string): Promise<{
        advisor: import("../auth/entities/user.entity").User | null;
        hoy: number;
        semana: number;
        total: number;
        totalCerradas: number;
        totalActivas: number;
        tasaResolucion: number;
        avgResolucionMin: number;
        medianaResolucionMin: number;
        p95ResolucionMin: number;
        avgPrimeraRespuestaMin: number;
        medianaPrimeraRespuestaMin: number;
        p95PrimeraRespuestaMin: number;
        totalRatings: number;
        avgEstrellas: number;
        topEtiquetas: {
            etiqueta: string;
            count: number;
        }[];
    }>;
    findAllAdmin(): Promise<import("./entities/session.entity").Session[]>;
    findAllAdminPaginated(page?: string, limit?: string): Promise<{
        data: import("./entities/session.entity").Session[];
        total: number;
        page: number;
        pages: number;
    }>;
    findColegios(): Promise<import("./entities/colegio.entity").Colegio[]>;
    getRankingAsesores(): Promise<{
        id: string;
        name: string;
        status: string;
        activeChats: number;
        total: number;
        totalCerradas: number;
        totalRatings: number;
        avgEstrellas: number;
        bayesianAvg: number;
    }[]>;
    getComentariosByAdvisor(id: string, page?: string, limit?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        pages: number;
    }>;
    getAllComentarios(page?: string, limit?: string, advisorId?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        pages: number;
    }>;
    setMyStatus(status: string, req: any): Promise<{
        ok: boolean;
    }>;
    takeOver(id: string, req: any): Promise<import("./entities/session.entity").Session>;
    findOne(id: string, req: any): Promise<import("./entities/session.entity").Session>;
    findCodigo(id: string): Promise<{
        codigo: string;
    }>;
    getMessages(id: string): Promise<Message[]>;
    close(id: string, req: any): Promise<import("./entities/session.entity").Session>;
    closeAnonymous(id: string): Promise<import("./entities/session.entity").Session>;
    saveRating(id: string, body: {
        estrellas: number;
        comentario?: string;
        etiquetas?: string[];
    }, req: any): Promise<import("./entities/rating.entity").Rating>;
    getRating(id: string): Promise<import("./entities/rating.entity").Rating | null>;
    createTicketFromSession(id: string, body: {
        titulo?: string;
        descripcion?: string;
        priority?: string;
        category?: string;
    }, req: any): Promise<import("../tickets/ticket.entity").Ticket>;
}
