import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Comunicado, ComunicadoStats, Destinatario } from '../models/comunicado.model';

export interface Colegio {
  id: string;
  nombre: string;
  email: string;
  link: string;
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

  saveDraft(asunto: string, cuerpo: string, destinatarios: Destinatario[]): Observable<Comunicado> {
    return this.http.post<Comunicado>(`${environment.apiUrl}/comunicados/draft`, { asunto, cuerpo, destinatarios });
  }

  update(id: string, asunto: string, cuerpo: string, destinatarios: Destinatario[]): Observable<Comunicado> {
    return this.http.put<Comunicado>(`${environment.apiUrl}/comunicados/${id}`, { asunto, cuerpo, destinatarios });
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
}