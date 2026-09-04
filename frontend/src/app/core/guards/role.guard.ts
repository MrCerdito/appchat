import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard = (...requiredRoles: string[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.getUser();

  if (user && requiredRoles.includes(user.role)) return true;

  if (user?.role === 'admin') { router.navigate(['/admin']); return false; }
  if (user?.role === 'desarrollador') { router.navigate(['/developer']); return false; }
  router.navigate(['/dashboard']);
  return false;
};