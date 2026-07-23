import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';
import { NotificationService } from '../../core/services/notification.service';
import { Ticket, TicketQuery, TicketUpdateDto } from '../../core/models/ticket.model';
import { User } from '../../core/models/user.model';
import {
  priorityLabel, priorityColor, statusLabel, statusColor,
  TICKET_PRIORITIES, TICKET_STATUSES, DEFAULT_TICKET_CATEGORIES,
} from '../utils/ticket-categories';
import { trackByIndex, trackById } from '../utils/track-by';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DragDropModule],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly statuses = TICKET_STATUSES;

  isAdmin = false;

  tickets: Ticket[] = [];
  total = 0;
  page = 1;
  limit = 20;
  pages = 0;
  search = '';
  loading = false;

  sidebarFilter = 'all';
  sidebarFilterType: 'status' | 'priority' | 'source' | 'category' | 'all' = 'all';
  activeView: 'list' | 'categories' = 'list';

  categories: string[] = [];
  newCategory = '';
  editingCategoryIndex = -1;
  editingCategoryValue = '';

  statusCounts: Record<string, number> = {};
  priorityCounts: Record<string, number> = {};
  sourceCounts: Record<string, number> = {};
  categoryCounts: Record<string, number> = {};

  showCreateModal = false;
  createDto = { titulo: '', descripcion: '', priority: 'medium' as const, category: '' };

  selectedTicket: Ticket | null = null;
  advisors: User[] = [];
  editingDetail = false;
  editDto = { titulo: '', descripcion: '', status: '', priority: '', category: '', assignedToId: '' };
  viewMode: 'table' | 'kanban' = 'table';

  kanbanColumns: { status: string; label: string; tickets: Ticket[] }[] = [];

  private updateKanbanColumns(): void {
    this.kanbanColumns = [
      { status: 'open', label: 'Abierto', tickets: this.tickets.filter(t => t.status === 'open') },
      { status: 'in_progress', label: 'En progreso', tickets: this.tickets.filter(t => t.status === 'in_progress') },
      { status: 'resolved', label: 'Resuelto', tickets: this.tickets.filter(t => t.status === 'resolved') },
      { status: 'closed', label: 'Cerrado', tickets: this.tickets.filter(t => t.status === 'closed') },
    ];
  }

  readonly sidebarSections: { label: string; items: { id: string; label: string; icon: string; type: string }[] }[] = [
    {
      label: 'Filtros',
      items: [
        { id: 'all', label: 'Todos', icon: 'inbox', type: 'quick' },
        { id: 'open', label: 'Abierto', icon: 'circle', type: 'status' },
        { id: 'in_progress', label: 'En progreso', icon: 'play', type: 'status' },
        { id: 'resolved', label: 'Resuelto', icon: 'check', type: 'status' },
        { id: 'closed', label: 'Cerrado', icon: 'x', type: 'status' },
      ],
    },
    {
      label: 'Prioridad',
      items: [
        { id: 'low', label: 'Baja', icon: 'arrow-down', type: 'priority' },
        { id: 'medium', label: 'Media', icon: 'minus', type: 'priority' },
        { id: 'high', label: 'Alta', icon: 'arrow-up', type: 'priority' },
        { id: 'critical', label: 'Critica', icon: 'chevrons-up', type: 'priority' },
      ],
    },
    {
      label: 'Fuente',
      items: [
        { id: 'web', label: 'Web', icon: 'globe', type: 'source' },
        { id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle', type: 'source' },
      ],
    },
  ];

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private ticketService: TicketService,
    private auth: AuthService,
    private sessionService: SessionService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.auth.getUser();
    this.isAdmin = user?.role === 'admin';
    this.load();
    this.loadCategories();
    if (this.isAdmin) {
      this.loadAdvisors();
    }

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => { this.page = 1; this.load(); this.cdr.detectChanges(); });
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.search$.next(value);
  }

  selectFilter(id: string, type: string): void {
    if (type === 'action') {
      if (id === 'categories') {
        this.activeView = 'categories';
        this.selectedTicket = null;
        this.cdr.detectChanges();
      }
      return;
    }
    this.activeView = 'list';
    this.sidebarFilter = id;
    this.sidebarFilterType = type as any;
    this.page = 1;
    this.selectedTicket = null;
    this.load();
  }

  filterByCategory(cat: string): void {
    this.sidebarFilter = cat;
    this.sidebarFilterType = 'category';
    this.activeView = 'list';
    this.page = 1;
    this.selectedTicket = null;
    this.load();
  }

  load(): void {
    this.loading = true;
    const query: TicketQuery = { page: this.page, limit: this.limit };
    if (this.search) query.search = this.search;
    if (this.sidebarFilterType !== 'all') {
      if (this.sidebarFilterType === 'status') query.status = this.sidebarFilter;
      else if (this.sidebarFilterType === 'priority') query.priority = this.sidebarFilter;
      else if (this.sidebarFilterType === 'source') query.sourceType = this.sidebarFilter;
      else if (this.sidebarFilterType === 'category') query.category = this.sidebarFilter;
    }

    const user = this.auth.getUser();
    if (user && !this.isAdmin) {
      query.createdById = user.id;
    }

    this.ticketService.findAll(query).subscribe({
      next: (res) => {
        this.tickets = res.data;
        this.total = res.total;
        this.pages = res.pages;
        this.page = res.page;
        this.loading = false;
        this.computeCounts(res.data);
        this.updateKanbanColumns();
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.notification.error('Error', 'No se pudieron cargar los tickets.'); this.cdr.detectChanges(); },
    });
  }

  loadCategories(): void {
    this.ticketService.getCategories().subscribe({
      next: (cats) => {
        this.categories = cats;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  loadAdvisors(): void {
    this.sessionService.findAdvisors().subscribe({
      next: (a) => {
        this.advisors = a;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  clearFilters(): void {
    this.search = '';
    this.sidebarFilter = 'all';
    this.sidebarFilterType = 'all';
    this.page = 1;
    this.load();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.pages) return;
    this.page = p;
    this.load();
  }

  getItemCount(item: { id: string; type: string }): number {
    if (item.type === 'status') return this.statusCounts[item.id] || 0;
    if (item.type === 'priority') return this.priorityCounts[item.id] || 0;
    if (item.type === 'source') return this.sourceCounts[item.id] || 0;
    return 0;
  }

  private computeCounts(tickets: Ticket[]): void {
    this.statusCounts = {};
    this.priorityCounts = {};
    this.sourceCounts = {};
    this.categoryCounts = {};
    for (const t of tickets) {
      this.statusCounts[t.status] = (this.statusCounts[t.status] || 0) + 1;
      this.priorityCounts[t.priority] = (this.priorityCounts[t.priority] || 0) + 1;
      this.sourceCounts[t.sourceType] = (this.sourceCounts[t.sourceType] || 0) + 1;
      if (t.category) this.categoryCounts[t.category] = (this.categoryCounts[t.category] || 0) + 1;
    }
  }

  openCreateModal(): void {
    this.createDto = { titulo: '', descripcion: '', priority: 'medium', category: '' };
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createTicket(): void {
    if (!this.createDto.titulo.trim()) return;
    const user = this.auth.getUser();
    const dto = {
      titulo: this.createDto.titulo.trim(),
      descripcion: this.createDto.descripcion?.trim() || undefined,
      priority: this.createDto.priority,
      category: this.createDto.category || undefined,
      sourceType: 'web' as const,
      sourceId: 'manual',
      clientName: user?.name || 'Sistema',
    };
    this.ticketService.create(dto).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.load();
      },
      error: (err) => {
        this.notification.error('Error al crear ticket', err.error?.message || 'Intenta de nuevo.');
      },
    });
  }

  selectTicket(ticket: Ticket): void {
    this.loading = true;
    this.editingDetail = false;
    this.ticketService.findById(ticket.id).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.notification.error('Error', 'No se pudo cargar el detalle del ticket.'); this.cdr.detectChanges(); },
    });
  }

  closeDetail(): void {
    this.selectedTicket = null;
    this.editingDetail = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedTicket) this.closeDetail();
    if (this.showCreateModal) this.closeCreateModal();
  }

  onDrop(event: CdkDragDrop<Ticket[]>, targetStatus: string): void {
    if (event.previousContainer === event.container) return;
    const ticket = event.previousContainer.data[event.previousIndex];
    this.ticketService.update(ticket.id, { status: targetStatus as any }).subscribe({
      next: () => { this.load(); this.cdr.detectChanges(); },
      error: () => {
        this.notification.error('Error', 'No se pudo actualizar el estado del ticket.');
      },
    });
  }

  switchView(mode: 'table' | 'kanban'): void {
    this.viewMode = mode;
    this.selectedTicket = null;
    this.cdr.detectChanges();
  }

  startEditing(): void {
    if (!this.selectedTicket) return;
    this.editDto = {
      titulo: this.selectedTicket.titulo,
      descripcion: this.selectedTicket.descripcion || '',
      status: this.selectedTicket.status,
      priority: this.selectedTicket.priority,
      category: this.selectedTicket.category || '',
      assignedToId: this.selectedTicket.assignedTo?.id || '',
    };
    this.editingDetail = true;
  }

  cancelEditing(): void {
    this.editingDetail = false;
  }

  saveDetail(): void {
    if (!this.selectedTicket || !this.editDto.titulo.trim()) return;
    const dto: TicketUpdateDto = {};
    if (this.editDto.titulo !== this.selectedTicket.titulo) dto.titulo = this.editDto.titulo.trim();
    if (this.editDto.descripcion !== (this.selectedTicket.descripcion || '')) dto.descripcion = this.editDto.descripcion || undefined;
    if (this.editDto.status !== this.selectedTicket.status) dto.status = this.editDto.status as any;
    if (this.editDto.priority !== this.selectedTicket.priority) dto.priority = this.editDto.priority as any;
    if (this.editDto.category !== (this.selectedTicket.category || '')) dto.category = this.editDto.category || undefined;
    if (this.editDto.assignedToId !== (this.selectedTicket.assignedTo?.id || '')) dto.assignedToId = this.editDto.assignedToId || undefined;

    if (Object.keys(dto).length === 0) { this.editingDetail = false; return; }

    this.ticketService.update(this.selectedTicket.id, dto).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.editingDetail = false;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notification.error('Error al guardar', err.error?.message || 'No se pudieron guardar los cambios.');
      },
    });
  }

  addCategory(): void {
    const cat = this.newCategory.trim();
    if (!cat || this.categories.includes(cat)) return;
    this.categories = [...this.categories, cat];
    this.newCategory = '';
    this.saveCategories();
  }

  startEditCategory(index: number): void {
    this.editingCategoryIndex = index;
    this.editingCategoryValue = this.categories[index];
  }

  saveEditCategory(): void {
    const val = this.editingCategoryValue.trim();
    if (!val) { this.cancelEditCategory(); return; }
    this.categories[this.editingCategoryIndex] = val;
    this.editingCategoryIndex = -1;
    this.editingCategoryValue = '';
    this.saveCategories();
  }

  cancelEditCategory(): void {
    this.editingCategoryIndex = -1;
    this.editingCategoryValue = '';
  }

  removeCategory(index: number): void {
    this.categories = this.categories.filter((_, i) => i !== index);
    this.saveCategories();
  }

  saveCategories(): void {
    if (!this.categories.length) this.categories = [...DEFAULT_TICKET_CATEGORIES];
    this.ticketService.saveCategories(this.categories).subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
