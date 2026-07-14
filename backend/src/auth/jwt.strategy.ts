import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    name: string;
    role: string;
  }) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no válido o desactivado');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
