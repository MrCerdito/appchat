import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, interval, switchMap } from 'rxjs';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { WaChat, WaAdvisorStats, WaConnectionStatus, WaAdminAlert, WaAdminDashboard } from '../../../../core/models/whatsapp.models';
import { getInitials, getAvatarColor } from '../../../../shared/utils/avatar';
import { formatDuration, minutesSince, timeAgo } from '../../../../shared/utils/duration';
import { InfoTooltipDirective } from '../../../../shared/directives/info-tooltip.directive';

@Component({
  selector: 'app-operaciones',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TitleCasePipe, InfoTooltipDirective],
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
    slaBreached: number; porVencer: number; frozenChats: number;
    avgResponseMinutes: number; slaCompliancePercent: number;
    slaComplianceDenominator: number;
    enGestion: number; esperandoRespuesta: number; soporteChats: number;
    closedToday: number; uniqueClientsToday: number;
  } | null = null;

  chats: WaChat[] = [];
  advisors: WaAdvisorStats[] = [];
  alerts: WaAdminAlert[] = [];
  loading = true;
  wsConnected = false;
  lastSync = '';

  monitorTab: 'panorama' | 'categorias' | 'actividad' = 'panorama';
  filtersOpen = false;

  showSplash = true;
  splashExiting = false;
  splashMode: 'connecting' | 'loading' = 'connecting';
  loadingProgress = 0;
  waConnection: WaConnectionStatus = { status: 'connecting', updatedAt: new Date().toISOString() };
  qrExpiresIn = 0;
  private qrCountdownTimer: ReturnType<typeof setInterval> | null = null;

  filterEstado = 'todos';
  filterAsesor = 'todos';
  filterPrioridad = 'todos';
  filterSla = 'todos';
  filterCategoria = 'todos';
  searchQuery = '';

  currentPage = 1;
  pageSize = 5;

  assignChatId: string | null = null;
  assignBusy = false;
  assignError: string | null = null;
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
      next: (dashboard) => this.applyDashboard(dashboard),
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

    // ── 3b. Polling fallback each 30s ────────────────────
    this.subs.push(
      interval(30_000).pipe(
        switchMap(() => this.whatsappChat.loadConnection()),
      ).subscribe(),
    );

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

        if (status.status === 'qr') {
          this.startQrCountdown();
        } else {
          this.stopQrCountdown();
        }

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

    // ── 5b. Real-time admin dashboard push ────────────────
    this.subs.push(
      this.whatsappChat.onAdminDashboard().subscribe((dashboard) => {
        if (!dashboard) return;
        this.applyDashboard(dashboard, dashboard.wsTimestamp);
      }),
    );

    // ── 6. Auto-refresh fallback ──────────────────────────
    this.subs.push(
      interval(10_000).subscribe(() => {
        this.whatsappChat.loadAdminDashboard().subscribe({
          next: (dashboard) => this.applyDashboard(dashboard),
          error: (err) => console.error('HTTP Error:', err),
        });
      }),
    );

    // ── 7. Tick en vivo para tiempos transcurridos ────────────
    this.subs.push(
      interval(30_000).subscribe(() => {
        this.cdr.markForCheck();
      }),
    );
  }

  // ────────── Filtros ──────────────────────────────────────

  get filteredChats(): WaChat[] {
    let result = this.chats;

    if (this.filterCategoria !== 'todos') {
      result = result.filter(c => (c.categoria || '') === this.filterCategoria);
    }

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

    if (this.filterSla !== 'todos') {
      result = result.filter(c => {
        const state = c.slaState || 'in_time';
        switch (this.filterSla) {
          case 'vencido': return !!c.slaBreached || state === 'vencido';
          case 'por_vencer': return state === 'por_vencer';
          case 'en_tiempo': return state === 'in_time' && !c.frozen;
          case 'congelado': return !!c.frozen;
          default: return true;
        }
      });
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

  // ────────── trackBy ─────────────────────────────────────

  trackByChatId(_: number, c: WaChat): string { return c.id; }
  trackByAdvisorId(_: number, a: WaAdvisorStats): string { return a.id; }
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

  slaEstado(chat: WaChat): string {
    const c = chat.categoria || '';
    if (c === 'sla_vencido') return 'vencido';
    if (c === 'espera_respuesta') return 'espera';
    if (c === 'soporte') return 'soporte';
    if (c === 'esperando_cliente') return 'cliente';
    if (c === 'cola') return 'cola';
    if (c === 'resuelto') return 'resuelto';
    if (c === 'cerrado') return 'cerrado';
    if (chat.slaBreached || chat.slaState === 'vencido') return 'vencido';
    if (chat.slaState === 'por_vencer') return 'espera';
    if (chat.slaState === 'in_time') return 'in_time';
    return 'gestion';
  }

  slaEstadoLabel(chat: WaChat): string {
    const map: Record<string, string> = {
      in_time: 'En tiempo',
      espera: 'Por vencer',
      vencido: 'Vencido',
      gestion: 'En gestión',
      soporte: 'En soporte',
      cliente: 'Espera cliente',
      cola: 'En cola',
      resuelto: 'Resuelto',
      cerrado: 'Cerrado',
    };
    return map[this.slaEstado(chat)] || 'En tiempo';
  }

  slaEstadoClass(chat: WaChat): string {
    return this.slaEstado(chat);
  }

  slaEspera(chat: WaChat): string {
    const c = chat.categoria || '';
    if (c === 'resuelto' || c === 'cerrado') return '—';
    if (c === 'gestion' || c === 'esperando_cliente' || c === 'soporte') {
      const iso = chat.slaWaitingSince ?? (chat.lastClientMsg ? new Date(chat.lastClientMsg).toISOString() : '');
      return iso ? timeAgo(iso) : 'en gestión';
    }
    const mins = minutesSince(chat.slaWaitingSince) || chat.slaMinutesWaiting || 0;
    if (mins < 1) return 'ahora';
    return formatDuration(mins);
  }

  slaRestante(chat: WaChat): string {
    const c = chat.categoria || '';
    if (c === 'gestion') return 'respondido · espera al cliente';
    if (c === 'soporte') return 'en soporte técnico';
    if (c === 'esperando_cliente') return 'espera al cliente';
    if (c === 'cola') return 'sin asesor asignado';
    if (c === 'resuelto') return 'resuelto';
    if (c === 'cerrado') return 'cerrado';
    const state = this.slaEstado(chat);
    if (state === 'in_time') {
      return `plazo ${formatDuration(chat.slaDeadlineMinutes ?? 7)}`;
    }
    const rem = chat.slaRemainingMinutes ?? 0;
    if (state === 'vencido') return `+${formatDuration(Math.abs(rem))} de retraso`;
    return `${formatDuration(rem)} restantes`;
  }

  tiempoColumna(chat: WaChat): string {
    const iso = chat.slaWaitingSince ?? (chat.lastClientMsg ? new Date(chat.lastClientMsg).toISOString() : '');
    if (!iso) return '—';
    return timeAgo(iso);
  }

  slaTooltip(chat: WaChat): string {
    const c = chat.categoria || '';
    const cat = chat.categoriaLabel || this.categoriaLabel(chat);
    const lines: string[] = [];
    lines.push(`${cat}${chat.isGroup ? ' (grupo)' : ''}`);
    if (c === 'espera_respuesta' || c === 'sla_vencido' || c === 'cola') {
      lines.push(`Espera: ${this.slaEspera(chat)}`);
    } else if (c === 'gestion' || c === 'esperando_cliente' || c === 'soporte') {
      lines.push(`Última respuesta: ${this.slaEspera(chat)}`);
    }
    if (c === 'espera_respuesta' || c === 'sla_vencido') {
      lines.push(`Plazo: ${formatDuration(chat.slaDeadlineMinutes ?? 7)}`);
    }
    if (c === 'espera_respuesta') {
      const rem = chat.slaRemainingMinutes ?? 0;
      lines.push(`Restante: ${formatDuration(rem)}`);
    } else if (c === 'sla_vencido') {
      const rem = Math.abs(chat.slaRemainingMinutes ?? 0);
      lines.push(`Retraso: +${formatDuration(rem)}`);
    } else if (c === 'gestion') {
      lines.push('Asesor ya respondió · el contador se reinició');
    }
    lines.push(`Prioridad: ${this.prioridadLabel(chat.priority)}`);
    if (chat.fixedAdvisorName || chat.assignedToName) {
      lines.push(`Asesor: ${chat.fixedAdvisorName || chat.assignedToName}`);
    }
    const last = chat.slaWaitingSince || (chat.lastClientMsg ? new Date(chat.lastClientMsg).toISOString() : '');
    if (last) lines.push(`Último mensaje: ${timeAgo(last)}`);
    return lines.join('\n');
  }

  prioridadLabel(p?: string): string {
    const map: Record<string, string> = {
      critical: 'Urgente', high: 'Alta', normal: 'Media', low: 'Baja',
    };
    return map[p || 'normal'] || 'Normal';
  }

  esCongelado(chat: WaChat): boolean {
    return !!chat.frozen;
  }

  congeladoTexto(chat: WaChat): string {
    return `sin movimiento ${formatDuration(chat.frozenMinutes ?? 0)}`;
  }

  get chatsVencidos(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && (this.chatCategoriaLocal(c) === 'sla_vencido'),
    );
  }

  get chatsEsperando(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && (this.chatCategoriaLocal(c) === 'espera_respuesta'),
    );
  }

  get chatsEnCola(): WaChat[] {
    return this.chats.filter(c => !c.isGroup && (c.categoria === 'cola' || (c.assignmentStatus === 'waiting' && c.operationalStatus !== 'waiting_customer')));
  }

  get chatsSoporte(): WaChat[] {
    return this.chats.filter(c => !c.isGroup && (c.categoria === 'soporte' || c.operationalStatus === 'waiting_technical'));
  }

  get chatsGestion(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && this.chatCategoriaLocal(c) === 'gestion',
    );
  }

  get chatsEsperandoCliente(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && this.chatCategoriaLocal(c) === 'esperando_cliente',
    );
  }

  get chatsGrupos(): WaChat[] {
    return this.chats.filter(
      c => c.isGroup && c.operationalStatus !== 'closed',
    );
  }

  get chatsCongelados(): WaChat[] {
    return this.chats.filter(c => !!c.frozen);
  }

  private chatCategoriaLocal(c: WaChat): string {
    if (c.categoria === 'espera_respuesta' && c.slaWaitingSince && c.slaDeadlineMinutes) {
      const mins = minutesSince(c.slaWaitingSince);
      if (mins >= c.slaDeadlineMinutes) return 'sla_vencido';
    }
    return c.categoria || 'gestion';
  }

  get cumplimientoDetalle(): string {
    if (!this.summary) return '';
    const den = this.summary.slaComplianceDenominator ?? this.summary.activeChats;
    const ok = Math.max(0, den - this.summary.slaBreached);
    return `${ok}/${den}`;
  }

  get slaCompliancePct(): number {
    return this.summary?.slaCompliancePercent ?? 100;
  }

  get distribution(): Array<{ categoria: string; label: string; cls: string; count: number; pct: number }> {
    if (!this.summary) return [];
    const items = [
      { categoria: 'cola', label: 'En cola', cls: 'cola', count: this.summary.queuedChats },
      { categoria: 'espera_respuesta', label: 'Esperando respuesta', cls: 'por_vencer', count: this.summary.esperandoRespuesta },
      { categoria: 'sla_vencido', label: 'SLA vencido', cls: 'vencido', count: this.summary.slaBreached },
      { categoria: 'gestion', label: 'En gestión', cls: 'gestion', count: this.summary.enGestion },
      { categoria: 'esperando_cliente', label: 'Esperando cliente', cls: 'cliente', count: this.summary.waitingCustomerChats },
      { categoria: 'soporte', label: 'Soporte', cls: 'soporte', count: this.summary.soporteChats },
    ];
    const total = items.reduce((s, i) => s + i.count, 0) || 1;
    return items.map(i => ({ ...i, pct: Math.round((i.count / total) * 100) }));
  }

  get totalDistribucion(): number {
    return this.distribution.reduce((s, i) => s + i.count, 0);
  }

  get onlineAdvisorCount(): number {
    return this.advisors.filter(a => a.active && a.status !== 'offline').length;
  }

  get avgAdvisorCapacity(): number {
    if (!this.advisors.length) return 0;
    const avg = this.advisors.reduce((s, a) => s + this.advisorCapacity(a), 0) / this.advisors.length;
    return Math.round(avg);
  }

  get advisorsWithSlaBreach(): number {
    return this.advisors.filter(a => a.slaBreachedChats > 0).length;
  }

  get lastSyncText(): string {
    if (!this.lastSync) return '—';
    return timeAgo(this.lastSync);
  }

  get activeChatsPct(): number {
    if (!this.summary || !this.summary.totalChats) return 0;
    return Math.round((this.summary.activeChats / this.summary.totalChats) * 100);
  }

  gaugeOffset(pct: number): number {
    const clamped = Math.min(100, Math.max(0, pct));
    const circumference = 2 * Math.PI * 15.9;
    return circumference * (1 - clamped / 100);
  }

  categoriaClass(chat: WaChat): string {
    const c = chat.categoria || '';
    if (c === 'sla_vencido') return 'vencido';
    if (c === 'espera_respuesta') return 'por_vencer';
    if (c === 'soporte') return 'soporte';
    if (c === 'esperando_cliente') return 'cliente';
    if (c === 'cola') return 'cola';
    if (c === 'resuelto') return 'resuelto';
    if (c === 'cerrado') return 'cerrado';
    if (c === 'grupo') return 'grupo';
    return 'gestion';
  }

  categoriaLabel(chat: WaChat): string {
    if (chat.categoriaLabel) return chat.categoriaLabel;
    const map: Record<string, string> = {
      cola: 'En cola', gestion: 'En gestión', espera_respuesta: 'Esperando respuesta',
      sla_vencido: 'SLA vencido', esperando_cliente: 'Esperando cliente',
      soporte: 'Soporte técnico', resuelto: 'Resuelto', cerrado: 'Cerrado', grupo: 'Grupo',
    };
    return map[chat.categoria || ''] || chat.operationalStatusLabel || chat.operationalStatus || 'Activo';
  }

  advisorCapacity(advisor: WaAdvisorStats): number {
    const total = advisor.connectedMinutes + advisor.idleMinutes;
    if (total === 0) return Math.min(advisor.activeChats * 20, 100);
    return Math.round((advisor.connectedMinutes / total) * 100);
  }

  dur(minutes: number): string {
    return formatDuration(minutes);
  }

  capacityColor(pct: number): string {
    if (pct > 110) return '#DC2626';
    if (pct > 100) return '#F59E0B';
    return '#10B981';
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
    this.filterCategoria = 'todos';
    this.searchQuery = '';
    this.currentPage = 1;
  }

  setMonitorTab(tab: 'panorama' | 'categorias' | 'actividad'): void {
    this.monitorTab = tab;
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
  }

  filterByCategoria(categoria: string): void {
    this.filterCategoria = categoria;
    this.filterEstado = 'todos';
    this.filterSla = categoria === 'sla_vencido' ? 'vencido' : 'todos';
    this.applyFilters();
    this.scrollToChats();
  }

  clearCategoria(): void {
    this.filterCategoria = 'todos';
    this.filterSla = 'todos';
    this.applyFilters();
  }

  private scrollToChats(): void {
    document.getElementById('op-chats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openAlert(alert: WaAdminAlert): void {
    if (alert.chatId) {
      this.openChat(alert.chatId);
    } else if (alert.advisorId) {
      this.goToAsesores();
    }
  }

  alertSeverityCls(alert: WaAdminAlert): string {
    return alert.severity || 'info';
  }

  private applyDashboard(d: WaAdminDashboard, wsTime?: string): void {
    this.summary = d.summary;
    this.advisors = d.advisors;
    this.alerts = (d.alerts ?? []).slice(0, 20);
    this.whatsappChat.syncChats(d.chats);
    this.lastSync = wsTime ?? new Date().toISOString();
    this.dashboardLoaded = true;
    this.cdr.markForCheck();
  }

  getInitials = getInitials;
  getAvatarColor = getAvatarColor;
  timeAgo = timeAgo;

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
  goToAsignar(): void { this.router.navigate(['/admin/operaciones/asignar']); }
  goToFijar(): void { this.router.navigate(['/admin/operaciones/fijar']); }
  goToReportes(): void { this.router.navigate(['/admin/operaciones/reportes']); }
  goToChatInterno(): void { this.router.navigate(['/admin/operaciones/chats'], { queryParams: { modo: 'asesores' } }); }
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
    this.assignError = null;
    const advisor = this.advisors.find(a => a.id === advisorId);
    const chat = this.assignChat;
    const msg = !chat?.isGroup && advisor ? `Hola, soy {{advisor}} y el dia de hoy te atendere.` : undefined;
    this.whatsappChat.adminAssignChat(this.assignChatId, advisorId, 'admin', msg).subscribe({
      next: () => {
        this.closeAssignMenu();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.assignBusy = false;
        this.assignError = err?.error?.message || err?.message || 'No se pudo asignar el chat';
        this.cdr.markForCheck();
      },
    });
  }

  // ────────── Splash / Conexión ────────────────────────────

  get splashStatusText(): string {
    switch (this.waConnection.status) {
      case 'connecting':   return 'Preparando sesión segura...';
      case 'qr':           return this.waConnection.qrDataUrl
        ? `Escanea el código con WhatsApp — Expira en ${this.qrExpiresIn}s`
        : 'Generando código QR...';
      case 'connected':    return 'Conectado';
      case 'error':        return this.waConnection.lastError || 'Error de conexión';
      case 'disconnected': return 'Desconectado';
      default:             return 'Conectando...';
    }
  }

  private startQrCountdown(): void {
    this.stopQrCountdown();
    this.qrExpiresIn = 55;
    this.qrCountdownTimer = setInterval(() => {
      this.qrExpiresIn = Math.max(0, this.qrExpiresIn - 1);
      this.cdr.markForCheck();
      if (this.qrExpiresIn <= 0) this.stopQrCountdown();
    }, 1000);
  }

  private stopQrCountdown(): void {
    if (this.qrCountdownTimer) {
      clearInterval(this.qrCountdownTimer);
      this.qrCountdownTimer = null;
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
