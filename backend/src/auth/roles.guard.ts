import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const Roles = (...roles: string[]) =>
  (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata('roles', roles, descriptor?.value ?? target);
    return descriptor ?? target;
  };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) {
      throw new ForbiddenException('Acceso denegado: no hay roles definidos para esta ruta');
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !roles.includes(user?.role)) {
      throw new ForbiddenException('Acceso denegado: no tienes los permisos necesarios');
    }
    return true;
  }
}
