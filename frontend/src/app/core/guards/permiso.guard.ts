import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermisosService } from '../services/permisos.service';

/**
 * Permite el acceso a una ruta solo si el usuario logueado tiene acceso al
 * módulo indicado. Si aún no hay permisos cargados, los obtiene primero.
 * Sin datos (despliegue inicial / sesión antigua) → acceso permitido.
 */
export const permisoGuard = (codigo: string): CanActivateFn => async () => {
  const permisos = inject(PermisosService);
  const router = inject(Router);
  const auth = inject(AuthService);

  if (auth.getUser()?.role === 'superadmin') return true;

  try {
    await permisos.asegurarCargados();
  } catch {
    /* se permite el acceso por defecto */
  }

  if (permisos.tieneAcceso(codigo)) return true;

  const user = auth.getUser();
  if (user?.role === 'desarrollador') {
    router.navigate(['/developer']);
  } else if (user?.role === 'admin') {
    router.navigate(['/admin']);
  } else if (user?.role === 'interno') {
    router.navigate(['/interno']);
  } else {
    router.navigate(['/dashboard']);
  }
  return false;
};