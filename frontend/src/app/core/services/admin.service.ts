import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Metrics {
  total: number;
  active: number;
  waiting: number;
  closed: number;
  avgMinutes: number;
  medianaMinutos: number;
  p95Minutos: number;
  advisors: User[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getAdvisors(page = 1, limit = 20, search?: string): Observable<PaginatedResponse<User>> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search) params = params.set('search', search);
    return this.http.get<PaginatedResponse<User>>(`${environment.apiUrl}/advisors`, { params });
  }

  getAdvisor(id: string): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/advisors/${id}`);
  }

  createAdvisor(name: string, email: string, password: string): Observable<User> {
    return this.http.post<User>(`${environment.apiUrl}/advisors`, { name, email, password });
  }

  updateAdvisor(id: string, data: { name?: string; email?: string }): Observable<User> {
    return this.http.put<User>(`${environment.apiUrl}/advisors/${id}`, data);
  }

  updatePassword(id: string, password: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${environment.apiUrl}/advisors/${id}/password`, { password });
  }

  toggleAdvisor(id: string): Observable<User> {
    return this.http.patch<User>(`${environment.apiUrl}/advisors/${id}/toggle`, {});
  }

  removeAdvisor(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/advisors/${id}`);
  }

  getMetrics(): Observable<Metrics> {
    return this.http.get<Metrics>(`${environment.apiUrl}/sessions/metrics`);
  }

  getAllSessions(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/admin/all`);
  }

  getRanking(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/sessions/metrics/ranking`);
  }

  getAllComentarios(page = 1, limit = 10, advisorId?: string) {
    const params = advisorId
      ? `?page=${page}&limit=${limit}&advisorId=${advisorId}`
      : `?page=${page}&limit=${limit}`;
    return this.http.get<{
      data: any[]; total: number; page: number; pages: number;
    }>(`${environment.apiUrl}/sessions/admin/comentarios${params}`);
  }
}
