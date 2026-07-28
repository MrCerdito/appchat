import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Pqrs {
  id: string;
  codigo: string;
  tipo: string;
  asunto: string;
  descripcion: string;
  identificacion?: string;
  nombre: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  colegio?: string;
  status: string;
  adjuntos?: any[];
  respuesta?: string;
  respondidoAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePqrsPayload {
  tipo: string;
  asunto: string;
  descripcion: string;
  identificacion?: string;
  nombre: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  colegio?: string;
  adjuntos?: any[];
}

@Injectable({ providedIn: 'root' })
export class PqrsService {
  private readonly api = `${environment.apiUrl}/pqrs`;

  constructor(private http: HttpClient) {}

  create(dto: CreatePqrsPayload): Observable<Pqrs> {
    return this.http.post<Pqrs>(this.api, dto);
  }
}
