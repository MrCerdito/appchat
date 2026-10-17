import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SesionSharepoint {
  sitioId       : string;
  sitioNombre   : string;
  sitioUrl      : string;
  bibliotecaId  : string;
  bibliotecaNombre: string;
  bibliotecaUrl : string;
}

export interface ItemSharepoint {
  id          : string;
  nombre      : string;
  tipo        : 'carpeta' | 'archivo';
  parentId    : string | null;
  parentNombre?: string;
  tamano      : number | undefined;
  extension   : string | undefined;
  creado      : string | undefined;
  modificado  : string | undefined;
  modificadoPor?: string;
  /** true cuando SharePoint reporta el elemento como compartido. */
  compartido?: boolean;
  webUrl      : string | undefined;
}

export interface ListadoSharepoint {
  carpeta  : { id: string | null; nombre: string } | null;
  items    : ItemSharepoint[];
  busqueda?: string;
}

/**
 * Explorador de la biblioteca de SharePoint del sitio de Soporte.
 * Todo es solo lectura: nunca sube, edita ni borra archivos allá.
 */
@Injectable({ providedIn: 'root' })
export class SharepointService {

  private readonly url = `${environment.apiUrl}/sharepoint`;

  constructor(private http: HttpClient) {}

  info(): Observable<SesionSharepoint> {
    return this.http.get<SesionSharepoint>(`${this.url}/info`);
  }

  /**
   * `nombre` es el nombre de la carpeta contenedora que el cliente ya conoce:
   * el backend se lo ahorra como segunda llamada a Graph.
   */
  listar(parentId?: string, q?: string, nombre?: string): Observable<ListadoSharepoint> {
    let params = new HttpParams();
    if (parentId) params = params.set('parentId', parentId);
    if (q) params = params.set('q', q);
    if (nombre && parentId) params = params.set('nombre', nombre);
    return this.http.get<ListadoSharepoint>(`${this.url}/items`, { params });
  }

  /** Descarga completa como blob; el componente la convierte en object URL. */
  descargar(id: string): Observable<Blob> {
    return this.http.get(`${this.url}/items/${encodeURIComponent(id)}/content`, {
      responseType: 'blob',
    });
  }
}
