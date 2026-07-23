import { Repository } from 'typeorm';
import { WidgetConfig } from './entities/widget-config.entity';
export declare class WidgetConfigService {
    private readonly repo;
    constructor(repo: Repository<WidgetConfig>);
    get(): Promise<WidgetConfig>;
    save(data: Partial<WidgetConfig>): Promise<WidgetConfig>;
    reset(): Promise<WidgetConfig>;
}
