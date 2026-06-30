import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { TicketService } from '../../../../core/services/ticket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Ticket, TicketQuery } from '../../../../core/models/ticket.model';
import { User } from '../../../../core/models/user.model';
import { priorityLabel, priorityColor, statusLabel, statusColor } from '../../../../shared/utils/ticket-categories';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-tickets-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './tickets-list.html',
  styleUrl: './tickets-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsListComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;

  tickets: Ticket[] = [];
  total = 0;
  page = 1;
  limit = 20;
  pages = 0;

  search = '';
  filterStatus = '';
  filterPriority = '';
  filterCategory = '';
  filterSourceType = '';

  currentUser: User | null = null;
  loading = false;
  showCreateModal = false;
  createDto = { titulo: '', descripcion: '', priority: 'medium' as const, category: '' };
  categories: string[] = [];
  availablePriorities = ['low', 'medium', 'high', 'critical'] as const;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private ticketService: TicketService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getUser();
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

  load(): void {
    this.loading = true;
    const query: TicketQuery = { page: this.page, limit: this.limit };
    if (this.search) query.search = this.search;
    if (this.filterStatus) query.status = this.filterStatus;
    if (this.filterPriority) query.priority = this.filterPriority;
    if (this.filterCategory) query.category = this.filterCategory;
    if (this.filterSourceType) query.sourceType = this.filterSourceType;

    this.ticketService.findAll(query).subscribe({
      next: (res) => {
        this.tickets = res.data;
        this.total = res.total;
        this.pages = res.pages;
        this.page = res.page;
        this.loading = false;
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
    this.filterStatus = '';
    this.filterPriority = '';
    this.filterCategory = '';
    this.filterSourceType = '';
    this.page = 1;
    this.load();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.pages) return;
    this.page = p;
    this.load();
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
    const dto = {
      titulo: this.createDto.titulo.trim(),
      descripcion: this.createDto.descripcion?.trim() || undefined,
      priority: this.createDto.priority,
      category: this.createDto.category || undefined,
      sourceType: 'web' as const,
      sourceId: 'manual',
      clientName: this.currentUser?.name || 'Sistema',
    };
    this.ticketService.create(dto).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.load();
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
