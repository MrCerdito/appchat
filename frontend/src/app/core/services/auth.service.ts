import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';
import { Metrics } from './admin.service';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'chat_token';
  private readonly refreshKey = 'chat_refresh_token';
  private readonly userKey = 'chat_user';

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.tokenKey, res.access_token);
          localStorage.setItem(this.refreshKey, res.refresh_token);
          localStorage.setItem(this.userKey, JSON.stringify(res.user));
        }),
      );
  }

  refreshToken(): Observable<RefreshResponse> {
    const refresh_token = localStorage.getItem(this.refreshKey);
    return this.http
      .post<RefreshResponse>(`${environment.apiUrl}/auth/refresh`, { refresh_token })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.tokenKey, res.access_token);
          localStorage.setItem(this.refreshKey, res.refresh_token);
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshKey);
    localStorage.removeItem(this.userKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshKey);
  }

  getUser(): User | null {
    const raw = localStorage.getItem(this.userKey);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getMetrics(): Observable<Metrics> {
    return this.http.get<Metrics>(`${environment.apiUrl}/sessions/metrics`);
  }
}