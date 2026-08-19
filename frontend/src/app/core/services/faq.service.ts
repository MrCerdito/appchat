import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Faq {
  id: number;
  pregunta: string;
  respuesta: string;
  categoria: string | null;
  keywords: string[] | null;
  colegioId: number | null;
  orden: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFaqDto {
  pregunta: string;
  respuesta: string;
  categoria?: string;
  keywords?: string[];
  colegioId?: number;
  orden?: number;
  activo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FaqService {
  constructor(private http: HttpClient) {}

  getAll(colegioId?: number, q?: string, bustCache = false): Observable<Faq[]> {
    let params = '';
    if (colegioId) params += `colegioId=${colegioId}&`;
    if (q) params += `q=${encodeURIComponent(q)}&`;
    if (bustCache) params += `_t=${Date.now()}`;
    return this.http.get<Faq[]>(`${environment.apiUrl}/faq?${params}`);
  }

  getCategorias(colegioId?: number): Observable<string[]> {
    let params = '';
    if (colegioId) params += `colegioId=${colegioId}`;
    return this.http.get<string[]>(`${environment.apiUrl}/faq/categorias?${params}`);
  }

  create(dto: CreateFaqDto): Observable<Faq> {
    return this.http.post<Faq>(`${environment.apiUrl}/faq`, dto);
  }

  update(id: number, dto: Partial<CreateFaqDto>): Observable<Faq> {
    return this.http.patch<Faq>(`${environment.apiUrl}/faq/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/faq/${id}`);
  }

  importCsv(file: File): Observable<{ imported: number; skipped: number; errors: string[]; total: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ imported: number; skipped: number; errors: string[]; total: number }>(`${environment.apiUrl}/faq/import`, formData);
  }

  exportCsv(): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/faq/export`, { responseType: 'blob' });
  }

  removeBulk(ids: number[]): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${environment.apiUrl}/faq/delete-bulk`, { ids });
  }
}
