import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
export declare class TicketsController {
    private readonly ticketsService;
    constructor(ticketsService: TicketsService);
    create(dto: CreateTicketDto, req: any): Promise<import("./ticket.entity").Ticket>;
    findAll(query: QueryTicketDto): Promise<{
        data: import("./ticket.entity").Ticket[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findAllSimple(): Promise<import("./ticket.entity").Ticket[]>;
    findOne(id: string): Promise<import("./ticket.entity").Ticket>;
    update(id: string, dto: UpdateTicketDto, req: any): Promise<import("./ticket.entity").Ticket>;
    delete(id: string): Promise<void>;
}
