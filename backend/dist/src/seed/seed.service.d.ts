import { OnApplicationBootstrap } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { WidgetConfig } from '../widget/entities/widget-config.entity';
import { Faq } from '../faq/entities/faq.entity';
import { Colegio } from '../sessions/entities/colegio.entity';
export declare class SeedService implements OnApplicationBootstrap {
    private readonly userRepo;
    private readonly configRepo;
    private readonly widgetRepo;
    private readonly faqRepo;
    private readonly colegioRepo;
    private readonly logger;
    constructor(userRepo: Repository<User>, configRepo: Repository<Configuracion>, widgetRepo: Repository<WidgetConfig>, faqRepo: Repository<Faq>, colegioRepo: Repository<Colegio>);
    onApplicationBootstrap(): Promise<void>;
    private seed;
    private seedUsers;
    private seedConfiguracion;
    private seedWidgetConfig;
    private seedColegios;
    private seedFaqs;
}
