import { Repository } from 'typeorm';
import { Faq } from './entities/faq.entity';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
export declare class FaqService {
    private readonly faqRepo;
    constructor(faqRepo: Repository<Faq>);
    findAll(colegioId?: number, q?: string): Promise<Faq[]>;
    findCategorias(colegioId?: number): Promise<string[]>;
    findOne(id: number): Promise<Faq>;
    create(dto: CreateFaqDto): Promise<Faq>;
    update(id: number, dto: UpdateFaqDto): Promise<Faq>;
    remove(id: number): Promise<void>;
}
