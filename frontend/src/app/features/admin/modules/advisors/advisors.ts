import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService, PaginatedResponse, ConectividadResult, ConectividadAsesor, HistorialDia, ActividadAsesor, PeriodoActividad, JornadaDia } from '../../../../core/services/admin.service';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/models/user.model';
import { Subject, debounceTime, distinctUntilChanged, of, Observable, switchMap, tap, firstValueFrom } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { domToPng } from 'modern-screenshot';
import { ADVISORS_ICONS } from './advisors-icons';
import { AccesosModalComponent } from './components/accesos-modal/accesos-modal';

interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

type RoleFilter = 'todos' | 'advisor' | 'admin' | 'desarrollador' | 'interno' | 'superadmin';

type ConexionState = 'idle' | 'checking' | 'ok' | 'error';

type BarraSegmento = { pct: number; clase: string; minutos: number };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_STRENGTH_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const OFFSET_BOGOTA_MIN = -5 * 60;
const MINUTOS_DIA = 1440;
const CHECK_STEPS = [
  'Conectando con asesores…',
  'Consultando presencia…',
  'Consolidando resultados…',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha YYYY-MM-DD en hora Bogotá para un instante. */
export function fechaBogotaNow(d = new Date()): string {
  const bog = new Date(d.getTime() + OFFSET_BOGOTA_MIN * 60000);
  return `${bog.getUTCFullYear()}-${pad2(bog.getUTCMonth() + 1)}-${pad2(bog.getUTCDate())}`;
}

/** Epoch ms del inicio (00:00 Bogotá) de una fecha YYYY-MM-DD. */
export function inicioDiaUtc(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - OFFSET_BOGOTA_MIN * 60000;
}

/** "08:30" → minutos desde las 00:00 (533). */
function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

@Component({
  selector: 'app-advisors',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, AccesosModalComponent],
  templateUrl: './advisors.html',
  styleUrl: './advisors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvisorsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  readonly icons = ADVISORS_ICONS;

  advisors: User[] = [];
  total = 0;
  page = 1;
  limit = 5;
  pages = 0;
  search = '';
  loading = false;
  error = '';
  success = '';
  filtroRol: RoleFilter = 'todos';
  currentUserId: string | null = null;

  roleCounts = { todos: 0, advisor: 0, admin: 0, desarrollador: 0, interno: 0, superadmin: 0 };
  filterOptions = { activo: false, conectado: false };
  menuFiltrosAbierto = false;

  sort: SortState = { column: 'name', direction: 'asc' };

  // ── Conectividad ────────────────────────────────────
  conexionState: ConexionState = 'idle';
  conexionResultado: ConectividadResult | null = null;
  conexionError = '';
  lastUpdated: string | null = null;
  lastTestAt: string | null = null;
  checkProgress = 0;
  muestraModalConectividad = false;
  copiandoImagen = false;
  imgCopiada = false;

  // ── Historial del día (por asesor) ─────────────────────
  historialAdvisor: User | null = null;
  muestraHistorialAdvisor = false;
  historialDia: HistorialDia | null = null;
  historialCargando = false;
  historialError = '';
  fechaHistorial = fechaBogotaNow();
  histImgCopiada = false;
  histCopiandoImagen = false;

  // ── Modal de Accesos (módulos por perfil/usuario) ──────
  muestraAccesosModal = false;

  // ── Menú "Más opciones" por fila ────────────────────
  menuAbiertoId: string | null = null;

  // ── Modal crear/editar ────────────────────────────────
  formModal: { mode: 'create' | 'edit'; advisor: User | null } | null = null;
  form = { name: '', email: '', password: '', confirm: '', role: 'advisor' as 'admin' | 'advisor' | 'desarrollador' | 'interno' | 'superadmin' };
  formErrors: Record<string, string> = {};
  formBusy = false;
  showPasswordField = false;
  formPhoto: File | null = null;
  photoPreview: string | null = null;
  photoUploading = false;

  // ── Modal cambiar contraseña ──────────────────────────
  passwordModal: { advisor: User } | null = null;
  pwForm = { password: '', confirm: '' };
  pwErrors: Record<string, string> = {};
  pwBusy = false;

  // Estado por fila para acciones puntuales
  busyId: string | null = null;

  confirmAction: { type: 'delete'; advisor: User } | null = null;

  importing = false;
  exporting = false;
  importResult: {
    message: string;
    created: number;
    updated: number;
    errors: { row: number; email: string; error: string }[];
  } | null = null;

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pwFirstInput') pwFirstInput?: ElementRef<HTMLInputElement>;
  @ViewChild('formFirstName') formFirstName?: ElementRef<HTMLInputElement>;
  @ViewChild('snapshotRef') snapshotRef?: ElementRef<HTMLElement>;
  @ViewChild('historialSnapshotRef') historialSnapshotRef?: ElementRef<HTMLElement>;

  private searchSubject = new Subject<string>();
  private conexRefreshSubject = new Subject<void>();
  private historialRefreshSubject = new Subject<void>();
  private historialLoadSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private socket: SocketService,
    private auth: AuthService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUserId = this.auth.getUser()?.id ?? null;
    this.loadAdvisors();
    this.refreshConectividad();

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.loadAdvisors();
    });

    // Refresco silencioso de la tarjeta de conectividad cuando cambia el
    // estado de un asesor (evento en vivo del gateway).
    this.conexRefreshSubject.pipe(
      debounceTime(400),
      takeUntil(this.destroy$),
    ).subscribe(() => this.refreshConectividad());

    // Recarga el historial individual mostrado (cancela la petición anterior).
    this.historialLoadSubject.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        const asesorId = this.historialAdvisor?.id;
        if (!asesorId) return of(null);
        this.historialCargando = true;
        this.historialError = '';
        this.cdr.detectChanges();
        return this.adminService.getHistorialDia(this.fechaHistorial || undefined, asesorId).pipe(
          finalize(() => {
            this.historialCargando = false;
            this.cdr.detectChanges();
          }),
        );
      }),
    ).subscribe({
      next: (res) => {
        if (!res) return;
        this.historialDia = res;
        this.histImgCopiada = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.historialError = 'No se pudo cargar el historial.';
        this.cdr.detectChanges();
      },
    });

    // Refresco silencioso mientras el historial individual esté abierto.
    this.historialRefreshSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      if (this.muestraHistorialAdvisor) {
        this.cargarHistorial();
      }
    });

    this.socket.on<{ advisorId: string; name: string; status: string }>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const index = this.advisors.findIndex(a => a.id === data.advisorId);
        if (index !== -1) {
          this.advisors[index] = { ...this.advisors[index], status: data.status };
          this.advisors = [...this.advisors];
          this.cdr.detectChanges();
        }
        this.conexRefreshSubject.next();
        this.historialRefreshSubject.next();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click')
  cerrarMenusGlobal(): void {
    this.menuAbiertoId = null;
    this.menuFiltrosAbierto = false;
  }

  // ── Carga y filtros ───────────────────────────────────
  onSearch(value: string): void {
    this.search = value;
    this.searchSubject.next(value);
  }

  setFiltroRol(role: RoleFilter): void {
    if (this.filtroRol === role) return;
    this.filtroRol = role;
    this.page = 1;
    this.menuAbiertoId = null;
    this.loadAdvisors();
  }

  toggleFiltroExtra(key: 'activo' | 'conectado'): void {
    this.filterOptions[key] = !this.filterOptions[key];
    this.page = 1;
    this.loadAdvisors();
  }

  restablecerFiltros(): void {
    this.search = '';
    this.filtroRol = 'todos';
    this.filterOptions = { activo: false, conectado: false };
    this.page = 1;
    this.menuFiltrosAbierto = false;
    this.loadAdvisors();
  }

  get filtrosActivos(): boolean {
    return !!this.search || this.filtroRol !== 'todos' || this.filterOptions.activo || this.filterOptions.conectado;
  }

  limpiarFiltros(): void {
    this.restablecerFiltros();
  }

  loadAdvisors(): void {
    this.loading = true;
    this.error = '';
    this.adminService
      .getAdvisors(this.page, this.limit, this.search || undefined, this.filtroRol, {
        activo: this.filterOptions.activo || undefined,
        conectado: this.filterOptions.conectado || undefined,
      })
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res: PaginatedResponse<User>) => {
          this.advisors = res.data;
          this.total = res.total;
          this.page = res.page;
          this.pages = res.pages;
          if (res.counts) this.roleCounts = res.counts;
          this.sortAdvisors();
        },
        error: () => this.showError('Error cargando agentes'),
      });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.pages) return;
    this.page = p;
    this.loadAdvisors();
  }

  setSort(column: string): void {
    if (this.sort.column === column) {
      this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sort.column = column;
      this.sort.direction = 'asc';
    }
    this.sortAdvisors();
  }

  sortAdvisors(): void {
    this.advisors = [...this.advisors].sort((a, b) => {
      const aVal = (a as any)[this.sort.column] ?? '';
      const bVal = (b as any)[this.sort.column] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return this.sort.direction === 'asc' ? cmp : -cmp;
    });
    this.cdr.detectChanges();
  }

  sortIcon(column: string): string {
    if (this.sort.column !== column) return '↕';
    return this.sort.direction === 'asc' ? '↑' : '↓';
  }

  // ── Conectividad ──────────────────────────────────────
  refreshConectividad(): void {
    this.adminService.getConectividad().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.conexionResultado = res;
        this.lastUpdated = res.checkedAt;
        if (this.conexionState === 'idle') this.conexionState = 'ok';
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.conexionState === 'idle') {
          this.conexionState = 'error';
          this.cdr.detectChanges();
        }
      },
    });
  }

  async enviarConectividad(): Promise<void> {
    if (this.conexionState === 'checking') return;
    this.conexionState = 'checking';
    this.conexionError = '';
    this.imgCopiada = false;
    this.checkProgress = 0;
    this.cdr.detectChanges();

    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      this.checkProgress = Math.min(Math.round((elapsed / 3) * 92), 92);
      this.cdr.detectChanges();
    }, 120);

    try {
      const res = await firstValueFrom(this.adminService.getConectividad());
      clearInterval(timer);
      this.conexionResultado = res;
      this.lastTestAt = res.checkedAt;
      this.lastUpdated = res.checkedAt;
      this.checkProgress = 100;
      this.conexionState = 'ok';
      this.muestraModalConectividad = true;
    } catch {
      clearInterval(timer);
      this.checkProgress = 100;
      this.conexionState = 'error';
      this.conexionError = 'No se pudo ejecutar la prueba de conectividad.';
      this.muestraModalConectividad = true;
    }
    this.cdr.detectChanges();
  }

  get checkStepText(): string {
    const idx = Math.min(Math.floor(this.checkProgress / 31), CHECK_STEPS.length - 1);
    return CHECK_STEPS[idx];
  }

  abrirModalConectividad(forceCheck = false): void {
    if (this.conexionState === 'idle' || forceCheck) {
      this.enviarConectividad();
      return;
    }
    this.muestraModalConectividad = true;
    this.cdr.detectChanges();
  }

  cerrarModalConectividad(): void {
    this.muestraModalConectividad = false;
    this.imgCopiada = false;
    this.cdr.detectChanges();
  }

  // ── Historial del día (individual por asesor) ────────
  abrirHistorial(a: User): void {
    this.historialAdvisor = a;
    this.muestraHistorialAdvisor = true;
    this.historialDia = null;
    this.historialError = '';
    this.fechaHistorial = fechaBogotaNow();
    this.histImgCopiada = false;
    this.menuAbiertoId = null;
    this.cdr.detectChanges();
    this.cargarHistorial();
  }

  cerrarHistorial(): void {
    this.muestraHistorialAdvisor = false;
    this.historialAdvisor = null;
    this.historialDia = null;
    this.cdr.detectChanges();
  }

  // ── Accesos (módulos por perfil/usuario) ────────────────
  abrirAccesosModal(): void {
    this.muestraAccesosModal = true;
    this.menuAbiertoId = null;
    this.cdr.detectChanges();
  }

  cerrarAccesosModal(): void {
    this.muestraAccesosModal = false;
    this.cdr.detectChanges();
  }

  get actividadActual(): ActividadAsesor | null {
    return this.historialDia?.asesores[0] ?? null;
  }

  get historialAvatarInactivo(): boolean {
    return this.actividadActual?.resumen.estadoFinal === 'offline';
  }

  cargarHistorial(): void {
    this.historialLoadSubject.next();
  }

  onFechaHistorial(fecha: string): void {
    this.fechaHistorial = fecha;
    this.histImgCopiada = false;
    this.cargarHistorial();
  }

  /** Duración legible con horas, minutos y segundos (p. ej. 1h 12m 30s). */
  formatoDuracionPrecisa(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 1) return '0s';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (rm === 0) return `${h}h`;
    return rem && rm ? `${h}h ${rm}m ${rem}s` : `${h}h ${rm}m`;
  }

  /** Duración comprimida para la barra (horas y minutos). */
  formatoDuracionMin(min: number): string {
    if (min < 1) return '0m';
    const m = Math.round(min);
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  }

  formatHoraMin(iso?: string | null): string {
    if (!iso) return '—';
    const bog = new Date(new Date(iso).getTime() + OFFSET_BOGOTA_MIN * 60000);
    return `${pad2(bog.getUTCHours())}:${pad2(bog.getUTCMinutes())}:${pad2(bog.getUTCSeconds())}`;
  }

  /** Jornada laboral que el backend aplicó para la fecha consultada. */
  get historialJornada(): JornadaDia | null {
    return this.historialDia?.jornada ?? null;
  }

  get jornadaSlots(): { inicio: string; fin: string }[] {
    return this.historialJornada?.slots ?? [];
  }

  get jornadaActiva(): boolean {
    const j = this.historialJornada;
    return !!j?.activa && j.slots.length > 0;
  }

  /** Etiqueta de inicio de la barra (inicio de la jornada o 00:00). */
  get jornadaIniLabel(): string {
    const s = this.jornadaSlots;
    return s.length ? s[0].inicio : '00:00';
  }

  /** Etiqueta de fin de la barra (fin de la jornada o 24:00). */
  get jornadaFinLabel(): string {
    const s = this.jornadaSlots;
    if (!s.length) return '24:00';
    let fin = s[0].fin;
    for (const slot of s) {
      if (hhmmToMin(slot.fin) > hhmmToMin(fin)) fin = slot.fin;
    }
    return fin;
  }

  get jornadaRangoTexto(): string {
    return this.jornadaActiva
      ? `${this.jornadaIniLabel} – ${this.jornadaFinLabel}`
      : '';
  }

  /** Barra apilada de la actividad del asesor.
   * Con jornada activa la base es la jornada (primer inicio → último fin):
   * los huecos entre slots se marcan como "fuera de jornada". Sin jornada el
   * comportamiento es 00:00→24:00 (Bogotá). */
  barrasActividad(a: ActividadAsesor): BarraSegmento[] {
    const dayStartMs = inicioDiaUtc(this.historialDia?.fecha ?? this.fechaHistorial);
    const slots = [...this.jornadaSlots].sort(
      (x, y) => hhmmToMin(x.inicio) - hhmmToMin(y.inicio),
    );
    const iniMin = slots.length ? hhmmToMin(slots[0].inicio) : 0;
    const finMin = slots.length
      ? Math.max(...slots.map((s) => hhmmToMin(s.fin)))
      : MINUTOS_DIA;
    const baseMin = Math.max(1, finMin - iniMin);

    const datos: { ini: number; fin: number; clase: string; minutos: number }[] = [];

    for (const p of a.periodos) {
      const ini = (new Date(p.desde).getTime() - dayStartMs) / 60000;
      const fin = p.hasta
        ? (new Date(p.hasta).getTime() - dayStartMs) / 60000
        : Math.max(0, Math.min((Date.now() - dayStartMs) / 60000, MINUTOS_DIA));
      if (fin <= ini) continue;
      datos.push({
        ini,
        fin,
        clase: this.claseColorPeriodo(p),
        minutos: Math.round(fin - ini),
      });
    }

    // Huecos entre slots de la jornada (p. ej. 12:00–14:00 con jornada 08–12 y 14–18).
    for (let i = 1; i < slots.length; i++) {
      const ini = hhmmToMin(slots[i - 1].fin);
      const fin = hhmmToMin(slots[i].inicio);
      if (fin > ini) {
        datos.push({
          ini,
          fin,
          clase: 'bar-off-jornada',
          minutos: Math.round(fin - ini),
        });
      }
    }

    datos.sort((x, y) => x.ini - y.ini);

    const out: BarraSegmento[] = [];
    for (const d of datos) {
      const iniP = Math.min(100, Math.max(0, ((d.ini - iniMin) / baseMin) * 100));
      const finP = Math.min(100, Math.max(0, ((d.fin - iniMin) / baseMin) * 100));
      if (finP <= iniP + 0.01) continue;
      out.push({
        pct: finP - iniP,
        clase: d.clase,
        minutos: d.minutos,
      });
    }

    // Resto de la jornada sin actividad → tramo vacío.
    const total = out.reduce((s, x) => s + x.pct, 0);
    if (total < 99.99) {
      out.push({
        pct: 100 - total,
        clase: 'bar-empty',
        minutos: Math.round(((100 - total) / 100) * baseMin),
      });
    }
    return out;
  }

  claseColorPeriodo(p: PeriodoActividad): string {
    if (p.almuerzo) return 'bar-almuerzo';
    if (p.estado === 'online') return 'bar-disponible';
    if (p.estado === 'busy') return 'bar-ocupado';
    return 'bar-inactivo';
  }

  /** Suma exacta (ms) del tiempo por categoría, calculada desde los periodos. */
  resumenPorPeriodos(a: ActividadAsesor): {
    disponibleMs: number;
    ocupadoMs: number;
    almuerzoMs: number;
    inactivoMs: number;
  } {
    let disponibleMs = 0;
    let ocupadoMs = 0;
    let almuerzoMs = 0;
    let inactivoMs = 0;
    for (const p of a.periodos) {
      if (p.almuerzo) almuerzoMs += p.duracionMs;
      else if (p.estado === 'online') disponibleMs += p.duracionMs;
      else if (p.estado === 'busy') ocupadoMs += p.duracionMs;
      else inactivoMs += p.duracionMs;
    }
    return { disponibleMs, ocupadoMs, almuerzoMs, inactivoMs };
  }

  /** Solo avisa "sin actividad antes..." si realmente hay un hueco al inicio
   * (desde el inicio de la jornada si está configurada, si no desde las 00:00). */
  mostrarSinActividadAntes(a: ActividadAsesor): boolean {
    const t = a.resumen.sinActividadAntesDe;
    if (!t) return false;
    const primero = a.periodos[0];
    if (primero) {
      const dayStartMs = inicioDiaUtc(this.historialDia?.fecha ?? this.fechaHistorial);
      const desdeMin = Math.max(0, (new Date(primero.desde).getTime() - dayStartMs) / 60000);
      const umbral = this.jornadaActiva
        ? hhmmToMin(this.jornadaIniLabel) + 1
        : 10;
      if (desdeMin <= umbral) return false;
    }
    return true;
  }

  etiquetaPeriodo(p: PeriodoActividad): string {
    if (p.tipo === 'conexion') return 'Conectado';
    if (p.tipo === 'desconexion') return 'Desconectado';
    if (p.tipo === 'almuerzo_inicio') return 'Inicio de almuerzo';
    if (p.tipo === 'almuerzo_fin') return 'Fin de almuerzo';
    if (p.almuerzo) return 'Almuerzo';
    if (p.estado === 'busy') return 'Ocupado';
    if (p.estado === 'online') return 'Disponible';
    return 'Inactivo';
  }

  estadoActualLabel(a: ActividadAsesor): string {
    const r = a.resumen;
    if (!r.estadoFinal) return 'Sin actividad';
    if (r.estadoFinal === 'offline') return 'INACTIVO';
    return r.estadoFinal === 'busy' ? 'OCUPADO' : 'ACTIVO';
  }

  async copiarImagenHistorial(): Promise<void> {
    const el = this.historialSnapshotRef?.nativeElement;
    if (!el) return;
    this.histCopiandoImagen = true;
    this.histImgCopiada = false;
    this.cdr.detectChanges();
    try {
      await docFontsReady();
      const dataUrl = await domToPng(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        features: { removeControlCharacter: true },
      });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.histImgCopiada = true;
      this.notification.success('Listo', 'Historial copiado. Pégala en WhatsApp (Ctrl+V)');
    } catch {
      this.notification.error('Imagen', 'Tu navegador no permite copiar imágenes. Usa "Descargar imagen".');
      await this.descargarImagenHistorial();
    } finally {
      this.histCopiandoImagen = false;
      this.cdr.detectChanges();
    }
  }

  async descargarImagenHistorial(): Promise<void> {
    const el = this.historialSnapshotRef?.nativeElement;
    if (!el) return;
    try {
      await docFontsReady();
      const dataUrl = await domToPng(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        features: { removeControlCharacter: true },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const nombre = (this.historialAdvisor?.name ?? 'asesor')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      a.download = `historial-${this.fechaHistorial}-${nombre}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      this.notification.error('Imagen', 'No se pudo generar la imagen.');
    }
  }

  get conectadosLabel(): number {
    return this.conexionResultado?.conectados ?? 0;
  }

  get conectadosTotal(): number {
    return this.conexionResultado?.total ?? 0;
  }

  get conectadosPorcentaje(): number {
    return this.conexionResultado?.porcentaje ?? 0;
  }

  get conexionOptima(): boolean {
    return !!this.conexionResultado && this.conexionResultado.total > 0 && this.conexionResultado.conectados === this.conexionResultado.total;
  }

  get conexionSinConexion(): number {
    return this.conexionResultado ? this.conexionResultado.total - this.conexionResultado.conectados : 0;
  }

  getEstadoConAsesor(a: ConectividadAsesor): 'activo' | 'ocupado' | 'inactivo' {
    if (!a.conectado) return 'inactivo';
    return a.estado === 'busy' ? 'ocupado' : 'activo';
  }

  getEstadoConLabel(e: 'activo' | 'ocupado' | 'inactivo'): string {
    return { activo: 'ACTIVO', ocupado: 'OCUPADO', inactivo: 'INACTIVO' }[e];
  }

  async copiarImagen(): Promise<void> {
    const el = this.snapshotRef?.nativeElement;
    if (!el) return;
    this.copiandoImagen = true;
    this.imgCopiada = false;
    this.cdr.detectChanges();
    try {
      await docFontsReady();
      const dataUrl = await domToPng(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        features: { removeControlCharacter: true },
      });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.imgCopiada = true;
      this.notification.success('Listo', 'Imagen copiada. Pégala en WhatsApp (Ctrl+V)');
    } catch {
      this.notification.error('Imagen', 'Tu navegador no permite copiar imágenes. Usa "Descargar imagen".');
      await this.descargarImagen();
    } finally {
      this.copiandoImagen = false;
      this.cdr.detectChanges();
    }
  }

  async descargarImagen(): Promise<void> {
    const el = this.snapshotRef?.nativeElement;
    if (!el) return;
    try {
      await docFontsReady();
      const dataUrl = await domToPng(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        features: { removeControlCharacter: true },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `conectividad-${formatFileDate(new Date())}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      this.notification.error('Imagen', 'No se pudo generar la imagen.');
    }
  }

  formatFechaHora(iso?: string | null): string {
    return formatFechaHora(iso);
  }

  formatHoraSegundos(iso?: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const hh = String(bogota.getUTCHours()).padStart(2, '0');
    const mi = String(bogota.getUTCMinutes()).padStart(2, '0');
    const ss = String(bogota.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mi}:${ss}`;
  }

  // ── Menú "Más opciones" ───────────────────────────────
  toggleMenu(advisorId: string): void {
    this.menuAbiertoId = this.menuAbiertoId === advisorId ? null : advisorId;
    this.cdr.detectChanges();
  }

  isMenuOpen(advisorId: string): boolean {
    return this.menuAbiertoId === advisorId;
  }

  // ── Modal crear/editar ────────────────────────────────
  openCreate(): void {
    this.formModal = { mode: 'create', advisor: null };
    this.form = { name: '', email: '', password: '', confirm: '', role: 'advisor' };
    this.formErrors = {};
    this.formBusy = false;
    this.showPasswordField = true;
    this.error = '';
    this.formPhoto = null;
    this.photoPreview = null;
    this.cdr.detectChanges();
    setTimeout(() => this.formFirstName?.nativeElement.focus(), 0);
  }

  openEdit(advisor: User): void {
    this.formModal = { mode: 'edit', advisor };
    this.form = {
      name: advisor.name,
      email: advisor.email,
      password: '',
      confirm: '',
      role: advisor.role === 'admin' ? 'admin' : advisor.role === 'desarrollador' ? 'desarrollador' : advisor.role === 'interno' ? 'interno' : advisor.role === 'superadmin' ? 'superadmin' : 'advisor',
    };
    this.formErrors = {};
    this.formBusy = false;
    this.showPasswordField = false;
    this.error = '';
    this.formPhoto = null;
    this.photoPreview = advisor.profilePhotoUrl || null;
    this.cdr.detectChanges();
    setTimeout(() => this.formFirstName?.nativeElement.focus(), 0);
  }

  closeForm(): void {
    this.formModal = null;
    this.formPhoto = null;
    this.photoPreview = null;
  }

  validateForm(): boolean {
    this.formErrors = {};

    if (!this.form.name || this.form.name.trim().length < 2) {
      this.formErrors['name'] = 'El nombre debe tener al menos 2 caracteres';
    }

    if (!this.form.email || !EMAIL_REGEX.test(this.form.email)) {
      this.formErrors['email'] = 'Correo electrónico inválido';
    }

    const isCreate = this.formModal?.mode === 'create';
    const hasPassword = !!this.form.password;
    if (isCreate && !hasPassword) {
      this.formErrors['password'] = 'La contraseña es obligatoria';
    } else if (hasPassword && this.form.password.length < 8) {
      this.formErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    } else if (hasPassword && !PASSWORD_STRENGTH_RE.test(this.form.password)) {
      this.formErrors['password'] =
        'Debe incluir mayúscula, minúscula, número y carácter especial';
    }
    if (hasPassword && this.form.password !== this.form.confirm) {
      this.formErrors['confirm'] = 'Las contraseñas no coinciden';
    }

    this.cdr.detectChanges();
    return Object.keys(this.formErrors).length === 0;
  }

  save(): void {
    if (!this.validateForm()) return;

    this.formBusy = true;
    this.error = '';
    const name = this.form.name.trim();
    const email = this.form.email.trim();
    const role = this.form.role;

    let stream: Observable<any>;
    let targetId = this.formModal?.advisor?.id ?? '';

    if (this.formModal?.mode === 'create') {
      stream = this.adminService
        .createAdvisor(name, email, this.form.password, role)
        .pipe(tap((u: User) => { targetId = u.id; }));
    } else {
      stream = this.adminService.updateAdvisor(targetId, { name, email, role }).pipe(
        switchMap(() =>
          this.form.password
            ? this.adminService.updatePassword(targetId, this.form.password)
            : of(null),
        ),
      );
    }

    stream.pipe(
      switchMap(() => {
        if (!this.formPhoto || !targetId) return of(null);
        return this.adminService.uploadPhoto(targetId, this.formPhoto);
      }),
      finalize(() => { this.formBusy = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        const action = this.formModal?.mode === 'create' ? 'creado' : 'actualizado';
        this.showSuccess(`Agente ${action}`);
        this.closeForm();
        this.loadAdvisors();
      },
      error: (err) => this.handleSaveError(err),
    });
  }

  private handleSaveError(err: any): void {
    const msg = err?.error?.message ?? err?.message ?? 'Error al guardar';
    if (typeof msg === 'string' && msg.toLowerCase().includes('email')) {
      this.formErrors['email'] = msg;
    } else {
      this.showError(msg);
    }
    this.cdr.detectChanges();
  }

  // ── Foto de perfil ─────────────────────────────────────
  onPhotoClick(): void {
    this.photoInput?.nativeElement.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showError('Solo se permiten imágenes');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showError('La imagen supera el límite de 5MB');
      return;
    }
    this.formPhoto = file;
    this.photoPreview = URL.createObjectURL(file);
    this.cdr.detectChanges();
  }

  removePhoto(): void {
    const advisor = this.formModal?.advisor;
    if (this.formModal?.mode !== 'edit' || !advisor) return;
    this.photoUploading = true;
    this.adminService
      .deletePhoto(advisor.id)
      .pipe(finalize(() => { this.photoUploading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.photoPreview = null;
          this.formPhoto = null;
          this.notification.success('Foto', 'Foto eliminada');
        },
        error: () => this.showError('Error al eliminar la foto'),
      });
  }

  // ── Modal cambiar contraseña ───────────────────────────
  openPasswordModal(advisor: User): void {
    this.passwordModal = { advisor };
    this.pwForm = { password: '', confirm: '' };
    this.pwErrors = {};
    this.pwBusy = false;
    this.cdr.detectChanges();
    setTimeout(() => this.pwFirstInput?.nativeElement.focus(), 0);
  }

  closePasswordModal(): void {
    this.passwordModal = null;
  }

  savePassword(): void {
    if (!this.passwordModal) return;
    this.pwErrors = {};

    if (!this.pwForm.password || this.pwForm.password.length < 8) {
      this.pwErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    } else if (!PASSWORD_STRENGTH_RE.test(this.pwForm.password)) {
      this.pwErrors['password'] =
        'Debe incluir mayúscula, minúscula, número y carácter especial';
    }
    if (this.pwForm.password !== this.pwForm.confirm) {
      this.pwErrors['confirm'] = 'Las contraseñas no coinciden';
    }
    if (Object.keys(this.pwErrors).length > 0) {
      this.cdr.detectChanges();
      return;
    }

    this.pwBusy = true;
    this.adminService
      .updatePassword(this.passwordModal.advisor.id, this.pwForm.password)
      .pipe(finalize(() => { this.pwBusy = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.pwForm = { password: '', confirm: '' };
          this.notification.success('Contraseña', 'Contraseña actualizada');
          this.showSuccess('Contraseña actualizada');
          this.loadAdvisors();
          this.closePasswordModal();
        },
        error: (err) => {
          this.pwErrors['password'] =
            err?.error?.message ?? 'Error al actualizar contraseña';
        },
      });
  }

  passwordStrength(pw: string): number {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score += 25;
    if (/[a-z]/.test(pw)) score += 15;
    if (/[A-Z]/.test(pw)) score += 15;
    if (/\d/.test(pw)) score += 15;
    if (/[^A-Za-z0-9]/.test(pw)) score += 15;
    if (pw.length >= 12) score += 15;
    return Math.min(score, 100);
  }

  strengthColor(score: number): string {
    if (score === 0) return '#e2e8f0';
    if (score < 40) return '#ef4444';
    if (score < 70) return '#f59e0b';
    return '#22c55e';
  }

  // ── Importar / exportar ────────────────────────────────
  onImportClick(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      this.showError('Formato no válido. Sube un archivo Excel (.xlsx o .xls)');
      return;
    }

    this.importing = true;
    this.importResult = null;
    this.error = '';
    this.adminService.importUsers(file).pipe(
      finalize(() => { this.importing = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.importResult = res;
        this.notification.success('Importación', res.message);
        this.loadAdvisors();
      },
      error: (err) => this.showError(err.error?.message ?? 'Error al importar agentes'),
    });
  }

  onExportExcel(): void {
    this.exporting = true;
    this.error = '';
    this.adminService.exportUsers().pipe(
      finalize(() => { this.exporting = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agentes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.showError('Error al exportar agentes'),
    });
  }

  // ── Acciones por fila ──────────────────────────────────
  toggle(advisor: User): void {
    this.menuAbiertoId = null;
    if (this.busyId) return;
    this.busyId = advisor.id;
    this.adminService.toggleAdvisor(advisor.id).pipe(
      finalize(() => { this.busyId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => this.loadAdvisors(),
      error: (err) => this.showError(err?.error?.message ?? 'Error al cambiar estado'),
    });
  }

  confirmRemove(advisor: User): void {
    this.menuAbiertoId = null;
    this.confirmAction = { type: 'delete', advisor };
    this.cdr.detectChanges();
  }

  cancelConfirm(): void {
    this.confirmAction = null;
    this.cdr.detectChanges();
  }

  executeConfirm(): void {
    if (!this.confirmAction || this.busyId) return;
    const { advisor } = this.confirmAction;
    this.confirmAction = null;
    this.busyId = advisor.id;

    this.adminService.removeAdvisor(advisor.id).pipe(
      finalize(() => { this.busyId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.showSuccess('Agente eliminado');
        if (this.advisors.length === 1 && this.page > 1) {
          this.page--;
        }
        this.loadAdvisors();
      },
      error: (err) => this.showError(err?.error?.message ?? 'Error al eliminar'),
    });
  }

  // ── Helpers de vista ───────────────────────────────────
  isCurrentUser(id: string): boolean {
    return id === this.currentUserId;
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = { online: 'Disponible', busy: 'Ocupado', offline: 'Inactivo' };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  getRoleLabel(role?: string): string {
    return role === 'admin' ? 'Administrador' : role === 'desarrollador' ? 'Desarrollador' : role === 'interno' ? 'Interno' : role === 'superadmin' ? 'Superadmin' : 'Agente';
  }

  formatDate(date?: string | null): string {
    if (!date) return '-';
    const d = new Date(date);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const dd = String(bogota.getUTCDate()).padStart(2, '0');
    const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = bogota.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private showSuccess(msg: string): void {
    this.success = msg;
    this.notification.success('Éxito', msg);
    setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3000);
    this.cdr.detectChanges();
  }

  private showError(msg: string): void {
    this.error = msg;
    this.notification.error('Error', msg);
    this.cdr.detectChanges();
  }
}

// ── Helpers de módulo ────────────────────────────────────
async function docFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }
}

function formatFechaHora(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const bogota = new Date(d.getTime() - 5 * 3600000);
  const dd = String(bogota.getUTCDate()).padStart(2, '0');
  const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = bogota.getUTCFullYear();
  const hh = String(bogota.getUTCHours()).padStart(2, '0');
  const mi = String(bogota.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} - ${hh}:${mi}`;
}

function formatFileDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}${mm}${dd}`;
}