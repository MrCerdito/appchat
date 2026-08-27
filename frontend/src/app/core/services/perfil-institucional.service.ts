import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PiOpcion {
  valor: string;
  orden: number;
}

export interface PiCategoria {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  esSistema: boolean;
}

export interface PiCampo {
  id: string;
  nombre: string;
  categoriaId: string;
  categoria?: PiCategoria | null;
  tipo: string;
  opciones: PiOpcion[];
  requerido: boolean;
  mostrarListado: boolean;
  mostrarPerfil: boolean;
  buscar: boolean;
  filtrable: boolean;
  activo: boolean;
  esSistema: boolean;
  orden: number;
}

export interface PiInstitucionCard {
  id: string;
  nombre: string;
  link: string;
  email: string | null;
  logoUrl: string | null;
  activo: boolean;
  calendario: string | null;
  tipoColegio: string | null;
  ciudad: string | null;
  advisorNombre: string | null;
  valores: Record<string, string | null>;
}

export interface PiInstitucionesResp {
  total: number;
  page: number;
  limit: number;
  pages: number;
  asesoresDisponibles: string[];
  instituciones: PiInstitucionCard[];
  camposFiltrables: { id: string; nombre: string; tipo: string; opciones: PiOpcion[] }[];
}

export interface PiGrupoFicha {
  categoriaId: string;
  categoriaNombre: string;
  categoriaEsSistema: boolean;
  campos: { campo: PiCampo; valor: string | null }[];
}

export interface PiFicha {
  institucion: PiInstitucionCard & { link: string };
  grupos: PiGrupoFicha[];
  ultimaActualizacion: string | null;
}

export interface PiHistorialItem {
  id: string;
  accion: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  createdAt: string;
  usuario: { id: string; name: string } | null;
  campoNombre: string | null;
}

export interface PiPaginado<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PiImportLog {
  colegio: string;
  campo: string;
  anterior: string | null;
  nuevo: string | null;
  estado: 'exito' | 'error';
  detalle: string;
}

export interface PiImportResp {
  ok: boolean;
  created: number;
  updated: number;
  total: number;
  errores: string[];
  logs: PiImportLog[];
  logExcelBase64: string;
}

@Injectable({ providedIn: 'root' })
export class PerfilInstitucionalService {
  private readonly base = `${environment.apiUrl}/perfil-institucional`;

  constructor(private http: HttpClient) {}

  listarInstituciones(filtros: Record<string, string | undefined>): Observable<PiInstitucionesResp> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== '') params = params.set(k, v);
    }
    return this.http.get<PiInstitucionesResp>(`${this.base}/instituciones`, { params });
  }

  obtenerFicha(id: string): Observable<PiFicha> {
    return this.http.get<PiFicha>(`${this.base}/instituciones/${id}`);
  }

  guardarValores(id: string, valores: { campoId: string; valor: string | null }[]): Observable<{ ok: boolean; cambios: number }> {
    return this.http.put<{ ok: boolean; cambios: number }>(
      `${this.base}/instituciones/${id}/valores`,
      { valores },
    );
  }

  subirLogo(id: string, file: File): Observable<{ ok: boolean; logoUrl: string }> {
    const fd = new FormData();
    fd.append('logo', file, file.name);
    return this.http.post<{ ok: boolean; logoUrl: string }>(
      `${this.base}/instituciones/${id}/logo`,
      fd,
    );
  }

  actualizarEmail(id: string, email: string | null): Observable<{ ok: boolean; email: string | null }> {
    return this.http.patch<{ ok: boolean; email: string | null }>(
      `${this.base}/instituciones/${id}/email`,
      { email },
    );
  }

  actualizarCiudad(id: string, ciudad: string | null): Observable<{ ok: boolean; ciudad: string | null }> {
    return this.http.patch<{ ok: boolean; ciudad: string | null }>(
      `${this.base}/instituciones/${id}/ciudad`,
      { ciudad },
    );
  }

  actualizarBase(
    id: string,
    dto: {
      nombre?: string;
      link?: string;
      calendario?: string | null;
      tipoColegio?: string | null;
      advisorId?: string | null;
    },
  ): Observable<{ ok: boolean; institucion: PiInstitucionCard }> {
    return this.http.patch<{ ok: boolean; institucion: PiInstitucionCard }>(
      `${this.base}/instituciones/${id}/base`,
      dto,
    );
  }

  listarCampos(): Observable<PiCampo[]> {
    return this.http.get<PiCampo[]>(`${this.base}/campos`);
  }

  crearCampo(dto: Partial<PiCampo>): Observable<PiCampo> {
    return this.http.post<PiCampo>(`${this.base}/campos`, dto);
  }

  actualizarCampo(id: string, dto: Partial<PiCampo>): Observable<PiCampo> {
    return this.http.patch<PiCampo>(`${this.base}/campos/${id}`, dto);
  }

  duplicarCampo(id: string): Observable<PiCampo> {
    return this.http.post<PiCampo>(`${this.base}/campos/${id}/duplicar`, {});
  }

  eliminarCampo(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/campos/${id}`);
  }

  listarCategorias(): Observable<PiCategoria[]> {
    return this.http.get<PiCategoria[]>(`${this.base}/categorias`);
  }

  crearCategoria(nombre: string, orden?: number): Observable<PiCategoria> {
    return this.http.post<PiCategoria>(`${this.base}/categorias`, { nombre, orden });
  }

  actualizarCategoria(id: string, dto: Partial<PiCategoria>): Observable<PiCategoria> {
    return this.http.patch<PiCategoria>(`${this.base}/categorias/${id}`, dto);
  }

  eliminarCategoria(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/categorias/${id}`);
  }

  reordenarCategorias(items: { id: string; orden: number }[]): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/categorias/reordenar`, { items });
  }

  historial(colegioId?: string, page = '1', desde?: string, hasta?: string): Observable<PiPaginado<PiHistorialItem>> {
    let params = new HttpParams().set('page', page);
    if (colegioId) params = params.set('colegioId', colegioId);
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<PiPaginado<PiHistorialItem>>(`${this.base}/historial`, { params });
  }

  exportar(): Observable<Blob> {
    return this.http.get(`${this.base}/exportar`, { responseType: 'blob' });
  }

  exportarFicha(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/exportar/${id}`, { responseType: 'blob' });
  }

  importar(file: File): Observable<PiImportResp> {
    const fd = new FormData();
    fd.append('archivo', file, file.name);
    return this.http.post<PiImportResp>(
      `${this.base}/importar`,
      fd,
    );
  }
}
