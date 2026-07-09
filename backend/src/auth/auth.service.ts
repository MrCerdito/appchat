import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
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
    const payload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') || this.config.get<string>('JWT_SECRET') + '_refresh',
      expiresIn: '30d',
    });
    return { access_token, refresh_token };
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const { access_token, refresh_token } = this.generateTokens(user);

    // Guardar refresh token hasheado
    user.refreshToken = await bcrypt.hash(refresh_token, 8);
    await this.userRepo.save(user);

    const userData: any = { id: user.id, name: user.name, email: user.email, role: user.role };
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
        secret: this.config.get<string>('JWT_REFRESH_SECRET') || this.config.get<string>('JWT_SECRET') + '_refresh',
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
      throw new UnauthorizedException('Sesión expirada, inicia sesión nuevamente');
    }
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Sesión cerrada' };
  }

  async register(name: string, email: string, password: string) {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({ name, email, password: hash });
    const saved = await this.userRepo.save(user);

    return { id: saved.id, name: saved.name, email: saved.email };
  }

  async validateToken(userId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: userId } });
  }
}