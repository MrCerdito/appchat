import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccesosService } from './accesos.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';

/** Metadata key para el código de módulo protegido (`@Permiso('codigo')`). */
export const PERMISO_METADATA = 'permisoModulo';

/** Marca que una ruta requiere el módulo habilitado para el usuario. */
export const Permiso = (codigo: string) =>
  SetMetadata(PERMISO_METADATA, codigo);

/**
 * Guard global de control de acceso por módulo.
 * - Sin metadata `@Permiso` → pasa (no aplica).
 * - Sin usuario autenticado → solo pasa si la ruta es `@Public()`
 *   (fail-closed: en rutas normales el JwtAuthGuard global ya exigió token,
 *   aquí se cubre el caso de que ese guard se reordene o falle).
 * - Con usuario: si el módulo no aplica a su rol o está desactivado → 403.
 */
@Injectable()
export class PermisoModuloGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accesos: AccesosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const codigo = this.reflector.getAllAndOverride<string>(PERMISO_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!codigo) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; role: string } | undefined;
    if (!user || !user.id) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) return true;
      throw new ForbiddenException('Autenticación requerida.');
    }

    const activo = await this.accesos.permisoActivo(user, codigo);
    if (!activo) {
      throw new ForbiddenException(
        `Acceso denegado: el módulo "${codigo}" no está habilitado para tu perfil.`,
      );
    }
    return true;
  }
}