import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard = (requiredRole: string): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.getUser();

  if (user?.role === requiredRole) return true;

  router.navigate([user?.role === 'admin' ? '/admin' : '/dashboard']);
  return false;
};