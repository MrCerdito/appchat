import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const access_token = this.jwtService.sign(payload);
    const refresh_secret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refresh_secret) {
      throw new Error('JWT_REFRESH_SECRET no está configurado');
    }
    const refresh_token = this.jwtService.sign(payload, {
      secret: refresh_secret,
      expiresIn: '30d',
    });
    return { access_token, refresh_token };
  }

  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_MINUTES = 15;

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada. Intenta de nuevo en ${mins} minuto(s)`,
      );
    }

    if (!(await bcrypt.compare(password, user.password))) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Partial<typeof user> = {
        failedLoginAttempts: attempts,
      };
      if (attempts >= this.MAX_FAILED_ATTEMPTS) {
        update.lockedUntil = new Date(
          Date.now() + this.LOCKOUT_MINUTES * 60_000,
        );
        update.failedLoginAttempts = 0;
      }
      await this.userRepo.update(user.id, update);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userRepo.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    const { access_token, refresh_token } = this.generateTokens(user);

    user.refreshToken = await bcrypt.hash(refresh_token, 8);
    await this.userRepo.save(user);

    const userData: any = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    if (user.profilePhotoUrl) userData.profilePhotoUrl = user.profilePhotoUrl;
    return {
      access_token,
      refresh_token,
      user: userData,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Sesión inválida');
      }

      const valid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!valid) {
        throw new UnauthorizedException('Refresh token inválido');
      }

      const { access_token, refresh_token } = this.generateTokens(user);

      // Rotar refresh token
      user.refreshToken = await bcrypt.hash(refresh_token, 8);
      await this.userRepo.save(user);

      return { access_token, refresh_token };
    } catch {
      throw new UnauthorizedException(
        'Sesión expirada, inicia sesión nuevamente',
      );
    }
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Sesión cerrada' };
  }
}
