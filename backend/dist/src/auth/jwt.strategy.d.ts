import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly userRepo;
    constructor(config: ConfigService, userRepo: Repository<User>);
    validate(payload: {
        sub: string;
        email: string;
        name: string;
        role: string;
    }): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
    }>;
}
export {};
