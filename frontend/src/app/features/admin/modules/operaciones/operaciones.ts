import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, interval, switchMap, firstValueFrom } from 'rxjs';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { WaChat, WaAdvisorStats, WaConnectionStatus, WaAdminAlert, WaAdminDashboard } from '../../../../core/models/whatsapp.models';
import { getInitials, getAvatarColor } from '../../../../shared/utils/avatar';
import { formatDuration, minutesSince, timeAgo } from '../../../../shared/utils/duration';
import { fmtDateFull, fmtTime12 } from '../../../../shared/utils/date';
import { InfoTooltipDirective } from '../../../../shared/directives/info-tooltip.directive';
import { ConfirmModalComponent } from './components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-operaciones',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TitleCasePipe, InfoTooltipDirective, ConfirmModalComponent],
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
  unassigningId: string | null = null;
  pendingUnassignId: string | null = null;
  unassignError: string | null = null;
  isLoggingOut = false;

  // ────────── Estado de actividad ─────────────────────────
  estadoOpen = false;
  estadoGenerando = false;
  estadoEnviando = false;
  estadoEnviandoIdx = -1;
  estadoEnviados = 0;
  estadoFallidos = 0;
  estadoError: string | null = null;
  estadoSearch = '';
  estadoFiltro: 'todos' | 'activos' | 'grupos' = 'todos';
  estadoSeleccionados = new Set<string>();
  estadoPreviewDataUrl: string | null = null;
  estadoResultado: { id: string; name: string; estado: 'ok' | 'fail' }[] = [];

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
          case 'espera': return ['queued', 'waiting', 'waiting_customer', 'new', 'released'].includes(s);
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
    if (['queued', 'waiting', 'waiting_customer', 'new', 'released'].includes(s)) return 'espera';
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
    if (c === 'cola') return 'sin agente asignado';
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
      lines.push('Agente ya respondió · el contador se reinició');
    }
    lines.push(`Prioridad: ${this.prioridadLabel(chat.priority)}`);
    if (chat.fixedAdvisorName || chat.assignedToName) {
      lines.push(`Agente: ${chat.fixedAdvisorName || chat.assignedToName}`);
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

  get chatsCasoEsperando(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && c.categoria === 'espera_respuesta' && !this.esSlaVencido(c),
    );
  }

  get chatsCasoVencidos(): WaChat[] {
    return this.chats.filter(c => !c.isGroup && this.esSlaVencido(c));
  }

  get chatsCasoEsperandoCliente(): WaChat[] {
    return this.chats.filter(
      c => !c.isGroup && (c.categoria === 'gestion' || c.categoria === 'esperando_cliente'),
    );
  }

  get chatsEstadoCola(): WaChat[] {
    return this.chats.filter(c => this.estadoDeChat(c) === 'cola');
  }

  get chatsEstadoEspera(): WaChat[] {
    return this.chats.filter(c => this.estadoDeChat(c) === 'espera_respuesta');
  }

  get chatsEstadoGestion(): WaChat[] {
    return this.chats.filter(c => this.estadoDeChat(c) === 'gestion');
  }

  get chatsEstadoSoporte(): WaChat[] {
    return this.chats.filter(c => this.estadoDeChat(c) === 'soporte');
  }

  get chatsEstadoGrupos(): WaChat[] {
    return this.chats.filter(c => this.estadoDeChat(c) === 'grupo');
  }

  private estadoDeChat(c: WaChat): string {
    if (c.isGroup) return c.operationalStatus === 'closed' ? 'cerrado' : 'grupo';
    const cat = c.categoria || '';
    if (cat === 'sla_vencido') return 'espera_respuesta';
    if (cat === 'esperando_cliente') return 'gestion';
    if (cat === 'resuelto' || cat === 'cerrado') return 'cerrado';
    if (cat) return cat;
    if (c.assignmentStatus === 'waiting' && c.operationalStatus !== 'waiting_customer' && !c.fixedAdvisorId && c.clientWrote) return 'cola';
    if (c.operationalStatus === 'waiting_technical') return 'soporte';
    return 'gestion';
  }

  esSlaVencido(c: WaChat): boolean {
    if (c.categoria === 'sla_vencido') return true;
    if (c.categoria === 'espera_respuesta' && c.slaWaitingSince && c.slaDeadlineMinutes) {
      return minutesSince(c.slaWaitingSince) >= c.slaDeadlineMinutes;
    }
    return false;
  }

  estadoCategoriaLabel(c: WaChat): string {
    const map: Record<string, string> = {
      cola: 'En cola',
      gestion: 'En gestión',
      espera_respuesta: 'Esperando respuesta',
      soporte: 'Soporte técnico',
    };
    return map[this.estadoDeChat(c)] || '—';
  }

  get chatsCongelados(): WaChat[] {
    return this.chats.filter(c => !!c.frozen);
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
    if (this.estadoOpen && !this.estadoGenerando && !this.estadoEnviando) {
      this.regenerarPreviewEstado();
    }
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

  // ────────── Estado de actividad ─────────────────────────

  get estadoChatsFiltrados(): WaChat[] {
    const q = this.estadoSearch.trim().toLowerCase();
    return this.chats.filter(c => {
      const cerrado = c.assignmentStatus === 'closed' || c.operationalStatus === 'closed';
      if (this.estadoFiltro === 'activos' && (cerrado || c.isGroup)) return false;
      if (this.estadoFiltro === 'grupos' && !c.isGroup) return false;
      if (q) {
        const haystack = `${c.name} ${c.phone} ${c.institution || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  get estadoSeleccionadosCount(): number {
    return this.estadoSeleccionados.size;
  }

  get estadoTodosSeleccionados(): boolean {
    const ids = this.estadoChatsFiltrados.map(c => c.id);
    return ids.length > 0 && ids.every(id => this.estadoSeleccionados.has(id));
  }

  estadoSeleccionado(id: string): boolean {
    return this.estadoSeleccionados.has(id);
  }

  toggleEstadoChat(id: string): void {
    if (this.estadoSeleccionados.has(id)) {
      this.estadoSeleccionados.delete(id);
    } else {
      this.estadoSeleccionados.add(id);
    }
  }

  toggleEstadoTodos(): void {
    const ids = this.estadoChatsFiltrados.map(c => c.id);
    if (this.estadoTodosSeleccionados) {
      ids.forEach(id => this.estadoSeleccionados.delete(id));
    } else {
      ids.forEach(id => this.estadoSeleccionados.add(id));
    }
  }

  openEstadoActividad(): void {
    this.estadoOpen = true;
    this.estadoError = null;
    this.estadoSeleccionados = new Set();
    this.estadoSearch = '';
    this.estadoFiltro = 'todos';
    this.regenerarPreviewEstado();
  }

  closeEstadoActividad(): void {
    this.estadoOpen = false;
    this.estadoEnviando = false;
  }

  async regenerarPreviewEstado(): Promise<void> {
    if (this.estadoGenerando || this.estadoEnviando) return;
    this.estadoGenerando = true;
    this.estadoError = null;
    try {
      this.estadoPreviewDataUrl = await this.generarImagenEstado();
    } catch (err: any) {
      this.estadoError = err?.message || 'No se pudo generar la imagen del estado.';
    } finally {
      this.estadoGenerando = false;
      this.cdr.markForCheck();
    }
  }

  async enviarEstadoActividad(): Promise<void> {
    if (this.estadoEnviando) return;
    const chats = this.chats.filter(c => this.estadoSeleccionados.has(c.id));
    if (chats.length === 0) {
      this.estadoError = 'Selecciona al menos un chat para enviar el estado.';
      return;
    }
    this.estadoEnviando = true;
    this.estadoEnviandoIdx = -1;
    this.estadoEnviados = 0;
    this.estadoFallidos = 0;
    this.estadoResultado = [];
    this.estadoError = null;
    try {
      const dataUrl = this.estadoPreviewDataUrl || (await this.generarImagenEstado());
      const file = this.dataUrlToFile(dataUrl, `estado-actividad-${Date.now()}.png`);
      const caption = `Estado de actividad de asesores - ${fmtDateFull(new Date())} ${fmtTime12(new Date())}`;
      for (let i = 0; i < chats.length; i++) {
        const chat = chats[i];
        this.estadoEnviandoIdx = i;
        const to = chat.jid || chat.phone;
        const res = await firstValueFrom(this.whatsappChat.sendMedia(to, file, caption));
        if (res && res.ok) {
          this.estadoEnviados++;
          this.estadoResultado.push({ id: chat.id, name: chat.name, estado: 'ok' });
        } else {
          this.estadoFallidos++;
          this.estadoResultado.push({ id: chat.id, name: chat.name, estado: 'fail' });
        }
        this.cdr.markForCheck();
        await this.delay(250);
      }
    } catch (err: any) {
      this.estadoError = err?.message || 'Error al enviar el estado de actividad.';
    } finally {
      this.estadoEnviando = false;
      this.estadoEnviandoIdx = -1;
      this.cdr.markForCheck();
    }
  }

  private advisorEstado(a: WaAdvisorStats): { label: string; color: string; key: string } {
    if (!a.active) return { label: 'Inactivo', color: '#94A3B8', key: 'inactivo' };
    const map: Record<string, { label: string; color: string; key: string }> = {
      online: { label: 'Disponible', color: '#10B981', key: 'online' },
      busy: { label: 'En chat', color: '#3B82F6', key: 'busy' },
      away: { label: 'Ausente', color: '#F59E0B', key: 'away' },
    };
    return map[a.status] ?? { label: 'Ausente', color: '#F59E0B', key: 'away' };
  }

  private async generarImagenEstado(): Promise<string> {
    const W = 800;
    const advisors = [...this.advisors].sort((a, b) => a.name.localeCompare(b.name));
    const headerH = 120;
    const rowH = 82;
    const footerH = 44;
    const H = headerH + advisors.length * rowH + footerH;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no soportado');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#0B1219');
    grad.addColorStop(1, '#123B4F');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, headerH);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Estado de actividad de asesores', 32, 30);

    ctx.fillStyle = '#9FB0BD';
    ctx.font = '15px Segoe UI, Arial, sans-serif';
    ctx.fillText(`${fmtDateFull(new Date())} · ${fmtTime12(new Date())}`, 32, 78);

    const photos = await Promise.all(advisors.map(a => this.loadPhoto(a.profilePhotoUrl)));
    for (let i = 0; i < advisors.length; i++) {
      const a = advisors[i];
      const y = headerH + i * rowH;
      if (i > 0) {
        ctx.fillStyle = '#EEF2F6';
        ctx.fillRect(32, y, W - 64, 1);
      }
      const cy = y + rowH / 2;
      const r = 26;
      const ax = 44;
      ctx.fillStyle = this.getAvatarColor(a.name);
      ctx.beginPath();
      ctx.arc(ax, cy, r, 0, Math.PI * 2);
      ctx.fill();
      const photo = photos[i];
      if (photo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(photo, ax - r, cy - r, r * 2, r * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(15,23,42,0.10)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.getInitials(a.name), ax, cy + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 18px Segoe UI, Arial, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(a.name, 88, cy - 12);
      ctx.fillStyle = '#64748B';
      ctx.font = '13px Segoe UI, Arial, sans-serif';
      ctx.fillText(`${a.activeChats} chat(s) activo(s)`, 88, cy + 14);
      const st = this.advisorEstado(a);
      const badgeW = 150;
      const badgeH = 34;
      const badgeX = W - 32 - badgeW;
      const badgeY = cy - badgeH / 2;
      ctx.fillStyle = `${st.color}1A`;
      this.roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 17);
      ctx.fill();
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.arc(badgeX + 26, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 15px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.label, badgeX + badgeW / 2 + 10, cy + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    const fy = headerH + advisors.length * rowH;
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, fy, W, footerH);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '12px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Generado desde el Centro de operaciones · ReportaCasos', 32, fy + footerH / 2);
    ctx.textBaseline = 'alphabetic';

    return canvas.toDataURL('image/png');
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private loadPhoto(url?: string | null): Promise<HTMLImageElement | null> {
    if (!url) return Promise.resolve(null);
    return new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  private dataUrlToFile(dataUrl: string, fileName: string): File {
    const [meta, b64] = dataUrl.split(',');
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  quitarAsignacion(chatId: string): void {
    if (this.unassigningId || !chatId) return;
    this.pendingUnassignId = chatId;
  }

  confirmUnassign(): void {
    const chatId = this.pendingUnassignId;
    this.pendingUnassignId = null;
    if (!chatId || this.unassigningId) return;
    this.unassigningId = chatId;
    this.unassignError = null;
    this.whatsappChat.adminUnassignChat(chatId).subscribe({
      next: () => {
        this.unassigningId = null;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.unassigningId = null;
        this.unassignError = err?.error?.message || err?.message || 'No se pudo quitar la asignación';
        this.cdr.markForCheck();
      },
    });
  }

  cancelUnassign(): void {
    this.pendingUnassignId = null;
  }

  clearUnassignError(): void {
    this.unassignError = null;
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

  ngOnDestroy(): void {
    this.stopProgressTimer();
    this.subs.forEach(s => s.unsubscribe());
    this.layoutService.setSidebarForcedVisible(false);
  }
}
