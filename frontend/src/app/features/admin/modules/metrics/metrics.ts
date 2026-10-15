import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import {
  AdminService, MetricsDashboard, MxMarca,
} from '../../../../core/services/admin.service';
import { SessionService } from '../../../../core/services/session.service';
import { User } from '../../../../core/models/user.model';
import { SocketService } from '../../../../core/services/socket.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

type FechaPreset = 'hoy' | '7d' | '30d' | 'custom';

export type MxTab =
  | 'general'
  | 'requerimientos'
  | 'colegios'
  | 'asesoria'
  | 'capacitaciones'
  | 'solicitudes'
  | 'conexiones';

interface TicketStatusEntry {
  key: string;
  label: string;
  color: string;
  value: number;
}

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './metrics.html',
  styleUrl: './metrics.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  Math = Math;

  // ── Filtros ──
  filtros = {
    asesorId: '',
    marca: 'all' as MxMarca,
    preset: '30d' as FechaPreset,
  };
  desde = '';
  hasta = '';
  advisors: User[] = [];

  // ── Datos (una sola llamada por cambio de filtro) ──
  dash: MetricsDashboard | null = null;
  tab: MxTab = 'general';

  loading = true;
  error = false;
  exporting = false;

  readonly tabs: { id: MxTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'requerimientos', label: 'Requerimientos' },
    { id: 'colegios', label: 'Atención por colegio' },
    { id: 'asesoria', label: 'Asesoría' },
    { id: 'capacitaciones', label: 'Capacitaciones' },
    { id: 'solicitudes', label: 'Solicitudes' },
    { id: 'conexiones', label: 'Conexiones por agente' },
  ];

  private refresh$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private sessionService: SessionService,
    private socket: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.setPreset('30d', false);

    this.sessionService.findAdvisors().subscribe({
      next: (list) => {
        this.advisors = list;
        this.cdr.detectChanges();
      },
      error: () => {},
    });

    // Carga inicial + refresco en tiempo real (con debounce para no saturar).
    this.refresh$.pipe(debounceTime(600), takeUntil(this.destroy$)).subscribe(() => this.fetch());
    this.refresh$.next();

    this.socket.on('metrics_updated').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
    this.socket.on('session_updated').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
    this.socket.on('advisor_status_changed').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  setTab(tab: MxTab): void {
    this.tab = tab;
  }

  setAsesor(id: string): void {
    this.filtros.asesorId = id;
    this.refresh$.next();
  }

  setMarca(m: MxMarca): void {
    this.filtros.marca = m;
    this.refresh$.next();
  }

  setPreset(preset: FechaPreset, refetch = true): void {
    this.filtros.preset = preset;
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    if (preset === 'hoy') {
      this.desde = iso(now);
      this.hasta = iso(now);
    } else if (preset === '7d' || preset === '30d') {
      const back = preset === '7d' ? 6 : 29;
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      this.desde = iso(d);
      this.hasta = iso(now);
    }
    if (refetch) this.refresh$.next();
  }

  onFechasCambiadas(): void {
    this.filtros.preset = 'custom';
    if (this.desde && this.hasta && this.desde > this.hasta) this.hasta = this.desde;
    if (this.desde && this.hasta && this.hasta < this.desde) this.desde = this.hasta;
    this.refresh$.next();
  }

  resetFiltros(): void {
    this.filtros.asesorId = '';
    this.filtros.marca = 'all';
    this.setPreset('30d', false);
    this.refresh$.next();
  }

  // ── Carga ──────────────────────────────────────────────────────────────────
  private fetch(): void {
    this.loading = !this.dash;
    this.adminService
      .getMetricsDashboard({
        marca: this.filtros.marca,
        desde: this.desde || undefined,
        hasta: this.hasta || undefined,
        asesorId: this.filtros.asesorId || undefined,
      })
      .subscribe({
        next: (d) => {
          this.dash = d;
          this.loading = false;
          this.error = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          if (!this.dash) this.error = true;
          this.cdr.detectChanges();
        },
      });
  }

  retry(): void {
    this.error = false;
    this.loading = true;
    this.cdr.detectChanges();
    this.fetch();
  }

  exportarExcel(): void {
    if (this.exporting || !this.dash) return;
    this.exporting = true;
    this.cdr.detectChanges();
    this.adminService
      .exportMetricsDashboard({
        marca: this.filtros.marca,
        desde: this.desde || undefined,
        hasta: this.hasta || undefined,
        asesorId: this.filtros.asesorId || undefined,
      })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `metricas_${this.desde || 'todo'}_a_${this.hasta || 'hoy'}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.exporting = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.exporting = false;
          this.cdr.detectChanges();
        },
      });
  }

  // ── Getters ─────────────────────────────────────────────────────────────────
  get kpiTickets() {
    return this.dash?.requerimientos.kpis.tickets ?? null;
  }

  get horaActualizacion(): string {
    if (!this.dash) return '';
    return new Date(this.dash.generadoEn).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ── Gráficas (CSS puro) ────────────────────────────────────────────────────
  get serieMax(): number {
    return Math.max(1, ...(this.dash?.resumen.serie ?? []).map((s) => s.total));
  }

  get labelStep(): number {
    const n = this.dash?.resumen.serie.length ?? 0;
    return Math.max(1, Math.ceil(n / 9));
  }

  get capacitacionesDiaMax(): number {
    return Math.max(1, ...(this.dash?.capacitaciones.porDia ?? []).map((s) => s.count));
  }

  get solicitudesSerieMax(): number {
    return Math.max(1, ...(this.dash?.solicitudes.serie ?? []).map((s) => s.count));
  }

  get desconexionesDiaMax(): number {
    return Math.max(1, ...(this.dash?.conexiones.porDia ?? []).map((s) => s.count));
  }

  /** Próximas reuniones (a partir de hoy) para el historial de la card Reuniones. */
  get proximasReunionesList() {
    const ahora = Date.now();
    return (this.dash?.capacitaciones.tabla ?? [])
      .filter((m) => new Date(m.startDateTime).getTime() > ahora)
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
      .slice(0, 8);
  }

  barHeight(total: number): number {
    return (total / this.serieMax) * 100;
  }

  barHeightOf(total: number, max: number): number {
    return (total / max) * 100;
  }

  segPct(part: number, total: number): number {
    return total > 0 ? (part / total) * 100 : 0;
  }

  pctOf(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  fechaCorta(fecha: string): string {
    return fecha.slice(5).replace('-', '/');
  }

  proyectoColor(p: string): string {
    if (p === 'Sian365') return '#ce9b30';
    if (p === 'ControlAcademic') return '#1a3fa8';
    return '#94a3b8';
  }

  donutProyectoStyle(): string {
    return this.donutStyle(
      (this.dash?.resumen.proyectos ?? []).map((p) => ({
        color: this.proyectoColor(p.proyecto),
        value: p.total,
      })),
    );
  }

  donutTicketsStyle(): string {
    return this.donutStyle(
      this.ticketStatusEntries().map((e) => ({ color: e.color, value: e.value })),
    );
  }

  donutModalidadStyle(): string {
    const modal = this.dash?.capacitaciones.porModalidad ?? [];
    return this.donutStyle(
      modal.map((m) => ({
        color: m.clave === 'presencial' ? '#ce9b30' : '#1a3fa8',
        value: m.count,
      })),
    );
  }

  donutConexionesStyle(): string {
    const colores: Record<string, string> = {
      Disponible: '#16a34a',
      Ocupado: '#3b82f6',
      Reuniones: '#8b5cf6',
      Almuerzo: '#f59e0b',
      Inactivo: '#94a3b8',
    };
    return this.donutStyle(
      (this.dash?.conexiones.distribucion ?? []).map((d) => ({
        color: colores[d.estado] ?? '#94a3b8',
        value: d.minutos,
      })),
    );
  }

  // ── Helpers del rediseño del tab General ───────────────────────────────────
  get gestionCorreos() {
    return this.dash?.resumen.gestionCorreos ?? null;
  }

  /** La card "Conexión del asesor" solo aplica cuando el rango es "Hoy". */
  get esHoy(): boolean {
    return this.filtros.preset === 'hoy';
  }

  /** Máximo individual (asesor / IA) para escalar las barras pareadas. */
  get pareadasMax(): number {
    const serie = this.dash?.resumen.serie ?? [];
    return Math.max(1, ...serie.map((s) => Math.max(s.conAsesor ?? 0, s.ia ?? 0)));
  }

  /** Paleta minimalista compartida por los donuts (marca, acentos sobrios). */
  private readonly donutPalette = [
    '#1a3fa8', // azul marca
    '#ce9b30', // dorado marca
    '#16a34a', // verde
    '#8b5cf6', // violeta
    '#64748b', // gris
    '#ef4444', // rojo
    '#3b82f6', // azul claro
    '#f59e0b', // ámbar
  ];

  solicitudColor(i: number): string {
    return this.donutPalette[i % this.donutPalette.length];
  }

  donutSolicitudesStyle(): string {
    return this.donutStyle(
      (this.dash?.solicitudes.distribucion ?? []).map((d, i) => ({
        color: this.solicitudColor(i),
        value: d.count,
      })),
    );
  }

  /** Color para las categorías de gestión de correos (misma paleta minimalista). */
  gestionColor(i: number): string {
    return this.donutPalette[i % this.donutPalette.length];
  }

  donutGestionCorreosStyle(): string {
    return this.donutStyle(
      (this.gestionCorreos?.porCategoria ?? []).map((c, i) => ({
        color: this.gestionColor(i),
        value: c.count,
      })),
    );
  }

  /** Color de segmento de la barra de conexión por estado (backend en inglés). */
  estadoConexionColor(estado: string): string {
    const colores: Record<string, string> = {
      online: '#16a34a',
      busy: '#3b82f6',
      meeting: '#8b5cf6',
      almuerzo: '#f59e0b',
      offline: '#94a3b8',
    };
    return colores[estado] ?? '#94a3b8';
  }

  estadoConexionLabel(estado: string): string {
    const map: Record<string, string> = {
      online: 'Disponible',
      busy: 'Ocupado',
      meeting: 'Reuniones',
      almuerzo: 'Almuerzo',
      offline: 'Inactivo',
    };
    return map[estado] ?? estado;
  }

  /** Offset de Bogotá (UTC-5) en minutos y minutos por día (mismos de Advisors). */
  private static readonly OFFSET_BOGOTA_MIN = -5 * 60;
  private static readonly MINUTOS_DIA = 1440;

  /** Epoch ms del inicio (00:00 Bogotá) de una fecha YYYY-MM-DD. */
  private inicioDiaUtc(fecha: string): number {
    const [y, m, d] = fecha.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - MetricsComponent.OFFSET_BOGOTA_MIN * 60000;
  }

  /** Minutos desde 00:00 Bogotá para un instante ISO, dentro del día de la tarjeta. */
  private minutosEnDia(iso: string, dayStartMs: number): number {
    return (new Date(iso).getTime() - dayStartMs) / 60000;
  }

  /** Desplazamiento horizontal (left %) de un periodo en la barra del día (00:00–24:00 Bogotá). */
  periodoLeft(p: { desde: string }): number {
    const fecha = this.dash?.conexiones.barras?.fecha;
    if (!fecha) return 0;
    const ini = this.minutosEnDia(p.desde, this.inicioDiaUtc(fecha));
    return Math.min(100, Math.max(0, (ini / MetricsComponent.MINUTOS_DIA) * 100));
  }

  /** Ancho (width %) de un periodo en la barra del día (00:00–24:00 Bogotá). */
  periodoWidth(p: { desde: string; hasta: string | null }): number {
    const fecha = this.dash?.conexiones.barras?.fecha;
    if (!fecha) return 0;
    const dayStartMs = this.inicioDiaUtc(fecha);
    const ini = this.minutosEnDia(p.desde, dayStartMs);
    const fin = p.hasta
      ? this.minutosEnDia(p.hasta, dayStartMs)
      : Math.max(0, Math.min((Date.now() - dayStartMs) / 60000, MetricsComponent.MINUTOS_DIA));
    const width = ((fin - ini) / MetricsComponent.MINUTOS_DIA) * 100;
    return Math.min(100, Math.max(0, width));
  }

  /** Hora en hora Bogotá (HH:MM) para un instante ISO. */
  horaCorta(iso: string | null): string {
    if (!iso) return '—';
    const bog = new Date(new Date(iso).getTime() + MetricsComponent.OFFSET_BOGOTA_MIN * 60000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(bog.getUTCHours())}:${p(bog.getUTCMinutes())}`;
  }

  /** Jornada del día: primera actividad de inicio y última de fin entre los asesores. */
  get jornadaRango(): { inicio: string; fin: string } | null {
    const asesores = this.dash?.conexiones.barras?.asesores ?? [];
    let inicioIso: string | null = null;
    let finIso: string | null = null;
    for (const a of asesores) {
      for (const p of a.periodos) {
        if (p.desde && (!inicioIso || p.desde < inicioIso)) inicioIso = p.desde;
        if (p.hasta && (!finIso || p.hasta > finIso)) finIso = p.hasta;
      }
    }
    if (!inicioIso) return null;
    return { inicio: this.horaCorta(inicioIso), fin: this.horaCorta(finIso ?? inicioIso) };
  }

  private donutStyle(segs: { color: string; value: number }[]): string {
    const total = segs.reduce((s, x) => s + x.value, 0);
    if (!total) return 'conic-gradient(#e2e8f0 0 100%)';
    let acc = 0;
    const stops = segs.map((x) => {
      const pct = (x.value / total) * 100;
      const seg = `${x.color} ${acc}% ${acc + pct}%`;
      acc += pct;
      return seg;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  ticketStatusEntries(): TicketStatusEntry[] {
    const map: Record<string, { label: string; color: string }> = {
      open: { label: 'Abierto', color: '#3b82f6' },
      in_progress: { label: 'En proceso', color: '#8b5cf6' },
      on_hold: { label: 'En espera', color: '#f59e0b' },
      denied: { label: 'Denegado', color: '#ef4444' },
      resolved: { label: 'Resuelto', color: '#16a34a' },
      closed: { label: 'Cerrado', color: '#64748b' },
    };
    return (this.dash?.requerimientos.ticketsPorEstado ?? []).map((t) => ({
      key: t.clave,
      label: map[t.clave]?.label ?? t.clave,
      color: map[t.clave]?.color ?? '#94a3b8',
      value: t.count,
    }));
  }

  // ── Formato ────────────────────────────────────────────────────────────────
  fmtS(num: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO').format(num ?? 0);
  }

  fmtMin(min: number | null | undefined): string {
    if (min == null) return '—';
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    return `${min}m`;
  }

  fmtVar(v: number | null | undefined): string {
    if (v == null) return '—';
    if (v > 0) return `▲ ${v}%`;
    if (v < 0) return `▼ ${Math.abs(v)}%`;
    return '• 0%';
  }

  varClass(v: number | null | undefined): string {
    if (v == null || v === 0) return 'flat';
    return v > 0 ? 'up' : 'down';
  }

  fmtHora(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStars(avg: number | null): string[] {
    const a = avg ?? 0;
    return [1, 2, 3, 4, 5].map((i) => {
      if (i <= Math.floor(a)) return 'full';
      if (i === Math.ceil(a) && a % 1 >= 0.5) return 'half';
      return 'empty';
    });
  }

  isEmpty(list: unknown[] | null | undefined): boolean {
    return !list || list.length === 0;
  }

  colorPrioridad(p: string | null): string {
    switch (p) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'medium': return '#3b82f6';
      case 'low': return '#16a34a';
      default: return '#94a3b8';
    }
  }

  chipEstado(e: string): string {
    switch (e) {
      case 'open': return 'st-open';
      case 'in_progress': return 'st-progress';
      case 'on_hold': return 'st-hold';
      case 'resolved': return 'st-resolved';
      case 'closed': return 'st-closed';
      case 'denied': return 'st-denied';
      default: return '';
    }
  }

  estadoLabel(e: string): string {
    const map: Record<string, string> = {
      open: 'Abierto',
      in_progress: 'En proceso',
      on_hold: 'En espera',
      resolved: 'Resuelto',
      closed: 'Cerrado',
      denied: 'Denegado',
    };
    return map[e] ?? e;
  }
}
