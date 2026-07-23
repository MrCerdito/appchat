import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}
export declare class AdvisorsService {
    private readonly userRepo;
    constructor(userRepo: Repository<User>);
    findAll(): Promise<User[]>;
    findAllPaginated(page: number, limit: number, search?: string): Promise<PaginatedResult<User>>;
    findById(id: string): Promise<User>;
    create(name: string, email: string, password: string): Promise<User>;
    update(id: string, dto: {
        name?: string;
        email?: string;
    }): Promise<User>;
    updatePassword(id: string, password: string): Promise<void>;
    toggle(id: string): Promise<User>;
    remove(id: string): Promise<void>;
    updatePhoto(id: string, profilePhotoUrl: string | null): Promise<User>;
}
