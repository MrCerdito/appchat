import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import {
  AdminService,
  HcResumen,
  HcMapaCalor,
  HcMetricaMapa,
  HcIncidentesRes,
  HcIncidente,
  HcIncidenteEstado,
  HcEventosRes,
  HcEventosFiltros,
} from '../../../../core/services/admin.service';
import { User } from '../../../../core/models/user.model';
import { trackById } from '../../../../shared/utils/track-by';

type Pestana = 'resumen' | 'asesores' | 'periodo' | 'incidentes' | 'historial';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HORAS = Array.from({ length: 24 }, (_, i) => i);
const LIMITE_EVENTOS = 15;

@Component({
  selector: 'app-conectividad',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conectividad.html',
  styleUrl: './conectividad.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConectividadComponent implements OnInit {
  protected readonly trackById = trackById;
  protected readonly DIAS = DIAS;
  protected readonly HORAS = HORAS;

  pestana: Pestana = 'resumen';
  cargando = false;
  error = '';

  // Filtros globales (rango + asesor).
  desde = '';
  hasta = '';
  asesorId = '';
  asesores: User[] = [];
  asesoresError = false;

  // Datos por pestaña.
  resumen?: HcResumen;
  mapa?: HcMapaCalor;
  metricaMapa: HcMetricaMapa = 'desconexiones';
  incidentes?: HcIncidentesRes;
  eventos?: HcEventosRes;

  // Pestaña 4: revisión de incidentes.
  revAbierta = '';
  revEstado: HcIncidenteEstado = 'en_revision';
  revComentario = '';
  revGuardando = false;

  // Pestaña 5: historial paginado con filtros.
  evFiltroTipo = '';
  evFiltroCausa = '';
  evFiltroEstado = '';
  evFiltroDurMin?: number;
  evPagina = 1;
  evOrden: 'asc' | 'desc' = 'desc';
  evExportando = false;

  private destroy$ = new Subject<void>();

  constructor(
    private admin: AdminService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const hoy = new Date();
    const ini = new Date();
    ini.setDate(ini.getDate() - 29);
    this.hasta = this.diaIso(hoy);
    this.desde = this.diaIso(ini);
    this.cargarAsesores();
    this.cargarPestana();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Desplegable de asesores (top 100 activos; el DTO del backend limita a 100). */
  private cargarAsesores(): void {
    this.admin
      .getAdvisors(1, 100, undefined, 'todos', { activo: true })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.asesoresError = true;
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.asesores = res?.data ?? [];
        this.cdr.markForCheck();
      });
  }

  cambiarPestana(t: Pestana): void {
    if (this.pestana === t) return;
    this.pestana = t;
    this.cargarPestana();
  }

  /** Carga lo que la pestaña aún no tenga (o recarga el filtro global). */
  cargarPestana(): void {
    if (this.pestana === 'resumen' || this.pestana === 'asesores') {
      this.cargarResumen();
    } else if (this.pestana === 'periodo') {
      this.cargarMapa();
    } else if (this.pestana === 'incidentes') {
      this.cargarIncidentes();
    } else {
      this.cargarEventos();
    }
  }

  aplicarFiltros(): void {
    this.evPagina = 1;
    this.revAbierta = '';
    this.cargarPestana();
  }

  private filtros() {
    return { desde: this.desde, hasta: this.hasta, asesorId: this.asesorId };
  }

  private cargarResumen(): void {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    this.admin
      .getConectividadResumen(this.filtros())
      .pipe(
        takeUntil(this.destroy$),
        catchError((e) => {
          this.error = e?.error?.message ?? 'No se pudo cargar el resumen.';
          this.cargando = false;
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.resumen = res ?? undefined;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  private cargarMapa(): void {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    this.admin
      .getConectividadMapa(this.filtros(), this.metricaMapa)
      .pipe(
        takeUntil(this.destroy$),
        catchError((e) => {
          this.error = e?.error?.message ?? 'No se pudo cargar el mapa de calor.';
          this.cargando = false;
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.mapa = res ?? undefined;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  cambiarMetrica(): void {
    this.cargarMapa();
  }

  private cargarIncidentes(): void {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    this.admin
      .getConectividadIncidentes(this.filtros(), { page: 1, limit: 50 })
      .pipe(
        takeUntil(this.destroy$),
        catchError((e) => {
          this.error = e?.error?.message ?? 'No se pudieron cargar los incidentes.';
          this.cargando = false;
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.incidentes = res ?? undefined;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  /** Abre/cierra el formulario de revisión de un incidente. */
  abrirRevision(inc: HcIncidente): void {
    if (this.revAbierta === inc.clave) {
      this.revAbierta = '';
      return;
    }
    this.revAbierta = inc.clave;
    this.revEstado = inc.estado === 'nuevo' ? 'en_revision' : inc.estado;
    this.revComentario = inc.comentario ?? '';
    this.cdr.markForCheck();
  }

  guardarRevision(inc: HcIncidente): void {
    this.revGuardando = true;
    this.cdr.markForCheck();
    this.admin
      .revisarIncidente(inc.userId, inc.clave, {
        estado: this.revEstado,
        comentario: this.revComentario || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.revGuardando = false;
          this.error = 'No se pudo guardar la revisión.';
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((ok) => {
        this.revGuardando = false;
        if (ok) {
          inc.estado = ok.estado;
          inc.comentario = ok.comentario;
          inc.responsableId = ok.responsableId;
          inc.revisadoEn = ok.revisadoEn;
          this.revAbierta = '';
        }
        this.cdr.markForCheck();
      });
  }

  private cargarEventos(): void {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    const f: HcEventosFiltros = {
      ...this.filtros(),
      tipo: this.evFiltroTipo || undefined,
      causa: this.evFiltroCausa || undefined,
      estado: this.evFiltroEstado || undefined,
      durMin: this.evFiltroDurMin,
      page: this.evPagina,
      limit: LIMITE_EVENTOS,
      orden: this.evOrden,
    };
    this.admin
      .getConectividadEventos(f)
      .pipe(
        takeUntil(this.destroy$),
        catchError((e) => {
          this.error = e?.error?.message ?? 'No se pudo cargar el historial.';
          this.cargando = false;
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.eventos = res ?? undefined;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  evFiltrar(): void {
    this.evPagina = 1;
    this.cargarEventos();
  }

  evPaginaSig(): void {
    if (!this.eventos || this.evPagina >= this.eventos.pages) return;
    this.evPagina += 1;
    this.cargarEventos();
  }

  evPaginaAnt(): void {
    if (this.evPagina <= 1) return;
    this.evPagina -= 1;
    this.cargarEventos();
  }

  evCambiarOrden(): void {
    this.evOrden = this.evOrden === 'desc' ? 'asc' : 'desc';
    this.cargarEventos();
  }

  exportarCsv(): void {
    this.evExportando = true;
    this.cdr.markForCheck();
    this.admin
      .exportConectividadCsv({
        ...this.filtros(),
        tipo: this.evFiltroTipo || undefined,
        causa: this.evFiltroCausa || undefined,
        estado: this.evFiltroEstado || undefined,
        durMin: this.evFiltroDurMin,
        orden: this.evOrden,
      })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.evExportando = false;
          this.error = 'No se pudo generar el CSV.';
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((blob) => {
        this.evExportando = false;
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conectividad-${this.desde}-${this.hasta}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.cdr.markForCheck();
      });
  }

  // ── Utilidades de presentación ────────────────────────────────────────────

  /** Minutos → "X h Y min" (o "Y min"). */
  fmtMin(min: number | null | undefined): string {
    if (min === null || min === undefined || Number.isNaN(min)) return '—';
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  /** Minutos de duración → texto (usado con duracionMs/60000). */
  fmtPct(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return 'Sin datos';
    return `${Math.round(v)}%`;
  }

  /** Δ puntos porcentuales → "+3 pp" / "−2 pp" / "—". */
  fmtDelta(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const r = Math.round(v);
    if (r === 0) return '±0 pp';
    return `${r > 0 ? '+' : '−'}${Math.abs(r)} pp`;
  }

  deltaClase(v: number | null | undefined): string {
    if (v === null || v === undefined || v === 0) return 'hc-neu';
    return v > 0 ? 'hc-pos' : 'hc-neg';
  }

  /** ISO o fecha → "dd MMM" (hora Bogotá). */
  fecha(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  hora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  duracion(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const r = min % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  /** Causa → etiqueta legible (evita afirmar causas técnicas no probadas). */
  causaInfo(causa: string | null): { etiqueta: string; certeza: string } | null {
    const map: Record<string, { etiqueta: string; certeza: string }> = {
      manual: { etiqueta: 'Cambio manual explícito', certeza: 'alta' },
      timeout: { etiqueta: 'Comunicación interrumpida (heartbeat)', certeza: 'media' },
      disconnect: { etiqueta: 'Cliente desconectado (socket cerrado)', certeza: 'media' },
      connect: { etiqueta: 'Reconexión', certeza: 'alta' },
      sistema: { etiqueta: 'Sistema / registro incompleto', certeza: 'baja' },
    };
    if (!causa) return null;
    return map[causa] ?? { etiqueta: causa, certeza: 'baja' };
  }

  estadoEtiqueta(e: string): string {
    const map: Record<string, string> = {
      nuevo: 'Nuevo',
      en_revision: 'En revisión',
      confirmado: 'Confirmado',
      descartado: 'Descartado',
    };
    return map[e] ?? e;
  }

  tipoEtiqueta(t: string): string {
    const map: Record<string, string> = {
      corte: 'Corte prolongado',
      rafaga: 'Ráfaga de desconexiones',
      dia: 'Día inestable',
      conexion: 'Conexión',
      desconexion: 'Desconexión',
      status: 'Cambio de estado',
      almuerzo_inicio: 'Inicio de almuerzo',
      almuerzo_fin: 'Fin de almuerzo',
    };
    return map[t] ?? t;
  }

  bucketEtiqueta(b: string): string {
    const map: Record<string, string> = {
      online: 'Disponible',
      busy: 'Ocupado',
      meeting: 'Reunión',
      almuerzo: 'Almuerzo',
      offline: 'Sin conexión',
    };
    return map[b] ?? b;
  }

  // ── Mapa de calor ─────────────────────────────────────────────────────────

  /** Celda del mapa para (día, hora) o undefined si no hay datos. */
  celdaMapa(dia: number, hora: number) {
    return this.mapa?.items.find((c) => c.dia === dia && c.hora === hora);
  }

  /** Escala 0..4 de intensidad para el color de la celda. */
  escalaMapa(valor: number | null | undefined, max: number): number {
    if (valor === null || valor === undefined || max <= 0) return 0;
    if (valor <= 0) return 0;
    const r = valor / max;
    if (r <= 0.25) return 1;
    if (r <= 0.5) return 2;
    if (r <= 0.75) return 3;
    return 4;
  }

  get maxMapa(): number {
    if (!this.mapa) return 0;
    if (this.metricaMapa === 'disponibilidad') return 100;
    const vals = this.mapa.items
      .map((c) => c.valor ?? 0)
      .filter((v) => v > 0);
    return vals.length ? Math.max(...vals) : 0;
  }

  get metricaMapaLabel(): string {
    const map: Record<HcMetricaMapa, string> = {
      desconexiones: 'Desconexiones',
      minutos: 'Minutos caídos',
      afectados: 'Asesores afectados',
      disponibilidad: 'Disponibilidad %',
    };
    return map[this.metricaMapa];
  }

  // ── Getters de conveniencia ───────────────────────────────────────────────

  get kpis() {
    return this.resumen?.kpis;
  }

  get tendenciaTotal(): number {
    if (!this.resumen) return 0;
    return this.resumen.tendencia.reduce((s, d) => s + d.desconexiones, 0);
  }

  /** Fila del ranking con la mejor disponibilidad (con datos suficientes). */
  get rankingTop() {
    const con = this.resumen?.ranking.filter((r) => r.disponibilidadPct !== null) ?? [];
    if (!con.length) return null;
    return [...con].sort((a, b) => (b.disponibilidadPct ?? 0) - (a.disponibilidadPct ?? 0))[0];
  }

  diaIso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
