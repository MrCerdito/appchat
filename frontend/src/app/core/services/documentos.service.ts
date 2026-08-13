import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DocumentoItem {
  nombre           : string;
  descripcion      : string;
  categoria        : string;
  colegio          : string | null;
  pdf_url          : string | null;
  activo           : boolean;
  instructivo      : boolean;
  total_chunks     : number;
  created_at       : string;
  roles_permitidos : string | null;
}

export interface UploadResult {
  ok    : boolean;
  chunks: number;
  nombre: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentosService {

  private readonly url = `${environment.apiUrl}/documentos`;

  constructor(private http: HttpClient) {}

  listar(): Observable<DocumentoItem[]> {
    return this.http.get<DocumentoItem[]>(this.url);
  }

  subir(form: FormData): Observable<UploadResult> {
    return this.http.post<UploadResult>(`${this.url}/upload`, form);
  }

  eliminar(nombre: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${this.url}/${encodeURIComponent(nombre)}`
    );
  }

  buscar(query: string, rol?: string): Observable<any> {
    return this.http.post(`${this.url}/search`, { query, rol, topK: 8 });
  }

  actualizarRoles(nombreOriginal: string, data: {
    nombre         : string;
    descripcion    : string;
    colegio        : string | null;
    rolesPermitidos: string;
    instructivo    : boolean;
  }): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(
      `${this.url}/${encodeURIComponent(nombreOriginal)}/roles`,
      data,
    );
  }
}