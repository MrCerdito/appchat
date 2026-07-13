import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HorarioSlot {
  dia: number;
  inicio: string;
  fin: string;
}

export interface HorarioAlmuerzo {
  dia: number;
  inicio: string;
  fin: string;
}

export interface ConfiguracionData {
  id: string;
  advisorId: string | null;
  mensajeBienvenida: string;
  asesorInactividadSeg: number;
  asesorInactividadMsg: string;
  clienteInactividadSeg: number;
  clienteInactividadMsg: string;
  clienteInactividadIters: number;
  clienteCierreMsg: string;
  horarios: HorarioSlot[];
  horarioFueraMsg: string;
  horariosActivos: boolean;
  almuerzos: HorarioAlmuerzo[];
  whatsappAssignmentMsg: string;
  whatsappQueueMsg: string;
  whatsappOutOfHoursMsg: string;
  whatsappCallUnavailableMsg: string;
  whatsappQuickReplies: any[];
  sonidoActivado: boolean;
  sonidoWhatsapp: string;
  sonidoAsesor: string;
  sonidoCliente: string;
  sonidoAsignacion: string;
}

@Injectable({ providedIn: 'root' })
export class ConfiguracionFrontendService {
  private readonly url = `${environment.apiUrl}/configuracion`;

  constructor(private http: HttpClient) {}

  getEfectiva(): Observable<ConfiguracionData> {
    return this.http.get<ConfiguracionData>(this.url);
  }

  getGlobal(): Observable<ConfiguracionData> {
    return this.http.get<ConfiguracionData>(`${this.url}/global`);
  }

  guardar(data: Partial<ConfiguracionData>): Observable<ConfiguracionData> {
    return this.http.post<ConfiguracionData>(this.url, data);
  }

  guardarGlobal(data: Partial<ConfiguracionData>): Observable<ConfiguracionData> {
    return this.http.post<ConfiguracionData>(`${this.url}/global`, data);
  }

  resetear(): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.url);
  }
}
