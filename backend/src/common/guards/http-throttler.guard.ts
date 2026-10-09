import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storage, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * Cuota por usuario autenticado (JWT verificado con el secreto de la app,
   * nunca confiar en un payload sin firmar); sin token valido se cuota por IP.
   */
  protected async getTracker(req: any): Promise<string> {
    const auth = req?.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(
          auth.slice(7),
        );
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        // Token invalido/expirado: se cuota por IP como cualquier anonimo.
      }
    }
    return super.getTracker(req);
  }
}
