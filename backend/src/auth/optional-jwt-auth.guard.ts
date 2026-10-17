import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard de token opcional: pasa sin Authorization, pero si viene un token lo
 * valida (y lo coloca en req.user para controles de propiedad). NO corta con
 * `@Public()`: en rutas públicas con validación opcional (rating, subida de
 * media) el guard global ya saltó, y aquí el token sigue interpretándose.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  constructor() {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;
    if (!authHeader) return true;

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Token inválido');
    }
    return user;
  }
}
