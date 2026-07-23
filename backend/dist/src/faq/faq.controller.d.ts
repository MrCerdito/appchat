import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
export declare class FaqController {
    private readonly faqService;
    constructor(faqService: FaqService);
    findAll(colegioId?: string, q?: string): Promise<import("./entities/faq.entity").Faq[]>;
    findCategorias(colegioId?: string): Promise<string[]>;
    findOne(id: number): Promise<import("./entities/faq.entity").Faq>;
    create(dto: CreateFaqDto): Promise<import("./entities/faq.entity").Faq>;
    update(id: number, dto: UpdateFaqDto): Promise<import("./entities/faq.entity").Faq>;
    remove(id: number): Promise<void>;
}
