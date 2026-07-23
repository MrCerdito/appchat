import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
export declare class AuthService {
    private readonly userRepo;
    private readonly jwtService;
    private readonly config;
    constructor(userRepo: Repository<User>, jwtService: JwtService, config: ConfigService);
    private generateTokens;
    login(email: string, password: string): Promise<{
        access_token: string;
        refresh_token: string;
        user: any;
    }>;
    refresh(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    logout(userId: string): Promise<{
        message: string;
    }>;
    register(name: string, email: string, password: string): Promise<{
        id: string;
        name: string;
        email: string;
    }>;
    validateToken(userId: string): Promise<User | null>;
}
