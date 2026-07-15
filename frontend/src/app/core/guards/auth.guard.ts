import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.getToken() && !auth.isTokenExpired()) return true;

  if (auth.getRefreshToken()) {
    const ok = await auth.tryRefresh();
    if (ok) return true;
  }

  router.navigate(['/login']);
  return false;
};