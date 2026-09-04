import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Modulo } from '../models/modulo.model';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class ModuloService {
  private readonly base = `${environment.apiUrl}/modulos`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<Modulo[]> {
    return this.http.get<Modulo[]>(this.base);
  }

  create(data: { nombre: string; descripcion?: string }): Observable<Modulo> {
    return this.http.post<Modulo>(this.base, data);
  }

  update(id: string, data: { nombre?: string; descripcion?: string }): Observable<Modulo> {
    return this.http.patch<Modulo>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addDesarrollador(moduloId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${moduloId}/desarrolladores`, { userId });
  }

  removeDesarrollador(moduloId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${moduloId}/desarrolladores/${userId}`);
  }

  getDesarrolladores(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/desarrolladores`);
  }
}
