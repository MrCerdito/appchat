import { WidgetConfigService } from './widget-config.service';
import { WidgetConfig } from './entities/widget-config.entity';
import { SaveWidgetConfigDto } from './dto/save-widget-config.dto';
export declare class WidgetConfigController {
    private readonly svc;
    constructor(svc: WidgetConfigService);
    get(): Promise<WidgetConfig>;
    save(body: SaveWidgetConfigDto): Promise<WidgetConfig>;
    reset(): Promise<WidgetConfig>;
}
