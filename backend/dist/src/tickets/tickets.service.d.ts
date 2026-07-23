import { Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
export declare class TicketsService {
    private readonly repo;
    private readonly userRepo;
    constructor(repo: Repository<Ticket>, userRepo: Repository<User>);
    private generarCodigo;
    create(dto: CreateTicketDto, userId?: string): Promise<Ticket>;
    private createOnce;
    findAll(query: QueryTicketDto): Promise<{
        data: Ticket[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findAllSimple(): Promise<Ticket[]>;
    findById(id: string): Promise<Ticket>;
    update(id: string, dto: UpdateTicketDto, userId?: string): Promise<Ticket>;
    delete(id: string): Promise<void>;
}
