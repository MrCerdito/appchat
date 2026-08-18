import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Comunicado, ComunicadoStats, ComunicadoTemplate, Destinatario } from '../models/comunicado.model';

export interface Colegio {
  id: string;
  nombre: string;
  email: string;
  link: string;
  calendario?: string | null;
  tipoColegio?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ComunicadosService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<Comunicado[]> {
    return this.http.get<Comunicado[]>(`${environment.apiUrl}/comunicados`);
  }

  getOne(id: string): Observable<Comunicado> {
    return this.http.get<Comunicado>(`${environment.apiUrl}/comunicados/${id}`);
  }

  getColegios(): Observable<Colegio[]> {
    return this.http.get<Colegio[]>(`${environment.apiUrl}/comunicados/colegios`);
  }

  saveDraft(
    asunto: string,
    cuerpo: string,
    destinatarios: Destinatario[],
    design?: unknown[] | null,
  ): Observable<Comunicado> {
    return this.http.post<Comunicado>(`${environment.apiUrl}/comunicados/draft`, {
      asunto,
      cuerpo,
      destinatarios,
      design: design ?? null,
    });
  }

  update(
    id: string,
    asunto: string,
    cuerpo: string,
    destinatarios: Destinatario[],
    design?: unknown[] | null,
  ): Observable<Comunicado> {
    return this.http.put<Comunicado>(`${environment.apiUrl}/comunicados/${id}`, {
      asunto,
      cuerpo,
      destinatarios,
      design: design ?? null,
    });
  }

  send(id: string): Observable<Comunicado> {
    return this.http.post<Comunicado>(`${environment.apiUrl}/comunicados/${id}/send`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/comunicados/${id}`);
  }
  getStats(id: string): Observable<ComunicadoStats> {
  return this.http.get<ComunicadoStats>(`${environment.apiUrl}/comunicados/${id}/stats`);
}

  getTemplates(): Observable<ComunicadoTemplate[]> {
    return this.http.get<ComunicadoTemplate[]>(`${environment.apiUrl}/comunicados/templates`);
  }

  saveTemplate(
    name: string,
    asunto: string,
    cuerpo: string,
    design?: unknown[] | null,
  ): Observable<ComunicadoTemplate> {
    return this.http.post<ComunicadoTemplate>(`${environment.apiUrl}/comunicados/templates`, {
      name,
      asunto,
      cuerpo,
      design: design ?? null,
    });
  }

  updateTemplate(
    id: string,
    name: string,
    asunto: string,
    cuerpo: string,
    design?: unknown[] | null,
  ): Observable<ComunicadoTemplate> {
    return this.http.put<ComunicadoTemplate>(`${environment.apiUrl}/comunicados/templates/${id}`, {
      name,
      asunto,
      cuerpo,
      design: design ?? null,
    });
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/comunicados/templates/${id}`);
  }
}