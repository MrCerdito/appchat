import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ChangelogCategoria = 'nuevo' | 'mejora' | 'correccion';

export interface Changelog {
  id: string;
  titulo: string;
  categoria: ChangelogCategoria;
  version: string | null;
  cuerpo: string;
  design: unknown[] | null;
  publicado: boolean;
  publicadoEl: string | null;
  createdAt: string;
  visto?: number;
}

export interface ChangelogForm {
  titulo: string;
  categoria?: ChangelogCategoria;
  version?: string | null;
  cuerpo: string;
  design?: unknown[] | null;
  publicar?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChangelogService {
  private readonly api = `${environment.apiUrl}/changelogs`;

  constructor(private readonly http: HttpClient) {}

  pendientes(): Observable<Changelog[]> {
    return this.http.get<Changelog[]>(`${this.api}/pendientes`);
  }

  marcarVisto(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.api}/${id}/visto`, {});
  }

  listarAdmin(): Observable<Changelog[]> {
    return this.http.get<Changelog[]>(`${this.api}/admin`);
  }

  crear(data: ChangelogForm): Observable<Changelog> {
    return this.http.post<Changelog>(`${this.api}/admin`, data);
  }

  editar(id: string, data: ChangelogForm): Observable<Changelog> {
    return this.http.put<Changelog>(`${this.api}/admin/${id}`, data);
  }

  eliminar(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.api}/admin/${id}`);
  }
}