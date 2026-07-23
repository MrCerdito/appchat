import type { Response, Request } from 'express';
import { ComunicadosService } from '../comunicados/comunicados.service';
export declare class TrackController {
    private readonly comunicadosService;
    constructor(comunicadosService: ComunicadosService);
    trackOpen(id: string, email: string, req: Request, res: Response): Promise<void>;
    trackClick(id: string, email: string, url: string, req: Request, res: Response): Promise<void>;
}
