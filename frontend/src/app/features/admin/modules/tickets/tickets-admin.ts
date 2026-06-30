import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { TicketService } from '../../../../core/services/ticket.service';
import { Ticket, TicketQuery } from '../../../../core/models/ticket.model';
import { priorityLabel, priorityColor, statusLabel, statusColor, DEFAULT_TICKET_CATEGORIES } from '../../../../shared/utils/ticket-categories';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-tickets-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tickets-admin.html',
  styleUrl: './tickets-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsAdminComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;

  activeView: 'list' | 'categories' = 'list';
  sidebarFilter = 'all';
  sidebarFilterType: 'status' | 'priority' | 'source' | 'category' | 'all' = 'all';

  tickets: Ticket[] = [];
  total = 0;
  page = 1;
  limit = 20;
  pages = 0;
  search = '';
  loading = false;

  categories: string[] = [];
  newCategory = '';
  editingCategoryIndex = -1;
  editingCategoryValue = '';

  statusCounts: Record<string, number> = {};
  priorityCounts: Record<string, number> = {};
  sourceCounts: Record<string, number> = {};
  categoryCounts: Record<string, number> = {};

  readonly sidebarSections = [
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
        { id: 'critical', label: 'Crítica', icon: 'chevrons-up', type: 'priority' },
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
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadCategories();
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
        this.cdr.detectChanges();
      }
      return;
    }
    this.activeView = 'list';
    this.sidebarFilter = id;
    this.sidebarFilterType = type as any;
    this.page = 1;
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

    this.ticketService.findAll(query).subscribe({
      next: (res) => {
        this.tickets = res.data;
        this.total = res.total;
        this.pages = res.pages;
        this.page = res.page;
        this.loading = false;
        this.computeCounts(res.data);
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  loadCategories(): void {
    this.ticketService.getCategories().subscribe(cats => {
      this.categories = cats;
      this.cdr.detectChanges();
    });
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
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
    this.http.post(`${environment.apiUrl}/configuracion/global`, { ticketCategories: this.categories }).subscribe({
      next: () => this.cdr.detectChanges(),
      error: () => this.cdr.detectChanges(),
    });
  }

  getItemCount(item: { id: string; type: string }): number {
    if (item.type === 'status') return this.statusCounts[item.id] || 0;
    if (item.type === 'priority') return this.priorityCounts[item.id] || 0;
    if (item.type === 'source') return this.sourceCounts[item.id] || 0;
    return 0;
  }

  filterByCategory(cat: string): void {
    this.sidebarFilter = cat;
    this.sidebarFilterType = 'category';
    this.activeView = 'list';
    this.page = 1;
    this.load();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
