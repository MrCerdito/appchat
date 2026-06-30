import { HttpInterceptorFn, HttpErrorResponse, HttpEvent, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { throwError, BehaviorSubject, Observable, timer } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
    const PUBLIC_URLS = [
      '/auth/',
      '/widget-config',
      '/configuracion/horario-hoy',
      '/sessions/colegios/list',
    ];
    const isPublic = PUBLIC_URLS.some(url => req.url.includes(url));

    if (error.status === 401 && !isPublic) {
      return handle401(req, next, authService, router);
    }
    return throwError(() => error);
  })
  );
};

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router
): Observable<HttpEvent<unknown>> {
  if (!authService.getRefreshToken()) {
    console.warn('[Auth Interceptor] Sin refresh token, cerrando sesión. URL:', req.url);
    authService.logout();
    router.navigate(['/login']);
    return throwError(() => new Error('Sin sesión'));
  }

  if (isRefreshing) {
    return refreshTokenSubject.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap(token =>
        next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
      )
    );
  }

  isRefreshing = true;
  refreshTokenSubject.next(null);

  return authService.refreshToken().pipe(
    switchMap(res => {
      isRefreshing = false;
      refreshTokenSubject.next(res.access_token);
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${res.access_token}` } }));
    }),
    catchError(firstErr => {
      console.warn('[Auth Interceptor] Refresh falló, reintentando una vez más. URL:', req.url);
      return timer(1000).pipe(
        switchMap(() => authService.refreshToken().pipe(
          switchMap(res => {
            isRefreshing = false;
            refreshTokenSubject.next(res.access_token);
            return next(req.clone({ setHeaders: { Authorization: `Bearer ${res.access_token}` } }));
          }),
          catchError(secondErr => {
            isRefreshing = false;
            console.warn('[Auth Interceptor] Refresh falló definitivamente. Cerrando sesión. URL:', req.url);
            authService.logout();
            router.navigate(['/login']);
            return throwError(() => secondErr);
          })
        ))
      );
    })
  );
}