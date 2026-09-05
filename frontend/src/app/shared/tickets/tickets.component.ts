import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Subject, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs/operators';
import { TicketService } from '../../core/services/ticket.service';
import { ModuloService } from '../../core/services/modulo.service';
import { AuthService } from '../../core/services/auth.service';
import { SessionService, Colegio } from '../../core/services/session.service';
import { NotificationService } from '../../core/services/notification.service';
import { LayoutService } from '../../core/services/layout.service';
import { SocketService } from '../../core/services/socket.service';
import { Ticket, TicketQuery, TicketUpdateDto } from '../../core/models/ticket.model';
import { User } from '../../core/models/user.model';
import { Modulo } from '../../core/models/modulo.model';
import { environment } from '../../../environments/environment';
import {
  priorityLabel, priorityColor, statusLabel, statusColor,
  TICKET_PRIORITIES, TICKET_STATUSES, DEFAULT_TICKET_CATEGORIES,
  slaTimeRemaining, slaColor,
} from '../utils/ticket-categories';
import { trackByIndex, trackById } from '../utils/track-by';
import { fmtDateShort, fmtMedium, fmtDateTime } from '../utils/date';
import { minutesSince, formatShortDuration } from '../utils/duration';
import { TicketMailTemplateComponent } from './components/ticket-mail-template/ticket-mail-template.component';

const SLA_HOURS: Record<string, number> = { low: 168, medium: 72, high: 24, critical: 8 };

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DragDropModule, TicketMailTemplateComponent],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly fmtDateShort = fmtDateShort;
  protected readonly fmtMedium = fmtMedium;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly priorityColor = priorityColor;
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly slaTimeRemaining = slaTimeRemaining;
  protected readonly slaColor = slaColor;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly statuses = TICKET_STATUSES;

  isAdmin = false;
  isDesarrollador = false;

  get statusChangeOptions(): { value: string; label: string; color: string }[] {
    if (this.isDesarrollador) {
      return TICKET_STATUSES.filter(s => s.value !== 'closed');
    }
    return [...TICKET_STATUSES];
  }
  isAdvisor = false;
  currentUserId = '';

  tickets: Ticket[] = [];
  total = 0;
  fullTotal = 0;
  page = 1;
  limit = 20;
  pages = 0;
  search = '';
  loading = false;

  selectedFilters: Record<string, string[]> = {};
  activeView: 'list' | 'categories' | 'modules' | 'mail' = 'list';

  categories: string[] = [];
  newCategory = '';
  editingCategoryIndex = -1;
  editingCategoryValue = '';

  statusCounts: Record<string, number> = {};
  priorityCounts: Record<string, number> = {};
  sourceCounts: Record<string, number> = {};
  categoryCounts: Record<string, number> = {};

  showCreateModal = false;
  createDto = {
    titulo: '',
    descripcion: '',
    priority: 'medium' as const,
    category: '',
    clientName: '',
    institucion: '',
    canal: 'internal' as const,
    assignedToId: '',
  };

  selectedTicket: Ticket | null = null;
  advisors: User[] = [];
  colegios: Colegio[] = [];
  editingDetail = false;
  editDto = { titulo: '', descripcion: '', status: '', priority: '', category: '', assignedToId: '' };
  viewMode: 'table' | 'kanban' = 'table';

  noteContent = '';
  noteImages: string[] = [];
  noteUploading = false;
  noteSending = false;

  showEditModal = false;
  editModalDto = { titulo: '', descripcion: '', category: '' };
  detailMenu: 'status' | 'priority' | 'category' | null = null;

  modulos: Modulo[] = [];
  moduloForm = { nombre: '', descripcion: '' };
  editingModuloId: string | null = null;
  moduloFormEdit = { nombre: '', descripcion: '' };

  showModuloPicker = false;
  selectedModulo: Modulo | null = null;
  pickerTarget: 'create' | 'edit' | 'assign' = 'create';

  kanbanColumns: { status: string; label: string; tickets: Ticket[] }[] = [];

  actionMenuTicketId: string | null = null;
  actionMenuPos = { top: 0, left: 0 };
  sortBy: 'createdAt' | 'priority' | 'status' | 'codigo' = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';
  showSortMenu = false;

  dateKey: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'range' = 'all';
  dateRangeFrom = '';
  dateRangeTo = '';
  showDateMenu = false;

  showCloseEmailModal = false;
  closeEmailTicket: Ticket | null = null;
  closeEmailStatus: 'resolved' | 'closed' | '' = '';
  closeEmailSending = false;
  closeEmailSource: 'detail' | 'table' | 'kanban' = 'detail';

  readonly sortOptions: { value: string; label: string }[] = [
    { value: 'createdAt', label: 'Fecha' },
    { value: 'priority', label: 'Prioridad' },
    { value: 'status', label: 'Estado' },
    { value: 'codigo', label: 'Codigo' },
  ];

  readonly dateFilterOptions: { value: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'range'; label: string }[] = [
    { value: 'all', label: 'Todas las fechas' },
    { value: 'today', label: 'Hoy' },
    { value: 'yesterday', label: 'Ayer' },
    { value: '7d', label: 'Ultimos 7 dias' },
    { value: '30d', label: 'Ultimos 30 dias' },
    { value: 'range', label: 'Rango de fechas' },
  ];

  readonly canalOptions = [
    { value: 'web', label: 'Web' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'internal', label: 'Interno' },
    { value: 'email', label: 'Correo' },
  ];

  get pageTitle(): string {
    return this.isDesarrollador ? 'Mis tickets' : 'Tickets';
  }

  get summaryCards(): { icon: string; label: string; count: number; description: string; status: string | null; color: string }[] {
    return [
      { icon: 'clipboard', label: 'Total tickets', count: this.fullTotal, description: 'Todos los registros', status: null, color: '#6366f1' },
      { icon: 'circle', label: 'Abiertos', count: this.statusCounts['open'] || 0, description: 'Requieren atencion', status: 'open', color: '#3b82f6' },
      { icon: 'clock', label: 'En progreso', count: this.statusCounts['in_progress'] || 0, description: 'En atencion actual', status: 'in_progress', color: '#f59e0b' },
      { icon: 'check-circle', label: 'Resueltos', count: this.statusCounts['resolved'] || 0, description: 'Finalizados', status: 'resolved', color: '#10b981' },
      { icon: 'x-circle', label: 'Cerrados', count: this.statusCounts['closed'] || 0, description: 'Cerrados definitivo', status: 'closed', color: '#6b7280' },
    ];
  }

  get hasActiveFilters(): boolean {
    return Object.values(this.selectedFilters).some(arr => arr.length > 0) || this.search.length > 0 || this.hasActiveDateFilter;
  }

  get activeFiltersCount(): number {
    return Object.values(this.selectedFilters).reduce((sum, arr) => sum + arr.length, 0) + (this.hasActiveDateFilter ? 1 : 0);
  }

  get hasActiveDateFilter(): boolean {
    return this.dateKey !== 'all' && this.dateKey !== 'range' || (this.dateKey === 'range' && !!this.dateRangeFrom && !!this.dateRangeTo);
  }

  get dateFilterLabel(): string {
    if (this.dateKey === 'range' && this.dateRangeFrom && this.dateRangeTo) {
      return `${this.fmtDateShort(this.dateRangeFrom)} - ${this.fmtDateShort(this.dateRangeTo)}`;
    }
    return this.dateFilterOptions.find(o => o.value === this.dateKey)?.label ?? 'Fecha';
  }

  private dateBoundaries(): { from: Date; to: Date } {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    switch (this.dateKey) {
      case 'today':
        return { from: startOfToday, to: addDays(startOfToday, 1) };
      case 'yesterday':
        return { from: addDays(startOfToday, -1), to: startOfToday };
      case '7d':
        return { from: addDays(startOfToday, -6), to: addDays(startOfToday, 1) };
      case '30d':
        return { from: addDays(startOfToday, -29), to: addDays(startOfToday, 1) };
      case 'range': {
        if (!this.dateRangeFrom || !this.dateRangeTo) return { from: null as any, to: null as any };
        const from = this.parseDateInput(this.dateRangeFrom);
        const to = addDays(this.parseDateInput(this.dateRangeTo), 1);
        return { from, to };
      }
      default:
        return { from: null as any, to: null as any };
    }
  }

  private parseDateInput(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  private applyActiveDateFilter(query: { dateFrom?: string; dateTo?: string }): void {
    const { from, to } = this.dateBoundaries();
    if (from && to) {
      query.dateFrom = from.toISOString();
      query.dateTo = to.toISOString();
    }
  }

  get paginationInfo(): string {
    const start = (this.page - 1) * this.limit + 1;
    const end = Math.min(this.page * this.limit, this.total);
    if (this.total === 0) return 'Sin resultados';
    return `Mostrando ${start} a ${end} de ${this.total} resultados`;
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.pages }, (_, i) => i + 1);
  }

  get visiblePages(): (number | '...')[] {
    const total = this.pages;
    const current = this.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const candidates = new Set<number>([1, total, current - 1, current, current + 1]);
    const sorted = [...candidates]
      .filter(p => p >= 1 && p <= total)
      .sort((a, b) => a - b);
    const result: (number | '...')[] = [];
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) result.push('...');
      result.push(p);
      prev = p;
    }
    return result;
  }

  getPriorityLabel(value: string): string {
    return TICKET_PRIORITIES.find(p => p.value === value)?.label ?? value;
  }

  getStatusLabel(value: string): string {
    return TICKET_STATUSES.find(s => s.value === value)?.label ?? value;
  }

  getStatusColor(value: string): string {
    return TICKET_STATUSES.find(s => s.value === value)?.color ?? '#6b7280';
  }

  getConversationCount(ticket: Ticket): number {
    return ticket.conversation?.length || 0;
  }

  private updateKanbanColumns(): void {
    this.kanbanColumns = [
      { status: 'open', label: 'Abierto', tickets: this.tickets.filter(t => t.status === 'open') },
      { status: 'in_progress', label: 'En progreso', tickets: this.tickets.filter(t => t.status === 'in_progress') },
      { status: 'on_hold', label: 'En espera', tickets: this.tickets.filter(t => t.status === 'on_hold') },
      { status: 'denied', label: 'Denegado', tickets: this.tickets.filter(t => t.status === 'denied') },
      { status: 'resolved', label: 'Resuelto', tickets: this.tickets.filter(t => t.status === 'resolved') },
      { status: 'closed', label: 'Cerrado', tickets: this.tickets.filter(t => t.status === 'closed') },
    ];
  }

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private ticketService: TicketService,
    private moduloService: ModuloService,
    private auth: AuthService,
    private sessionService: SessionService,
    private notification: NotificationService,
    private layout: LayoutService,
    private socket: SocketService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.auth.getUser();
    this.isAdmin = user?.role === 'admin';
    this.isDesarrollador = user?.role === 'desarrollador';
    this.isAdvisor = user?.role === 'advisor';
    this.currentUserId = user?.id ?? '';

    this.load();
    this.loadCounts();
    this.loadCategories();
    this.loadAdvisors();
    this.loadModulos();
    this.loadColegios();
    this.layout.setSidebarForcedCollapsed(true);

    this.socket.on<any>('ticket:created')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.load(); this.loadCounts(); });

    this.socket.on<any>('ticket:updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.load(); this.loadCounts(); });

    this.socket.on<any>('ticket:deleted')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.load(); this.loadCounts(); });

    interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => { this.page = 1; this.load(); this.loadCounts(); this.cdr.detectChanges(); });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const highlight = params['highlight'];
      if (!highlight) { this.pendingHighlight = ''; return; }
      this.pendingHighlight = highlight;
      this.tryHighlightFromQuery();
    });
  }

  private pendingHighlight = '';

  private tryHighlightFromQuery(): void {
    if (!this.pendingHighlight) return;
    const ticket = this.tickets.find(t => t.codigo === this.pendingHighlight);
    if (ticket) {
      const codigo = this.pendingHighlight;
      this.pendingHighlight = '';
      this.selectTicket(ticket);
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.search$.next(value);
  }

  openMailConfig(): void {
    this.activeView = 'mail';
    this.selectedTicket = null;
    this.actionMenuTicketId = null;
    this.layout.setSidebarForcedCollapsed(true);
    this.cdr.detectChanges();
  }

  closeMailConfig(): void {
    this.activeView = 'list';
    // Mantener el sidebar colapsado (como quedó al entrar a correo):
    // "Volver a tickets" no reexpande la barra lateral.
    this.cdr.detectChanges();
  }

  onMailStateChange(): void {
    this.cdr.markForCheck();
  }

  selectFilter(id: string, type: string): void {
    if (type === 'action') {
      if (id === 'categories' && (this.isAdmin || this.isAdvisor)) {
        this.activeView = 'categories';
        this.selectedTicket = null;
        this.actionMenuTicketId = null;
        this.cdr.detectChanges();
      }
      if (id === 'modules' && (this.isAdmin || this.isAdvisor)) {
        this.activeView = 'modules';
        this.selectedTicket = null;
        this.actionMenuTicketId = null;
        this.loadModulos();
        this.cdr.detectChanges();
      }
      return;
    }
    this.activeView = 'list';
    this.toggleFilter(id, type);
  }

  toggleFilter(id: string, type: string): void {
    const current = this.selectedFilters[type] || [];
    const idx = current.indexOf(id);
    if (idx >= 0) {
      this.selectedFilters = { ...this.selectedFilters, [type]: current.filter(v => v !== id) };
    } else {
      this.selectedFilters = { ...this.selectedFilters, [type]: [...current, id] };
    }
    this.page = 1;
    this.selectedTicket = null;
    this.actionMenuTicketId = null;
    this.load();
    this.loadCounts();
  }

  filterByCategory(cat: string): void {
    this.activeView = 'list';
    const current = this.selectedFilters['category'] || [];
    const idx = current.indexOf(cat);
    if (idx >= 0) {
      this.selectedFilters = { ...this.selectedFilters, category: current.filter(v => v !== cat) };
    } else {
      this.selectedFilters = { ...this.selectedFilters, category: [cat] };
    }
    this.page = 1;
    this.selectedTicket = null;
    this.load();
    this.loadCounts();
  }

  filterByStatus(status: string): void {
    this.activeView = 'list';
    this.toggleFilter(status, 'status');
  }

  clearStatusQuickFilter(): void {
    if (!(this.selectedFilters['status'] || []).length) return;
    this.selectedFilters = { ...this.selectedFilters, status: [] };
    this.page = 1;
    this.selectedTicket = null;
    this.actionMenuTicketId = null;
    this.load();
    this.loadCounts();
  }

  clearPriorityQuickFilter(): void {
    if (!(this.selectedFilters['priority'] || []).length) return;
    this.selectedFilters = { ...this.selectedFilters, priority: [] };
    this.page = 1;
    this.selectedTicket = null;
    this.actionMenuTicketId = null;
    this.load();
    this.loadCounts();
  }

  isFilterActive(id: string, type: string): boolean {
    return (this.selectedFilters[type] || []).includes(id);
  }

  private buildQueryFilter(): Record<string, string> {
    const query: Record<string, string> = {};
    for (const [type, values] of Object.entries(this.selectedFilters)) {
      if (values.length > 0) {
        query[type] = values.join(',');
      }
    }
    return query;
  }

  load(): void {
    this.loading = true;
    const filterParams = this.buildQueryFilter();
    const query: TicketQuery = { page: this.page, limit: this.limit };
    if (this.search) query.search = this.search;
    if (filterParams['status']) query.status = filterParams['status'];
    if (filterParams['priority']) query.priority = filterParams['priority'];
    if (filterParams['source']) query.sourceType = filterParams['source'];
    if (filterParams['category']) query.category = filterParams['category'];
    if (this.isDesarrollador && this.currentUserId) {
      query.assignedTo = this.currentUserId;
    } else if (this.isAdvisor && this.currentUserId) {
      query.createdById = this.currentUserId;
    }
    this.applyActiveDateFilter(query);
    if (this.sortBy !== 'createdAt' || this.sortDirection !== 'desc') {
      query.sortBy = this.sortBy;
      query.sortDirection = this.sortDirection;
    }

    this.ticketService.findAll(query).subscribe({
      next: (res) => {
        this.tickets = res.data;
        this.total = res.total;
        this.pages = res.pages;
        this.page = res.page;
        this.loading = false;
        this.updateKanbanColumns();
        this.cdr.detectChanges();
        this.tryHighlightFromQuery();
      },
      error: () => { this.loading = false; this.notification.error('Error', 'No se pudieron cargar los tickets.'); this.cdr.detectChanges(); },
    });
  }

  loadCounts(): void {
    const query: TicketQuery = {};
    if (this.search) query.search = this.search;
    if (this.isDesarrollador && this.currentUserId) {
      query.assignedTo = this.currentUserId;
    } else if (this.isAdvisor && this.currentUserId) {
      query.createdById = this.currentUserId;
    }
    this.applyActiveDateFilter(query);

    this.ticketService.findCounts(query).subscribe({
      next: (res) => {
        this.fullTotal = res.total;
        this.statusCounts = res.statusCounts;
        this.priorityCounts = res.priorityCounts;
        this.sourceCounts = res.sourceCounts;
        this.categoryCounts = res.categoryCounts;
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadCategories(): void {
    this.ticketService.getCategories().subscribe({
      next: (cats) => { this.categories = cats; this.cdr.detectChanges(); },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  loadAdvisors(): void {
    this.moduloService.getDesarrolladores().subscribe({
      next: (a) => { this.advisors = a; this.cdr.detectChanges(); },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  loadModulos(): void {
    this.moduloService.getAll().subscribe({
      next: (m) => { this.modulos = m; this.cdr.detectChanges(); },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  loadColegios(): void {
    this.sessionService.getColegios().subscribe({
      next: (c) => { this.colegios = c; this.cdr.detectChanges(); },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  clearFilters(): void {
    this.search = '';
    this.selectedFilters = {};
    this.dateKey = 'all';
    this.dateRangeFrom = '';
    this.dateRangeTo = '';
    this.page = 1;
    this.load();
    this.loadCounts();
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

  openCreateModal(): void {
    this.createDto = {
      titulo: '',
      descripcion: '',
      priority: 'medium',
      category: '',
      clientName: '',
      institucion: '',
      canal: 'internal',
      assignedToId: '',
    };
    this.showCreateModal = true;
    this.actionMenuTicketId = null;
    this.showModuloPicker = false;
    this.selectedModulo = null;
    this.pickerTarget = 'create';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createTicket(): void {
    if (!this.createDto.titulo.trim()) return;
    if (!this.createDto.clientName.trim()) return;

    const dto = {
      titulo: this.createDto.titulo.trim(),
      descripcion: this.createDto.descripcion?.trim() || undefined,
      priority: this.createDto.priority,
      category: this.createDto.category || undefined,
      sourceType: 'internal' as const,
      clientName: this.createDto.clientName.trim(),
      institucion: this.createDto.institucion || undefined,
      canal: this.createDto.canal,
      assignedToId: this.createDto.assignedToId || undefined,
    };
    this.ticketService.create(dto).subscribe({
      next: (ticket: Ticket) => {
        this.showCreateModal = false;
        this.load();
        this.loadCounts();
        this.notification.success(
          'Ticket generado',
          `Ticket ${ticket.codigo} creado correctamente`,
        );
      },
      error: (err) => {
        this.notification.error('Error al crear ticket', err.error?.message || 'Intenta de nuevo.');
      },
    });
  }

  selectTicket(ticket: Ticket): void {
    if ((event?.target as HTMLElement)?.closest('.ts-actions-cell')) return;
    this.loading = true;
    this.editingDetail = false;
    this.actionMenuTicketId = null;
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
    this.showEditModal = false;
    this.detailMenu = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  noteImageUrl(path: string): string {
    return /^https?:\/\//.test(path) ? path : `${environment.apiUrl}${path}`;
  }

  onNoteImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.selectedTicket) return;
    for (const file of Array.from(input.files)) {
      this.noteUploading = true;
      this.ticketService.uploadImage(this.selectedTicket.id, file).subscribe({
        next: (res) => {
          this.noteImages.push(res.url);
          this.noteUploading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.noteUploading = false;
          this.notification.error('Error', 'No se pudo subir la imagen.');
          this.cdr.detectChanges();
        },
      });
    }
    input.value = '';
  }

  removeNoteImage(index: number): void {
    this.noteImages.splice(index, 1);
  }

  async sendNote(): Promise<void> {
    if (!this.selectedTicket) return;
    const content = this.noteContent.trim();
    if (!content && this.noteImages.length === 0) return;
    if (this.noteSending) return;
    this.noteSending = true;
    this.ticketService.addNote(this.selectedTicket.id, { content, images: this.noteImages }).subscribe({
      next: (updated) => {
        this.selectedTicket = updated;
        this.noteContent = '';
        this.noteImages = [];
        this.noteSending = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.noteSending = false;
        this.notification.error('Error', 'No se pudo guardar la nota.');
        this.cdr.detectChanges();
      },
    });
  }

  deleteNote(noteId: string): void {
    if (!this.selectedTicket) return;
    this.ticketService.deleteNote(this.selectedTicket.id, noteId).subscribe({
      next: () => {
        if (this.selectedTicket) {
          this.selectedTicket.notes = (this.selectedTicket.notes ?? []).filter(n => n.id !== noteId);
        }
        this.cdr.detectChanges();
      },
      error: () => this.notification.error('Error', 'No se pudo eliminar la nota.'),
    });
  }

  canDeleteNote(note: any): boolean {
    return this.isAdmin || note?.authorId === this.currentUserId;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showCloseEmailModal) { this.cancelCloseEmail(); return; }
    if (this.showEditModal) { this.closeEditModal(); return; }
    if (this.showModuloPicker) { this.closeModuloPicker(); return; }
    if (this.detailMenu) { this.detailMenu = null; this.cdr.detectChanges(); return; }
    if (this.actionMenuTicketId) { this.actionMenuTicketId = null; return; }
    if (this.showSortMenu) { this.showSortMenu = false; return; }
    if (this.showDateMenu) { this.showDateMenu = false; return; }
    if (this.selectedTicket) this.closeDetail();
    if (this.showCreateModal) this.closeCreateModal();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.ts-actions-cell') && !target.closest('.ts-action-dropdown')) {
      this.actionMenuTicketId = null;
    }
    if (!target.closest('.ts-sort-wrapper')) {
      this.showSortMenu = false;
    }
    if (!target.closest('.ts-date-wrapper')) {
      this.showDateMenu = false;
    }
  }

  toggleActionMenu(ticketId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.actionMenuTicketId === ticketId) {
      this.actionMenuTicketId = null;
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const MENU_H = 420;
      const spaceBelow = window.innerHeight - rect.bottom;
      let top: number;
      if (spaceBelow < MENU_H && rect.top > MENU_H) {
        top = rect.top - MENU_H;
      } else {
        top = rect.bottom + 4;
      }
      this.actionMenuPos = {
        top: Math.max(8, top),
        left: Math.min(rect.left, window.innerWidth - 220),
      };
      this.actionMenuTicketId = ticketId;
    }
    this.cdr.detectChanges();
  }

  onDrop(event: CdkDragDrop<Ticket[]>, targetStatus: string): void {
    if (event.previousContainer === event.container) return;
    const ticket = event.previousContainer.data[event.previousIndex];
    if (this.isDesarrollador && targetStatus === 'closed') {
      this.notification.error('Accion no permitida', 'Solo el asesor puede cerrar tickets.');
      return;
    }
    if (this.tryOpenCloseEmailModal(ticket, targetStatus, 'kanban')) { return; }
    this.applyStatusChange(ticket, targetStatus, 'kanban');
  }

  switchView(mode: 'table' | 'kanban'): void {
    this.viewMode = mode;
    this.selectedTicket = null;
    this.actionMenuTicketId = null;
    this.cdr.detectChanges();
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.load();
  }

  setSortBy(field: string): void {
    this.sortBy = field as any;
    this.showSortMenu = false;
    this.load();
  }

  toggleSortMenu(event: Event): void {
    event.stopPropagation();
    this.showSortMenu = !this.showSortMenu;
    this.cdr.detectChanges();
  }

  toggleDateMenu(event: Event): void {
    event.stopPropagation();
    this.showDateMenu = !this.showDateMenu;
    this.cdr.detectChanges();
  }

  setDateFilter(value: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'range'): void {
    this.dateKey = value;
    if (value === 'range') {
      if (!this.dateRangeFrom || !this.dateRangeTo) {
        this.showDateMenu = true;
        this.cdr.detectChanges();
        return;
      }
    } else {
      this.dateRangeFrom = '';
      this.dateRangeTo = '';
    }
    this.showDateMenu = false;
    this.page = 1;
    this.load();
    this.loadCounts();
  }

  applyDateRange(): void {
    if (!this.dateRangeFrom || !this.dateRangeTo) {
      this.notification.error('Campo requerido', 'Selecciona una fecha inicial y final.');
      return;
    }
    if (this.dateRangeFrom > this.dateRangeTo) {
      this.notification.error('Rango invalido', 'La fecha inicial no puede ser mayor que la final.');
      return;
    }
    this.dateKey = 'range';
    this.showDateMenu = false;
    this.page = 1;
    this.load();
    this.loadCounts();
  }

  // ── Action handlers ────────────────────────────────
  viewTicket(ticket: Ticket, event: Event): void {
    event.stopPropagation();
    this.actionMenuTicketId = null;
    this.selectTicket(ticket);
  }

  editTicket(ticket: Ticket, event: Event): void {
    event.stopPropagation();
    this.actionMenuTicketId = null;
    this.selectTicket(ticket);
  }

  deleteTicket(ticket: Ticket, event: Event): void {
    event.stopPropagation();
    this.actionMenuTicketId = null;
    if (!confirm('¿Eliminar este ticket? Esta accion no se puede deshacer.')) return;
    this.ticketService.delete(ticket.id).subscribe({
      next: () => { this.load(); this.loadCounts(); this.notification.success('Eliminado', 'Ticket eliminado correctamente.'); },
      error: (err) => { this.notification.error('Error', err.error?.message || 'No se pudo eliminar.'); },
    });
  }

  slaIsPaused(t: Ticket): boolean {
    return t.status === 'on_hold';
  }

  slaDone(t: Ticket): boolean {
    return t.status === 'closed' || t.status === 'resolved' || t.status === 'denied';
  }

  slaUrgent(t: Ticket): boolean {
    if (this.slaDone(t) || this.slaIsPaused(t) || !t.slaDeadline) return false;
    const rem = slaTimeRemaining(t.slaDeadline, t.totalPausedMs);
    return !rem.expired && rem.ms <= 3600000;
  }

  slaBadgeText(t: Ticket): string {
    if (!t.slaDeadline) return 'Sin SLA';
    const rem = slaTimeRemaining(t.slaDeadline, t.totalPausedMs);
    if (rem.expired) return 'Vencido';
    if (rem.ms <= 3600000) return `Por vencer · ${rem.label}`;
    return rem.label;
  }

  slaBadgeColor(t: Ticket): string {
    if (!t.slaDeadline) return 'transparent';
    const rem = slaTimeRemaining(t.slaDeadline, t.totalPausedMs);
    if (rem.expired) return '#dc2626';
    if (rem.ms <= 3600000) return '#ef4444';
    if (rem.ms <= 21600000) return '#f59e0b';
    return '#16a34a';
  }

  slaPct(t: Ticket): number {
    if (!t.slaDeadline) return 0;
    const baseMs = (SLA_HOURS[t.priority] ?? 24) * 3600000;
    const rem = slaTimeRemaining(t.slaDeadline, t.totalPausedMs);
    if (rem.expired) return 100;
    const used = baseMs - rem.ms;
    return Math.max(0, Math.min(100, Math.round((used / baseMs) * 100)));
  }

  kanbanPrioMod(t: Ticket): string {
    return 'ts-kanban-card--' + t.priority;
  }

  kanbanPriorityColor(p: string): string {
    const colors: Record<string, string> = { critical: '#EF4444', high: '#F97316', medium: '#3B82F6', low: '#94A3B8' };
    return colors[p] ?? '#94A3B8';
  }

  kanbanAge(t: Ticket): string {
    return formatShortDuration(minutesSince(t.createdAt));
  }

  kanbanAssigned(t: Ticket): string {
    return t.assignedToName || '—';
  }

  kanbanSource(t: Ticket): string {
    if (t.sourceType === 'whatsapp') return 'WhatsApp';
    if (t.sourceType === 'web') return 'Web';
    if (t.sourceType === 'internal') return 'Interno';
    if (t.sourceType === 'email') return 'Correo';
    return 'Web';
  }

  refresh(): void {
    this.load();
    this.loadCounts();
  }

  changeTicketStatus(ticket: Ticket, newStatus: string, event: Event): void {
    event.stopPropagation();
    this.actionMenuTicketId = null;
    if (this.isDesarrollador && newStatus === 'closed') {
      this.notification.error('Accion no permitida', 'Solo el asesor puede cerrar tickets.');
      return;
    }
    if (this.tryOpenCloseEmailModal(ticket, newStatus, 'table')) { return; }
    this.applyStatusChange(ticket, newStatus, 'table');
  }

  changeTicketPriority(ticket: Ticket, newPriority: string, event: Event): void {
    event.stopPropagation();
    this.actionMenuTicketId = null;
    this.ticketService.update(ticket.id, { priority: newPriority as any }).subscribe({
      next: () => { this.load(); this.loadCounts(); this.cdr.detectChanges(); },
      error: () => { this.notification.error('Error', 'No se pudo cambiar la prioridad.'); },
    });
  }

  // ── Detail modal ────────────────────────────────────
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
    this.showModuloPicker = false;
    this.selectedModulo = null;
    this.pickerTarget = 'edit';
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
        this.loadCounts();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notification.error('Error al guardar', err.error?.message || 'No se pudieron guardar los cambios.');
      },
    });
  }

  // ── Categories ──────────────────────────────────────
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

  // ── Modulos ──────────────────────────────────────
  addModulo(): void {
    const nombre = this.moduloForm.nombre.trim();
    if (!nombre) return;
    this.moduloService.create({ nombre, descripcion: this.moduloForm.descripcion.trim() || undefined }).subscribe({
      next: () => { this.moduloForm = { nombre: '', descripcion: '' }; this.loadModulos(); this.notification.success('Modulo creado', `"${nombre}" creado correctamente.`); },
      error: (err) => { this.notification.error('Error', err.error?.message || 'No se pudo crear el modulo.'); },
    });
  }

  startEditModulo(m: Modulo): void {
    this.editingModuloId = m.id;
    this.moduloFormEdit = { nombre: m.nombre, descripcion: m.descripcion || '' };
  }

  saveEditModulo(): void {
    if (!this.editingModuloId) return;
    const nombre = this.moduloFormEdit.nombre.trim();
    if (!nombre) return;
    this.moduloService.update(this.editingModuloId, { nombre, descripcion: this.moduloFormEdit.descripcion.trim() || undefined }).subscribe({
      next: () => { this.editingModuloId = null; this.loadModulos(); },
      error: (err) => { this.notification.error('Error', err.error?.message || 'No se pudo guardar.'); },
    });
  }

  cancelEditModulo(): void {
    this.editingModuloId = null;
  }

  removeModulo(id: string, nombre: string): void {
    if (!confirm(`¿Eliminar el modulo "${nombre}"?`)) return;
    this.moduloService.delete(id).subscribe({
      next: () => { this.loadModulos(); this.notification.success('Eliminado', 'Modulo eliminado correctamente.'); },
      error: (err) => { this.notification.error('Error', err.error?.message || 'No se pudo eliminar.'); },
    });
  }

  toggleDesarrolladorEnModulo(modulo: Modulo, userId: string): void {
    const already = modulo.desarrolladores.some(d => d.id === userId);
    const op = already
      ? this.moduloService.removeDesarrollador(modulo.id, userId)
      : this.moduloService.addDesarrollador(modulo.id, userId);
    op.subscribe({
      next: () => this.loadModulos(),
      error: (err) => this.notification.error('Error', err.error?.message || 'No se pudo actualizar.'),
    });
  }

  isDesarrolladorInModulo(modulo: Modulo, userId: string): boolean {
    return modulo.desarrolladores.some(d => d.id === userId);
  }

  hasAvailableDevelopers(modulo: Modulo): boolean {
    return this.advisors.some(d => !this.isDesarrolladorInModulo(modulo, d.id));
  }

  get totalModuloDevelopers(): number {
    return this.modulos.reduce((acc, m) => acc + m.desarrolladores.length, 0);
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
  }

  onAddDesarrolladorToModulo(modulo: Modulo, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const userId = target.value;
    if (userId) {
      this.toggleDesarrolladorEnModulo(modulo, userId);
      target.value = '';
    }
  }

  getModuloNombre(userId: string): string {
    const m = this.modulos.find(m => m.desarrolladores.some(d => d.id === userId));
    return m?.nombre || '';
  }

  // ── Modulo Picker ────────────────────────────────
  openModuloPicker(target: 'create' | 'edit' | 'assign'): void {
    this.pickerTarget = target;
    this.selectedModulo = null;
    this.showModuloPicker = true;
    this.loadModulos();
  }

  selectModuloInPicker(modulo: Modulo): void {
    this.selectedModulo = modulo;
  }

  selectDesarrolladorInPicker(dev: User): void {
    if (this.pickerTarget === 'create') {
      this.createDto.assignedToId = dev.id;
    } else if (this.pickerTarget === 'edit') {
      this.editDto.assignedToId = dev.id;
    } else if (this.pickerTarget === 'assign') {
      this.assignSelectedTicket(dev.id);
    }
    this.showModuloPicker = false;
    this.selectedModulo = null;
    this.cdr.detectChanges();
  }

  closeModuloPicker(): void {
    this.showModuloPicker = false;
    this.selectedModulo = null;
  }

  // ── Detail edit modal (titulo/categoria/descripcion only) ──
  openEditModal(): void {
    if (!this.selectedTicket) return;
    this.editModalDto = {
      titulo: this.selectedTicket.titulo,
      descripcion: this.selectedTicket.descripcion || '',
      category: this.selectedTicket.category || '',
    };
    this.showEditModal = true;
    this.detailMenu = null;
  }

  closeEditModal(): void {
    this.showEditModal = false;
  }

  saveEditModal(): void {
    if (!this.selectedTicket || !this.editModalDto.titulo.trim()) return;
    const dto: TicketUpdateDto = {};
    if (this.editModalDto.titulo.trim() !== this.selectedTicket.titulo) {
      dto.titulo = this.editModalDto.titulo.trim();
    }
    if ((this.editModalDto.descripcion || '') !== (this.selectedTicket.descripcion || '')) {
      dto.descripcion = this.editModalDto.descripcion || undefined;
    }
    if ((this.editModalDto.category || '') !== (this.selectedTicket.category || '')) {
      dto.category = this.editModalDto.category || undefined;
    }
    if (Object.keys(dto).length === 0) { this.closeEditModal(); return; }

    this.ticketService.update(this.selectedTicket.id, dto).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.showEditModal = false;
        this.load();
        this.loadCounts();
        this.notification.success('Guardado', 'Ticket actualizado correctamente.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notification.error('Error al guardar', err.error?.message || 'No se pudieron guardar los cambios.');
      },
    });
  }

  // ── Detail sidebar actions ─────────────────────────────
  toggleDetailMenu(menu: 'status' | 'priority' | 'category'): void {
    this.detailMenu = this.detailMenu === menu ? null : menu;
    this.cdr.detectChanges();
  }

  changeDetailStatus(newStatus: string): void {
    if (!this.selectedTicket) return;
    if (newStatus === this.selectedTicket.status) { this.detailMenu = null; return; }
    if (this.isDesarrollador && newStatus === 'closed') {
      this.notification.error('Accion no permitida', 'Solo el asesor puede cerrar tickets.');
      return;
    }
    if (this.tryOpenCloseEmailModal(this.selectedTicket, newStatus, 'detail')) return;
    this.applyStatusChange(this.selectedTicket, newStatus, 'detail');
  }

  get closeEmailAddress(): string {
    const t = this.closeEmailTicket;
    if (!t) return '';
    if (!t.clientInfo) return '';
    return String(t.clientInfo['email'] ?? t.clientInfo['correo'] ?? '').trim();
  }

  tryOpenCloseEmailModal(ticket: Ticket, newStatus: string, source: 'detail' | 'table' | 'kanban'): boolean {
    if (newStatus !== 'closed') return false;
    if (!this.isAdmin && !this.isAdvisor) return false;
    if (ticket.sourceType !== 'web' && ticket.sourceType !== 'whatsapp') return false;
    this.closeEmailTicket = ticket;
    this.closeEmailStatus = 'closed';
    this.closeEmailSource = source;
    this.closeEmailSending = false;
    this.showCloseEmailModal = true;
    this.detailMenu = null;
    this.actionMenuTicketId = null;
    this.cdr.detectChanges();
    return true;
  }

  canOpenCloseEmail(ticket: Ticket | null): boolean {
    if (!ticket) return false;
    if (!this.isAdmin && !this.isAdvisor) return false;
    if (ticket.status !== 'resolved') return false;
    return ticket.sourceType === 'web' || ticket.sourceType === 'whatsapp';
  }

  openCloseEmailModal(ticket: Ticket, source: 'detail' | 'table' | 'kanban'): void {
    this.closeEmailTicket = ticket;
    this.closeEmailStatus = 'closed';
    this.closeEmailSource = source;
    this.closeEmailSending = false;
    this.showCloseEmailModal = true;
    this.detailMenu = null;
    this.actionMenuTicketId = null;
    this.cdr.detectChanges();
  }

  sesionDe(ticket: Ticket | null): string {
    if (!ticket?.clientInfo) return '';
    const info = ticket.clientInfo;
    return String(info['sesion'] ?? info['session'] ?? info['codigo_sesion'] ?? '').trim();
  }

  confirmCloseEmail(sendEmail: boolean): void {
    const ticket = this.closeEmailTicket;
    const status = this.closeEmailStatus;
    if (!ticket || !status) return;

    this.closeEmailSending = true;
    const update$ = this.ticketService.update(ticket.id, { status: status as any }).pipe(
      finalize(() => { this.closeEmailSending = false; this.cdr.detectChanges(); }),
    );

    update$.subscribe({
      next: () => {
        this.showCloseEmailModal = false;
        this.closeEmailTicket = null;
        this.closeEmailStatus = '';
        if (this.closeEmailSource === 'detail' && this.selectedTicket) {
          this.ticketService.findById(ticket.id).subscribe((t) => { this.selectedTicket = t; this.cdr.detectChanges(); });
        }
        this.load(); this.loadCounts();
        this.notification.success('Estado actualizado', 'El ticket fue marcado como cerrado.');
        this.cdr.detectChanges();

        if (sendEmail) {
          this.ticketService.sendCloseConfirmation(ticket.id).subscribe({
            next: (res) => {
              if (res?.enviado) {
                this.notification.success('Correo enviado', `Se envio la confirmacion al cliente ${ticket.clientName}.`);
              } else {
                this.notification.error('Correo no enviado', res?.mensaje || 'No se pudo enviar el correo.');
              }
            },
            error: () => this.notification.error('Correo no enviado', 'No se pudo enviar el correo de confirmacion.'),
          });
        }
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudo cambiar el estado.');
      },
    });
  }

  cancelCloseEmail(): void {
    if (this.closeEmailSending) return;
    this.showCloseEmailModal = false;
    this.closeEmailTicket = null;
    this.closeEmailStatus = '';
    this.cdr.detectChanges();
  }

  sendCloseEmailDirect(ticket: Ticket): void {
    if (!ticket || this.closeEmailSending) return;

    this.closeEmailSending = true;
    this.ticketService.update(ticket.id, { status: 'closed' as any }).pipe(
      finalize(() => { this.closeEmailSending = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.closeEmailTicket = null;
        this.closeEmailStatus = '';
        this.showCloseEmailModal = false;
        this.ticketService.findById(ticket.id).subscribe((t) => { this.selectedTicket = t; this.cdr.detectChanges(); });
        this.load(); this.loadCounts();
        this.notification.success('Estado actualizado', 'El ticket fue marcado como cerrado.');
        this.cdr.detectChanges();

        this.ticketService.sendCloseConfirmation(ticket.id).subscribe({
          next: (res) => {
            if (res?.enviado) {
              this.notification.success('Correo enviado', `Se envio la confirmacion al cliente ${ticket.clientName}.`);
            } else {
              this.notification.error('Correo no enviado', res?.mensaje || 'No se pudo enviar el correo.');
            }
          },
          error: () => this.notification.error('Correo no enviado', 'No se pudo enviar el correo de confirmacion.'),
        });
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudo cambiar el estado.');
      },
    });
  }

  private applyStatusChange(ticket: Ticket, newStatus: string, source: 'detail' | 'table' | 'kanban'): void {
    this.ticketService.update(ticket.id, { status: newStatus as any }).subscribe({
      next: () => {
        if (source === 'detail') {
          this.ticketService.findById(ticket.id).subscribe((t) => { this.selectedTicket = t; this.cdr.detectChanges(); });
        }
        this.load(); this.loadCounts();
        this.notification.success('Estado actualizado', 'El estado del ticket fue actualizado.');
        this.cdr.detectChanges();
      },
      error: () => this.notification.error('Error', 'No se pudo cambiar el estado.'),
    });
  }

  changeDetailPriority(newPriority: string): void {
    if (!this.selectedTicket) return;
    if (newPriority === this.selectedTicket.priority) { this.detailMenu = null; return; }
    this.ticketService.update(this.selectedTicket.id, { priority: newPriority as any }).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.detailMenu = null;
        this.load(); this.loadCounts();
        this.cdr.detectChanges();
      },
      error: () => this.notification.error('Error', 'No se pudo cambiar la prioridad.'),
    });
  }

  changeDetailCategory(newCategory: string): void {
    if (!this.selectedTicket) return;
    if ((newCategory || '') === (this.selectedTicket.category || '')) {
      this.detailMenu = null;
      return;
    }
    this.ticketService.update(this.selectedTicket.id, { category: newCategory || undefined }).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.detailMenu = null;
        this.load(); this.loadCounts();
        this.cdr.detectChanges();
      },
      error: () => this.notification.error('Error', 'No se pudo cambiar la categoria.'),
    });
  }

  openAssignTicket(): void {
    this.openModuloPicker('assign');
  }

  assignSelectedTicket(userId: string): void {
    if (!this.selectedTicket) return;
    this.ticketService.update(this.selectedTicket.id, { assignedToId: userId }).subscribe({
      next: (t) => {
        this.selectedTicket = t;
        this.load(); this.loadCounts();
        this.notification.success('Asignado', 'Ticket asignado correctamente.');
        this.cdr.detectChanges();
      },
      error: () => this.notification.error('Error', 'No se pudo asignar el ticket.'),
    });
  }

  get assignedModuleName(): string {
    const target = this.pickerTarget === 'create' ? this.createDto.assignedToId : this.editDto.assignedToId;
    if (!target) return '';
    return this.getModuloNombre(target);
  }

  getFilteredModulos(): Modulo[] {
    return this.modulos.filter(m => m.desarrolladores.length > 0);
  }

  getAssignedDevName(assignedToId: string): string {
    if (!assignedToId) return '';
    const dev = this.advisors.find(a => a.id === assignedToId);
    return dev?.name || '';
  }

  ngOnDestroy(): void {
    this.layout.setSidebarForcedCollapsed(false);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
