import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';

export interface Metrics {
  total: number;
  active: number;
  waiting: number;
  closed: number;
  avgMinutes: number;
  advisors: User[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getAdvisors(): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/advisors`);
  }

  createAdvisor(name: string, email: string, password: string): Observable<User> {
    return this.http.post<User>(`${environment.apiUrl}/advisors`, { name, email, password });
  }

  updateAdvisor(id: string, data: { name?: string; email?: string }): Observable<User> {
    return this.http.put<User>(`${environment.apiUrl}/advisors/${id}`, data);
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