import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { WaChat, WaAdvisorStats, WaAdminAlert, WaConnectionStatus } from '../../../../core/models/whatsapp.models';
import { getInitials, getAvatarColor } from '../../../../shared/utils/avatar';

interface FilteredAlert {
  type: string;
  label: string;
  count: number;
  severity: string;
}

@Component({
  selector: 'app-operaciones',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TitleCasePipe],
  templateUrl: './operaciones.html',
  styleUrl: './operaciones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesComponent implements OnInit, OnDestroy {
  protected readonly Math = Math;

  summary: {
    totalChats: number; activeChats: number; queuedChats: number;
    waitingCustomerChats: number; waitingTechnicalChats: number;
    closedChats: number; fixedClients: number; manualChats: number;
    slaBreached: number; frozenChats: number;
    avgResponseMinutes: number; slaCompliancePercent: number;
    closedToday: number; uniqueClientsToday: number;
  } | null = null;

  chats: WaChat[] = [];
  advisors: WaAdvisorStats[] = [];
  alerts: WaAdminAlert[] = [];
  loading = true;
  wsConnected = false;

  showSplash = true;
  splashExiting = false;
  splashMode: 'connecting' | 'loading' = 'connecting';
  loadingProgress = 0;
  waConnection: WaConnectionStatus = { status: 'connecting', updatedAt: new Date().toISOString() };

  filterEstado = 'todos';
  filterAsesor = 'todos';
  filterPrioridad = 'todos';
  filterSla = 'todos';
  searchQuery = '';

  currentPage = 1;
  pageSize = 5;

  assignChatId: string | null = null;
  assignBusy = false;
  isLoggingOut = false;

  private dashboardLoaded = false;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private whatsappChat: WhatsappChatService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private layoutService: LayoutService,
  ) {}

  ngOnInit(): void {
    // ── 1. Load dashboard data independently ──────────────────
    this.whatsappChat.loadAdminDashboard().subscribe({
      next: (dashboard) => {
        this.summary = dashboard.summary;
        this.advisors = dashboard.advisors;
        this.alerts = dashboard.alerts;
        this.chats = dashboard.chats;
        this.whatsappChat.syncChats(dashboard.chats);
        this.dashboardLoaded = true;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    // ── 2. Join WebSocket room ─────────────────────────────
    const user = this.auth.getUser();
    if (user?.id) {
      this.whatsappChat.joinAsAdvisor(user.id);
    }

    // ── 3. Load current connection status ──────────────────
    this.whatsappChat.loadConnection().subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });

    // ── 4. Real-time subscriptions ───────────────────────
    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(chats => {
        this.chats = chats;
        this.cdr.markForCheck();
      }),
    );

    // ── 5. Connection stream + splash control ────────────
    this.subs.push(
      this.whatsappChat.getConnectionStream().subscribe(status => {
        this.wsConnected = status.status === 'connected';
        this.waConnection = status;

        if (this.showSplash) {
          this.layoutService.setSidebarForcedVisible(true);
          if (status.status === 'connected') {
            this.startLoadingProgress();
          } else if (status.status === 'qr' || status.status === 'connecting' || status.status === 'disconnected' || status.status === 'error') {
            this.splashMode = 'connecting';
            this.stopProgressTimer();
          }
        }

        this.cdr.markForCheck();
      }),
    );

    // Socket events (force change detection only)
    this.subs.push(
      this.whatsappChat.onNewMessage().subscribe(() => this.cdr.markForCheck()),
      this.whatsappChat.onChatAssigned().subscribe(() => this.cdr.markForCheck()),
      this.whatsappChat.onChatUpdated().subscribe(() => this.cdr.markForCheck()),
    );

    // ── 6. Auto-refresh fallback ──────────────────────────
    this.subs.push(
      interval(15_000).subscribe(() => {
        this.whatsappChat.loadAdminDashboard().subscribe({
          next: (dashboard) => {
            this.summary = dashboard.summary;
            this.advisors = dashboard.advisors;
            this.alerts = dashboard.alerts;
            this.whatsappChat.syncChats(dashboard.chats);
            this.cdr.markForCheck();
          },
          error: (err) => console.error('HTTP Error:', err),
        });
      }),
    );
  }

  // ────────── Filtros ──────────────────────────────────────

  get filteredChats(): WaChat[] {
    let result = this.chats;

    if (this.filterEstado !== 'todos') {
      result = result.filter(c => {
        const s = c.operationalStatus || c.assignmentStatus || '';
        switch (this.filterEstado) {
          case 'activo': return ['active', 'assigned', 'in_progress'].includes(s);
          case 'espera': return ['queued', 'waiting', 'waiting_customer', 'new'].includes(s);
          case 'cerrado': return ['closed', 'resolved'].includes(s);
          default: return true;
        }
      });
    }

    if (this.filterAsesor !== 'todos') {
      result = result.filter(c => c.assignedTo === this.filterAsesor);
    }

    if (this.filterPrioridad !== 'todos') {
      result = result.filter(c => (c.priority || 'normal') === this.filterPrioridad);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.preview || '').toLowerCase().includes(q),
      );
    }

    return result;
  }

  get paginatedChats(): WaChat[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredChats.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredChats.length / this.pageSize));
  }

  get totalFiltered(): number {
    return this.filteredChats.length;
  }

  get advisorOptions(): WaAdvisorStats[] {
    return this.advisors;
  }

  get alertChips(): FilteredAlert[] {
    const chips: FilteredAlert[] = [];
    const s = this.summary;
    if (!s) return chips;

    if (s.slaBreached > 0) chips.push({ type: 'sla_breached', label: 'SLA vencidos', count: s.slaBreached, severity: 'red' });
    if (s.frozenChats > 0) chips.push({ type: 'frozen', label: 'Chats congelados', count: s.frozenChats, severity: 'amber' });
    const inactiveCount = this.advisors.filter(a => a.status === 'away' || !a.active).length;
    if (inactiveCount > 0) chips.push({ type: 'inactive_advisor', label: 'Asesores inactivos', count: inactiveCount, severity: 'orange' });
    if (s.waitingCustomerChats > 0) chips.push({ type: 'waiting_customers', label: 'Clientes esperando', count: s.waitingCustomerChats, severity: 'blue' });
    return chips;
  }

  // ────────── trackBy ─────────────────────────────────────

  trackByChatId(_: number, c: WaChat): string { return c.id; }
  trackByAdvisorId(_: number, a: WaAdvisorStats): string { return a.id; }
  trackByAlertType(_: number, a: FilteredAlert): string { return a.type; }
  trackByIndex(i: number): number { return i; }

  // ────────── Helpers visuales ────────────────────────────

  prioridadClass(p?: string): string {
    const map: Record<string, string> = { critical: 'urgente', high: 'alta', normal: 'media', low: 'baja' };
    return map[p || 'normal'] || 'media';
  }

  estadoClass(chat: WaChat): string {
    const s = chat.operationalStatus || chat.assignmentStatus || '';
    if (['active', 'assigned', 'in_progress'].includes(s)) return 'activo';
    if (['queued', 'waiting', 'waiting_customer', 'new'].includes(s)) return 'espera';
    if (['closed', 'resolved'].includes(s)) return 'cerrado';
    return 'activo';
  }

  estadoLabel(chat: WaChat): string {
    return chat.operationalStatusLabel || chat.operationalStatus || chat.assignmentStatus || 'Activo';
  }

  slaPercent(_chat: WaChat): number {
    return this.summary?.slaCompliancePercent ?? 100;
  }

  slaColor(pct: number): string {
    if (pct < 60) return '#DC2626';
    if (pct < 80) return '#F59E0B';
    return '#10B981';
  }

  advisorCapacity(advisor: WaAdvisorStats): number {
    const total = advisor.connectedMinutes + advisor.idleMinutes;
    if (total === 0) return Math.min(advisor.activeChats * 20, 100);
    return Math.round((advisor.connectedMinutes / total) * 100);
  }

  capacityColor(pct: number): string {
    if (pct > 110) return '#DC2626';
    if (pct > 100) return '#F59E0B';
    return '#10B981';
  }

  advisorSlaRiesgo(advisor: WaAdvisorStats): number {
    return Math.max(0, Math.round((1 - advisor.slaPercent / 100) * advisor.activeChats));
  }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  applyFilters(): void { this.currentPage = 1; }

  clearFilters(): void {
    this.filterEstado = 'todos';
    this.filterAsesor = 'todos';
    this.filterPrioridad = 'todos';
    this.filterSla = 'todos';
    this.searchQuery = '';
    this.currentPage = 1;
  }

  getInitials = getInitials;
  getAvatarColor = getAvatarColor;

  statusLabel(advisor: WaAdvisorStats): string {
    if (!advisor.active) return 'Inactivo';
    const map: Record<string, string> = { online: 'Disponible', busy: 'En chat', away: 'Ausente' };
    return map[advisor.status] || advisor.status;
  }

  statusClass(advisor: WaAdvisorStats): string {
    if (!advisor.active) return 'away';
    return advisor.status;
  }

  // ────────── Navegación ──────────────────────────────────

  get assignChat(): WaChat | null {
    return this.assignChatId ? this.chats.find(c => c.id === this.assignChatId) || null : null;
  }

  goToChats(): void { this.router.navigate(['/admin/operaciones/chats']); }
  goToAsesores(): void { this.router.navigate(['/admin/operaciones/asesores']); }
  goToAlertas(): void { this.router.navigate(['/admin/operaciones/alertas']); }
  goToAsignar(): void { this.router.navigate(['/admin/operaciones/asignar']); }
  goToFijar(): void { this.router.navigate(['/admin/operaciones/fijar']); }
  openChat(chatId: string): void { this.router.navigate(['/admin/operaciones/chats'], { queryParams: { chatId } }); }

  openAssignMenu(chatId: string): void {
    this.assignChatId = chatId;
    this.assignBusy = false;
  }

  closeAssignMenu(): void {
    this.assignChatId = null;
    this.assignBusy = false;
  }

  confirmAssign(advisorId: string): void {
    if (!this.assignChatId || this.assignBusy) return;
    this.assignBusy = true;
    const advisor = this.advisors.find(a => a.id === advisorId);
    const msg = advisor ? `Hola, soy {{advisor}} y el dia de hoy te atendere.` : undefined;
    this.whatsappChat.adminAssignChat(this.assignChatId, advisorId, 'admin', msg).subscribe({
      next: () => {
        this.closeAssignMenu();
        this.cdr.markForCheck();
      },
      error: () => {
        this.assignBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ────────── Splash / Conexión ────────────────────────────

  get splashStatusText(): string {
    switch (this.waConnection.status) {
      case 'connecting':   return 'Preparando sesión segura...';
      case 'qr':           return this.waConnection.qrDataUrl ? 'Escanea el código con WhatsApp' : 'Generando código QR...';
      case 'connected':    return 'Conectado';
      case 'error':        return this.waConnection.lastError || 'Error de conexión';
      case 'disconnected': return 'Desconectado';
      default:             return 'Conectando...';
    }
  }

  get splashShowQr(): boolean {
    return this.waConnection.status === 'qr' && !!this.waConnection.qrDataUrl;
  }

  get splashShowSpinner(): boolean {
    return this.splashMode === 'connecting' && (
      this.waConnection.status === 'connecting' ||
      (this.waConnection.status === 'qr' && !this.waConnection.qrDataUrl)
    );
  }

  get splashShowRetry(): boolean {
    return this.waConnection.status === 'error' || this.waConnection.status === 'disconnected';
  }

  private startLoadingProgress(): void {
    if (this.splashMode === 'loading') return;
    this.splashMode = 'loading';
    this.loadingProgress = 0;
    this.stopProgressTimer();

    const tick = () => {
      if (!this.dashboardLoaded) {
        const remaining = 100 - this.loadingProgress;
        const increment = Math.min(remaining * 0.15 + Math.random() * 3, 8);
        this.loadingProgress = Math.min(this.loadingProgress + increment, 90);
      } else {
        this.loadingProgress = 100;
        this.stopProgressTimer();
        setTimeout(() => {
          this.showSplash = false;
          this.layoutService.setSidebarForcedVisible(false);
          this.loading = false;
          this.cdr.markForCheck();
        }, 500);
      }
      this.cdr.markForCheck();
    };

    this.progressTimer = setInterval(tick, 400);
    tick();
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  retryConnection(): void {
    this.whatsappChat.restartConnection().subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  logoutWhatsapp(): void {
    if (this.isLoggingOut) return;
    this.isLoggingOut = true;
    this.splashMode = 'connecting';
    this.showSplash = true;
    this.layoutService.setSidebarForcedVisible(true);
    this.stopProgressTimer();
    this.loadingProgress = 0;
    this.whatsappChat.logoutConnection().subscribe({
      next: () => {
        this.isLoggingOut = false;
        setTimeout(() => this.whatsappChat.restartConnection().subscribe({
          error: (err) => console.error('HTTP Error:', err),
        }), 500);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoggingOut = false;
        this.whatsappChat.restartConnection().subscribe({
          error: (err) => console.error('HTTP Error:', err),
        });
        this.cdr.markForCheck();
      },
    });
  }

  openAdminSidebar(): void {
    const btn = document.querySelector('.sidebar-toggle-btn') as HTMLButtonElement;
    btn?.click();
  }

  ngOnDestroy(): void {
    this.stopProgressTimer();
    this.subs.forEach(s => s.unsubscribe());
    this.layoutService.setSidebarForcedVisible(false);
  }
}
