import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ModuloAcceso,
  MisPermisosResponse,
  RolAccesosResponse,
  UsuarioAccesos,
} from '../models/modulo-acceso.model';

export interface AccesosItem {
  codigo: string;
  activo: boolean;
}

/** CRUD de accesos de módulos (uso administrativo). */
@Injectable({ providedIn: 'root' })
export class AccesosService {
  private readonly base = `${environment.apiUrl}/accesos`;

  constructor(private http: HttpClient) {}

  getModulos(): Observable<ModuloAcceso[]> {
    return this.http.get<ModuloAcceso[]>(`${this.base}/modulos`);
  }

  getRolAccesos(): Observable<RolAccesosResponse> {
    return this.http.get<RolAccesosResponse>(`${this.base}/rol`);
  }

  setRolAccesos(role: string, modulos: AccesosItem[]): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/rol/${role}`, { modulos });
  }

  getUsuarioAccesos(userId: string): Observable<UsuarioAccesos> {
    return this.http.get<UsuarioAccesos>(`${this.base}/usuario/${userId}`);
  }

  setUsuarioAccesos(
    userId: string,
    modulos: AccesosItem[],
  ): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/usuario/${userId}`, { modulos });
  }

  getMisPermisos(): Observable<MisPermisosResponse> {
    return this.http.get<MisPermisosResponse>(`${this.base}/mis-permisos`);
  }
}