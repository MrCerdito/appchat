import { AuthService } from './auth.service';
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class RegisterDto {
    name: string;
    email: string;
    password: string;
}
export declare class RefreshDto {
    refresh_token: string;
}
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(body: LoginDto): Promise<{
        access_token: string;
        refresh_token: string;
        user: any;
    }>;
    refresh(body: RefreshDto): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    logout(req: any): Promise<{
        message: string;
    }>;
    register(body: RegisterDto): Promise<{
        id: string;
        name: string;
        email: string;
    }>;
}
