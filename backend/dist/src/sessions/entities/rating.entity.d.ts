import { Session } from './session.entity';
export declare class Rating {
    id: string;
    session: Session;
    estrellas: number;
    comentario: string | null;
    etiquetas: string[];
    createdAt: Date;
}
