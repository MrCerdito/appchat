import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { User } from "../auth/entities/user.entity";
import { Message } from '../chat/entities/message.entity';
import { Colegio } from './entities/colegio.entity';
import { Rating } from './entities/rating.entity';
export declare class SessionsService {
    private readonly sessionRepo;
    private readonly userRepo;
    private readonly messageRepo;
    private readonly colegioRepo;
    private readonly ratingRepo;
    constructor(sessionRepo: Repository<Session>, userRepo: Repository<User>, messageRepo: Repository<Message>, colegioRepo: Repository<Colegio>, ratingRepo: Repository<Rating>);
    private readonly logger;
    private generarCodigo;
    create(data: {
        clientName: string;
        identificacion: string;
        apellido: string;
        rol: string;
        colegio: string;
        colegioLink?: string | null;
        tipoSolicitud: string;
    }): Promise<Session>;
    findCodigo(sessionId: string): Promise<{
        codigo: string;
    }>;
    requestAdvisor(sessionId: string): Promise<Session>;
    takeOver(sessionId: string, newAdvisorId: string): Promise<Session>;
    findAll(advisorId?: string): Promise<Session[]>;
    findAllPaginated(advisorId: string | undefined, page: number, limit: number): Promise<{
        data: Session[];
        total: number;
        page: number;
        pages: number;
    }>;
    addCollaborator(sessionId: string, advisorId: string): Promise<void>;
    findOne(id: string): Promise<Session>;
    findWaitingSessions(): Promise<Session[]>;
    assignAdvisor(sessionId: string, advisorId: string): Promise<Session>;
    findAvailableAdvisor(): Promise<User | null>;
    findAvailableAdvisorFromList(connectedIds: string[]): Promise<User | null>;
    incrementAdvisorChats(advisorId: string): Promise<void>;
    decrementAdvisorChats(advisorId: string): Promise<void>;
    syncAdvisorActiveChats(advisorId: string): Promise<number>;
    private pickLeastLoadedAdvisor;
    private getActiveCountsByAdvisor;
    setAdvisorStatus(advisorId: string, status: string): Promise<User | null>;
    saveRating(sessionId: string, estrellas: number, comentario: string | null, etiquetas: string[]): Promise<Rating>;
    getRating(sessionId: string): Promise<Rating | null>;
    findAdvisorById(id: string): Promise<User | null>;
    close(sessionId: string): Promise<Session>;
    transfer(sessionId: string, newAdvisorId: string): Promise<Session>;
    findAllAdvisors(): Promise<User[]>;
    private percentile;
    getMetricsByAdvisor(advisorId: string, timezone?: string): Promise<{
        advisor: User | null;
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
    getComentariosByAdvisor(advisorId: string, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
        page: number;
        pages: number;
    }>;
    getMessages(sessionId: string): Promise<Message[]>;
    getMetrics(): Promise<{
        total: number;
        active: number;
        waiting: number;
        ai: number;
        closed: number;
        avgMinutes: number;
        medianaMinutos: number;
        p95Minutos: number;
        advisors: User[];
    }>;
    findAllAdmin(): Promise<Session[]>;
    findAllAdminPaginated(page: number, limit: number): Promise<{
        data: Session[];
        total: number;
        page: number;
        pages: number;
    }>;
    findAllColegios(): Promise<Colegio[]>;
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
    getAllComentarios(page?: number, limit?: number, advisorId?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        pages: number;
    }>;
    findActiveSessionsByAdvisor(advisorId: string): Promise<Session[]>;
}
