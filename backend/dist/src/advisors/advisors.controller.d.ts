import { AdvisorsService } from './advisors.service';
import { CreateAdvisorDto } from './dto/create-advisor.dto';
import { UpdateAdvisorDto } from './dto/update-advisor.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { QueryAdvisorDto } from './dto/query-advisor.dto';
import { User } from '../auth/entities/user.entity';
export declare class AdvisorsController {
    private readonly advisorsService;
    constructor(advisorsService: AdvisorsService);
    findAll(query: QueryAdvisorDto): Promise<{
        data: User[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    } | User[]>;
    findOne(id: string): Promise<User>;
    create(body: CreateAdvisorDto): Promise<User>;
    update(id: string, body: UpdateAdvisorDto): Promise<User>;
    updatePassword(id: string, body: UpdatePasswordDto): Promise<{
        ok: boolean;
    }>;
    toggle(id: string): Promise<User>;
    remove(id: string): Promise<void>;
    uploadPhoto(id: string, file: Express.Multer.File, req: any): Promise<{
        profilePhotoUrl: string;
    }>;
    deletePhoto(id: string, req: any): Promise<{
        ok: boolean;
    }>;
}
