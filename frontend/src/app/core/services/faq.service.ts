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

  getAll(colegioId?: number, q?: string): Observable<Faq[]> {
    let params = '';
    if (colegioId) params += `colegioId=${colegioId}&`;
    if (q) params += `q=${encodeURIComponent(q)}`;
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
}
