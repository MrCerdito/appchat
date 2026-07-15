import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Ticket, TicketCreateDto, TicketUpdateDto, TicketQuery, TicketListResponse } from '../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketService {
  constructor(private http: HttpClient) {}

  create(dto: TicketCreateDto): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets`, dto);
  }

  findAll(query?: TicketQuery): Observable<TicketListResponse> {
    let params = new HttpParams();
    if (query) {
      if (query.search) params = params.set('search', query.search);
      if (query.status) params = params.set('status', query.status);
      if (query.priority) params = params.set('priority', query.priority);
      if (query.category) params = params.set('category', query.category);
      if (query.sourceType) params = params.set('sourceType', query.sourceType);
      if (query.assignedTo) params = params.set('assignedTo', query.assignedTo);
      if (query.createdById) params = params.set('createdById', query.createdById);
      if (query.page) params = params.set('page', query.page);
      if (query.limit) params = params.set('limit', query.limit);
    }
    return this.http.get<TicketListResponse>(`${environment.apiUrl}/tickets`, { params });
  }

  findAllSimple(): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${environment.apiUrl}/tickets/all`);
  }

  findById(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${environment.apiUrl}/tickets/${id}`);
  }

  update(id: string, dto: TicketUpdateDto): Observable<Ticket> {
    return this.http.patch<Ticket>(`${environment.apiUrl}/tickets/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/tickets/${id}`);
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${environment.apiUrl}/configuracion/ticket-categories`);
  }

  saveCategories(categories: string[]): Observable<any> {
    return this.http.post(`${environment.apiUrl}/configuracion/global`, { ticketCategories: categories });
  }

  createFromSession(sessionId: string, body: { titulo?: string; descripcion?: string; priority?: string; category?: string }): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/sessions/${sessionId}/ticket`, body);
  }

  createFromWhatsapp(chatId: string, body: { titulo?: string; descripcion?: string; priority?: string; category?: string }): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/advisors-whatsapp/${chatId}/ticket`, body);
  }
}
