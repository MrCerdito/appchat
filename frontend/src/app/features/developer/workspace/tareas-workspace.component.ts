import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { TareaService } from '../../../core/services/tarea.service';
import { ModuloService } from '../../../core/services/modulo.service';
import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  Tarea,
  TareaStatus,
  TAREA_STATUS_META,
  TAREA_STATUSES,
  TAREA_PRIORIDADES,
  TareaEstadisticas,
} from '../../../core/models/tarea.model';
import { User } from '../../../core/models/user.model';
import { TareaCardComponent } from './tarea-card/tarea-card.component';
import { TareaFormModalComponent } from './tarea-form-modal/tarea-form-modal.component';
import { TareaDetalleModalComponent } from './tarea-detalle-modal/tarea-detalle-modal.component';

type Vista = 'panel' | 'kanban' | 'lista' | 'estructura';

interface FilaArbol {
  tarea: Tarea;
  profundidad: number;
  tieneHijos: boolean;
  ruta: string;
}

interface Filtros {
  q: string;
  status: TareaStatus[];
  prioridad: string[];
  asignadoA: string;
  soloSinTicket: boolean;
}

@Component({
  selector: 'app-tareas-workspace',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DragDropModule,
    TareaCardComponent,
    TareaFormModalComponent,
    TareaDetalleModalComponent,
  ],
  templateUrl: './tareas-workspace.html',
  styleUrl: './tareas-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TareasWorkspaceComponent implements OnInit, OnDestroy {
  readonly statusMeta = TAREA_STATUS_META;
  readonly statusKeys = TAREA_STATUSES;
  readonly prioridadKeys = TAREA_PRIORIDADES;

  /** Ids de las columnas del kanban, para conectarlas entre si con el CDK. */
  readonly dropIds = TAREA_STATUSES.map((s) => `col-${s}`);

  vista: Vista = 'panel';
  tareas: Tarea[] = [];
  // `Partial`: el backend solo devuelve claves con conteo, asi que un estado sin
// tareas llega ausente y el `?? 0` del template es necesario de verdad.
resumen: Partial<Record<string, number>> = {};
  total = 0;
  page = 1;
  readonly limite = 60;
  loading = true;
  error = '';
  esAdmin = false;

  /** Ventana del grafico de actividad. El backend la acota a 7/14/30. */
  diasGrafico = 7;
  readonly opcionesDias = [7, 14, 30];

  /** Ruta del filtro "Responsable": mismo endpoint que usa el formulario. */
  responsables: User[] = [];

  /** Menú de filtro abierto (`status`, `prioridad`, ...). Uno a la vez. */
  menu: string | null = null;

  filtros: Filtros = {
    q: '',
    status: [],
    prioridad: [],
    asignadoA: '',
    soloSinTicket: false,
  };

  /** Panel: los agregados llegan del backend, no se derivan de la pagina. */
  stats: TareaEstadisticas | null = null;

  /** Drag & drop del kanban. */
  dragId: string | null = null;
  /** Ramas cerradas en la vista Estructura; por defecto el árbol se ve abierto. */
  ramasCerradas = new Set<string>();
  private estructuraInicializada = false;
  tareaAMover: Tarea | null = null;
  rutaTareaAMover = '';
  destinos: Array<{ id: string; ruta: string }> = [];
  destinoSeleccionado = '';
  cargandoDestinos = false;
  guardandoMovimiento = false;
  filtroEstructura = '';

  /** Modales. */
  detalleId: string | null = null;
  /** Se incrementa al guardar para que el detalle abierto recargue su arbol. */
  detalleRefresco = 0;
  formAbierto = false;
  formTarea: Tarea | null = null;
  formPadreId: string | null = null;
  formPadreRuta = '';
  formTicketId: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly tareasService: TareaService,
    private readonly moduloService: ModuloService,
    private readonly socket: SocketService,
    private readonly auth: AuthService,
    private readonly notif: NotificationService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.esAdmin = ['admin', 'superadmin'].includes(this.auth.getUser()?.role ?? '');

    // La campana navega aqui con ?tarea=<id> para abrir el detalle directo.
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      const id = p.get('tarea');
      if (id) this.detalleId = id;
      this.cdr.markForCheck();
    });

    this.cargar();
    this.escucharEventos();
    this.cargarResponsables();
  }

  /**
   * Los responsables del filtro. Si el endpoint falla se sigue mostrando el
   * resto del dashboard: no es un dato critico.
   */
  private cargarResponsables(): void {
    this.moduloService
      .getDesarrolladores()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rs) => {
          this.responsables = (rs ?? []).filter((r) => r.status === 'activo');
          this.cdr.markForCheck();
        },
        error: () => {
          this.responsables = [];
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * El tablero se refresca solo cuando alguien de la sala cambia algo. El
   * `tarea:comentario` NO dispara recarga: un comentario no cambia la lista, y
   * recargarla cerraria el modal que el usuario esta leyendo.
   */
  private escucharEventos(): void {
    const recargar = () => this.cargar(false);
    for (const ev of [
      'tarea:created',
      'tarea:updated',
      'tarea:deleted',
      'tareas:reordenadas',
    ]) {
      this.socket.on(ev).pipe(takeUntil(this.destroy$)).subscribe(recargar);
    }
  }

  // ─────────────────────────────── DATOS ───────────────────────────────

  cargar(spinner = true): void {
    if (spinner) this.loading = true;
    this.error = '';

    const query: any = {
      vista: this.vista === 'lista' ? 'lista' : this.vista === 'kanban' ? 'kanban' : this.vista === 'estructura' ? 'arbol' : 'panel',
      page: this.page,
      limit: this.limite,
      q: this.filtros.q || undefined,
      status: this.filtros.status.length ? this.filtros.status : undefined,
      prioridad: this.filtros.prioridad.length ? this.filtros.prioridad : undefined,
      asignadoA: this.filtros.asignadoA || undefined,
      soloSinTicket: this.filtros.soloSinTicket || undefined,
    };

    // El kanban y la lista trabajan sobre tareas raiz: los subarboles se
    // gestionan dentro del detalle, no como filas sueltas del tablero.
    if (this.vista === 'kanban') query.soloRaiz = true;

    this.tareasService
      .findAll(query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.tareas = r.items;
          if (this.vista === 'estructura' && !this.estructuraInicializada) {
            for (const raiz of this.tareas) {
              for (const hijo of raiz.hijos ?? []) {
                if (hijo.hijos?.length) this.ramasCerradas.add(hijo.id);
              }
            }
            this.estructuraInicializada = true;
          }
          this.resumen = r.resumen ?? {};
          this.total = r.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.loading = false;
          this.error = e?.error?.message ?? 'No se pudieron cargar las tareas';
          this.cdr.markForCheck();
        },
      });

    if (this.vista === 'panel') this.cargarStats();
  }

  private cargarStats(): void {
    this.tareasService
      .estadisticas(this.diasGrafico)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.stats = s;
          this.cdr.markForCheck();
        },
        error: () => {
          this.stats = null;
          this.cdr.markForCheck();
        },
      });
  }

  setDiasGrafico(d: number): void {
    if (this.diasGrafico === d) return;
    this.diasGrafico = d;
    this.cargarStats();
  }

  // ─────────────────────────────── VISTAS ───────────────────────────────

  setVista(v: Vista): void {
    if (this.vista === v) return;
    this.vista = v;
    this.page = 1;
    this.cargar();
  }

  tareasDe(status: TareaStatus): Tarea[] {
    return this.tareas.filter((t) => t.status === status);
  }

  /** Filas planas para la tabla jerárquica, respetando ramas contraídas. */
  get filasEstructura(): FilaArbol[] {
    const filas: FilaArbol[] = [];
    const termino = this.filtroEstructura.trim().toLocaleLowerCase();
    const coincide = (t: Tarea): boolean =>
      `${t.titulo} ${t.codigo} ${t.descripcion ?? ''}`.toLocaleLowerCase().includes(termino);
    const coincideEnArbol = (t: Tarea): boolean => coincide(t) || (t.hijos ?? []).some(coincideEnArbol);
    const incluirVisible = (t: Tarea, nivel: number, ruta: string): void => {
      const hijos = t.hijos ?? [];
      if (termino && !coincideEnArbol(t)) return;
      filas.push({ tarea: t, profundidad: nivel, tieneHijos: hijos.length > 0, ruta });
      if (!this.ramasCerradas.has(t.id) || !!termino) {
        for (const h of hijos) incluirVisible(h, nivel + 1, `${ruta} › ${h.titulo}`);
      }
    };
    for (const raiz of this.tareas) incluirVisible(raiz, 0, raiz.titulo);
    return filas;
  }

  toggleRama(tarea: Tarea): void {
    if (this.ramasCerradas.has(tarea.id)) this.ramasCerradas.delete(tarea.id);
    else this.ramasCerradas.add(tarea.id);
    this.cdr.markForCheck();
  }

  progresoArbol(tarea: Tarea): { total: number; completadas: number; porcentaje: number } {
    let total = 0;
    let completadas = 0;
    const contar = (t: Tarea): void => {
      for (const h of t.hijos ?? []) {
        total++;
        if (h.status === 'completada') completadas++;
        contar(h);
      }
    };
    contar(tarea);
    return { total, completadas, porcentaje: total ? Math.round((completadas / total) * 100) : 0 };
  }

  expandirTodo(expandir: boolean): void {
    this.ramasCerradas = expandir
      ? new Set<string>()
      : new Set(this.filasEstructura.filter((f) => f.tieneHijos).map((f) => f.tarea.id));
    this.cdr.markForCheck();
  }

  abrirMover(tarea: Tarea, ruta = tarea.titulo): void {
    if (!this.puedeMover(tarea)) return;
    this.tareaAMover = tarea;
    this.rutaTareaAMover = ruta;
    this.destinoSeleccionado = tarea.parentTaskId ?? '';
    this.cargandoDestinos = true;
    this.tareasService.findAll({ vista: 'arbol', limit: 200 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (r) => {
        const paginas = Math.ceil(r.total / 200);
        const solicitudes = Array.from({ length: Math.max(0, paginas - 1) }, (_, i) =>
          this.tareasService.findAll({ vista: 'arbol', limit: 200, page: i + 2 }),
        );
        if (!solicitudes.length) this.aplicarDestinos([r], tarea);
        else forkJoin(solicitudes).pipe(takeUntil(this.destroy$)).subscribe({
          next: (resto) => this.aplicarDestinos([r, ...resto], tarea),
          error: () => { this.destinos = []; this.cargandoDestinos = false; this.cdr.markForCheck(); },
        });
      },
      error: () => { this.destinos = []; this.cargandoDestinos = false; this.cdr.markForCheck(); },
    });
  }

  private aplicarDestinos(respuestas: Array<{ items: Tarea[] }>, tarea: Tarea): void {
    const destinos: Array<{ id: string; ruta: string }> = [];
    const bajar = (n: Tarea, ruta: string): void => {
      destinos.push({ id: n.id, ruta });
      for (const h of n.hijos ?? []) bajar(h, `${ruta} › ${h.titulo}`);
    };
    respuestas.forEach((r) => r.items.forEach((root) => bajar(root, root.titulo)));
    const propios = new Set<string>();
    const marcar = (n: Tarea): void => { propios.add(n.id); for (const h of n.hijos ?? []) marcar(h); };
    marcar(tarea);
    this.destinos = destinos.filter((d) => !propios.has(d.id));
    this.cargandoDestinos = false;
    this.cdr.markForCheck();
  }

  puedeMover(tarea: Tarea): boolean {
    const usuario = this.auth.getUser();
    return usuario?.role === 'admin' || usuario?.role === 'superadmin' || tarea.createdById === usuario?.id;
  }

  cerrarMover(): void {
    if (this.guardandoMovimiento) return;
    this.tareaAMover = null;
    this.rutaTareaAMover = '';
    this.destinos = [];
  }

  guardarMovimiento(): void {
    const tarea = this.tareaAMover;
    if (!tarea || this.guardandoMovimiento) return;
    const parentTaskId = this.destinoSeleccionado || null;
    if ((tarea.parentTaskId ?? null) === parentTaskId) { this.cerrarMover(); return; }
    this.guardandoMovimiento = true;
    this.tareasService.update(tarea.id, { parentTaskId }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.guardandoMovimiento = false;
        this.tareaAMover = null;
        this.rutaTareaAMover = '';
        this.notif.success('Tarea reubicada');
        this.cargar(false);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.guardandoMovimiento = false;
        this.notif.error(e?.error?.message ?? 'No se pudo mover la tarea');
        this.cdr.markForCheck();
      },
    });
  }

  /** Tareas del panel ya vienen ordenadas por urgencia desde el backend. */
  get panelUrgentes(): Tarea[] {
    return this.tareas.filter(
      (t) => t.dueDate && t.status !== 'completada' && t.status !== 'cancelada',
    );
  }

  get panelSinFecha(): Tarea[] {
    return this.tareas.filter((t) => !t.dueDate && t.status !== 'completada' && t.status !== 'cancelada');
  }

  get panelHechas(): Tarea[] {
    return this.tareas.filter((t) => t.status === 'completada' || t.status === 'cancelada');
  }

  totalPorStatus(): number {
    return this.statusKeys.reduce((acc, k) => acc + (this.resumen[k] ?? 0), 0);
  }

  /**
   * Los bloques del panel narrowan `stats?.carga?.length`, pero TypeScript no
   * arrastra ese narrowing dentro de las expresiones del template. Estos
   * getters devuelven listas ya vacias para que no haga falta `!` en el HTML.
   */
  get carga(): TareaEstadisticas['carga'] {
    return this.stats?.carga ?? [];
  }

  get porModulo(): TareaEstadisticas['porModulo'] {
    return this.stats?.porModulo ?? [];
  }

  /** Mayor carga del equipo: la referencia para escalar las barras. */
  get maxCarga(): number {
    return this.carga.reduce((max, c) => Math.max(max, c.abiertas), 0);
  }

  /** Tareas sin `completada` ni `cancelada`. */
  get abiertas(): number {
    return (
      this.totalPorStatus() - (this.resumen['completada'] ?? 0) - (this.resumen['cancelada'] ?? 0)
    );
  }

  /** Porcentaje de la barra de una persona, acotado para no pasar de 100. */
  pctCarga(abiertas: number): number {
    return this.maxCarga ? Math.round((abiertas / this.maxCarga) * 100) : 0;
  }

  pctModulo(completadas: number, total: number): number {
    return total ? Math.round((completadas / total) * 100) : 0;
  }

  // ───────────────────────── DASHBOARD (PANEL) ─────────────────────────

  get serie(): TareaEstadisticas['serie'] {
    return this.stats?.serie ?? [];
  }

  /** Escala compartida de las barras: el valor mas alto de toda la serie. */
  get maxSerie(): number {
    return this.serie.reduce(
      (max, d) => Math.max(max, d.creadas, d.enProgreso, d.completadas, d.vencidas),
      0,
    );
  }

  /** Con ventana de 14/30 dias solo se rotulan los dias pares. */
  get esDiaPar(): (i: number) => boolean {
    const salto = this.diasGrafico > 14 ? 5 : this.diasGrafico > 7 ? 2 : 1;
    return (i: number) => i % salto === 0;
  }

  /** % de altura de una barra contra el maximo de la serie. */
  alturaSerie(valor: number): number {
    if (!this.maxSerie || !valor) return 0;
    return Math.max(4, Math.round((valor / this.maxSerie) * 100));
  }

/** Suma de la semana para las tarjetas KPI. */
get completadasSerie(): number {
    return this.serie.reduce((a, d) => a + d.completadas, 0);
  }

get creadasSerie(): number {
    return this.serie.reduce((a, d) => a + d.creadas, 0);
  }

get enProgresoSerie(): number {
    return this.serie.reduce((a, d) => a + d.enProgreso, 0);
  }

get vencidasSerie(): number {
    return this.serie.reduce((a, d) => a + d.vencidas, 0);
  }

  /** Tareas cerradas (completada + cancelada) del resumen del backend. */
  get cerradas(): number {
    return (this.resumen['completada'] ?? 0) + (this.resumen['cancelada'] ?? 0);
  }

  get bloqueadas(): number {
    return this.resumen['bloqueada'] ?? 0;
  }

  /** Filas del panel de atencion, en orden de urgencia. */
  get necesitanAtencion(): Tarea[] {
    return [...this.tareas]
      .filter((t) => t.status !== 'completada' && t.status !== 'cancelada')
      .sort((a, b) => {
        // Primero vencidas, luego sin asignar, luego por fecha de vencimiento.
        const av = this.vencida(a) ? 0 : 1;
        const bv = this.vencida(b) ? 0 : 1;
        if (av !== bv) return av - bv;
        if (!!a.asignados?.length !== !!b.asignados?.length) {
          return a.asignados?.length ? 1 : -1;
        }
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return a.dueDate ? -1 : b.dueDate ? 1 : 0;
      })
      .slice(0, 5);
  }

  vencida(t: Tarea): boolean {
    return !!t.dueDate && new Date(t.dueDate).getTime() < Date.now() && this.esActiva(t);
  }

  esActiva(t: Tarea): boolean {
    return t.status !== 'completada' && t.status !== 'cancelada';
  }

  /** Ultimas tareas tocadas, para la tabla de recientes. */
  get recientes(): Tarea[] {
    return [...this.tareas].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 6);
  }

  /** Cuantos dias lleva abierta una tarea, para la columna "edad". */
  diasAbierta(t: Tarea): number {
    if (!t.createdAt) return 0;
    const dias = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000);
    return Math.max(0, dias);
  }

  iniciales(t: Tarea): string {
    const rs = (t.asignados ?? []).slice(0, 2);
    if (!rs.length) return '—';
    return rs.map((r) => (r.nombre ?? '?').charAt(0).toUpperCase()).join('');
  }

  /** Un click en un filtro abre solo el menu y no recarga la lista. */
  toggleMenu(m: string, ev: Event): void {
    ev.stopPropagation();
    this.menu = this.menu === m ? null : m;
  }

  @HostListener('document:click')
  cerrarMenus(): void {
    if (this.menu) {
      this.menu = null;
      this.cdr.markForCheck();
    }
  }

  setAsignadoA(id: string): void {
    this.filtros.asignadoA = this.filtros.asignadoA === id ? '' : id;
    this.menu = null;
    this.page = 1;
    this.cargar();
  }

  /** Nombre del responsable filtrado; cae al id si la lista no lo tiene. */
  nombreResponsable(id: string): string {
    if (!id) return 'Responsable';
    return this.responsables.find((r) => r.id === id)?.name ?? 'Responsable';
  }

  // ─────────────────────────────── FILTROS ───────────────────────────────

  toggleStatus(s: TareaStatus): void {
    const i = this.filtros.status.indexOf(s);
    if (i >= 0) this.filtros.status.splice(i, 1);
    else this.filtros.status.push(s);
    this.page = 1;
    this.cargar();
  }

  /** Filtra por un estado exacto: sustituye la seleccion, y togglear lo quita. */
  filtrarStatus(s: TareaStatus): void {
    this.filtros.status = this.filtros.status.length === 1 && this.filtros.status[0] === s ? [] : [s];
    this.menu = null;
    this.page = 1;
    this.cargar();
  }

  togglePrioridad(p: string): void {
    const i = this.filtros.prioridad.indexOf(p);
    if (i >= 0) this.filtros.prioridad.splice(i, 1);
    else this.filtros.prioridad.push(p);
    this.page = 1;
    this.cargar();
  }

  activo(k: keyof Filtros): boolean {
    const v = this.filtros[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }

  hayFiltros(): boolean {
    return (
      !!this.filtros.q ||
      this.filtros.status.length > 0 ||
      this.filtros.prioridad.length > 0 ||
      !!this.filtros.asignadoA ||
      this.filtros.soloSinTicket
    );
  }

  limpiarFiltros(): void {
    this.filtros = { q: '', status: [], prioridad: [], asignadoA: '', soloSinTicket: false };
    this.page = 1;
    this.cargar();
  }

  // ─────────────────────────── ACCIONES ───────────────────────────

  onSearch(): void {
    this.page = 1;
    this.cargar();
  }

  onSearchKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') this.onSearch();
  }

  abrirDetalle(t: Tarea): void {
    this.detalleId = t.id;
  }

  cerrarDetalle(): void {
    this.detalleId = null;
  }

  /** Al guardar desde el detalle: refresca la lista de fondo. */
  onDetalleCambiado(): void {
    this.cargar(false);
  }

  onDetalleEliminada(): void {
    this.detalleId = null;
    this.cargar(false);
  }

  abrirNueva(): void {
    this.formTarea = null;
    this.formPadreId = null;
    this.formPadreRuta = '';
    this.formTicketId = null;
    this.formAbierto = true;
  }

  /** Alta de subtarea: el padre se fija y no se puede cambiar despues. */
  abrirSubtarea(padre: Tarea, ruta?: string): void {
    this.formTarea = null;
    this.formPadreId = padre.id;
    this.formPadreRuta = ruta ?? this.rutaEnDetalle(padre.id) ?? padre.titulo;
    this.formTicketId = padre.ticketId;
    this.formAbierto = true;
  }

  editar(t: Tarea): void {
    this.formTarea = t;
    this.formPadreId = null;
    this.formPadreRuta = '';
    this.formTicketId = t.ticketId;
    this.formAbierto = true;
  }

  cerrarForm(): void {
    this.formAbierto = false;
    this.formTarea = null;
    this.formPadreId = null;
    this.formPadreRuta = '';
    this.formTicketId = null;
  }

  onGuardado(): void {
    this.cerrarForm();
    this.detalleRefresco++;
    this.cargar(false);
  }

  private rutaEnDetalle(id: string): string | null {
    const recorre = (nodos: Tarea[], partes: string[]): string[] | null => {
      for (const nodo of nodos) {
        const ruta = [...partes, nodo.titulo];
        if (nodo.id === id) return ruta;
        const encontrada = recorre(nodo.hijos ?? [], ruta);
        if (encontrada) return encontrada;
      }
      return null;
    };
    const raiz = this.detalleId ? this.tareas.find((t) => t.id === this.detalleId) : null;
    if (raiz?.id === id) return raiz.titulo;
    const encontrada = recorre(raiz?.hijos ?? [], raiz ? [raiz.titulo] : []);
    return encontrada?.join(' › ') ?? null;
  }

  /** Cambio de estado desde la tarjeta (menu rapido). */
  cambiarStatus(t: Tarea, status: TareaStatus): void {
    if (t.status === status) return;
    this.tareasService
      .update(t.id, { status })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.cargar(false),
        error: (e) => {
          this.error = e?.error?.message ?? 'No se pudo actualizar la tarea';
          this.cdr.markForCheck();
        },
      });
  }

  onDragStart(id: string): void {
    this.dragId = id;
  }

  /**
   * Suelta en una columna. El estado viaja en `cdkDropListData`, asi que no
   * hace falta deducirlo de la columna: si cambia hay que hacer PATCH del estado
   * y ademas persistir el orden de destino; si no cambia, solo se reordena.
   */
  onDrop(ev: CdkDragDrop<TareaStatus>): void {
    const status = ev.container.data;
    const id = ev.item.data as string;
    this.dragId = null;

    const tarea = this.tareas.find((t) => t.id === id);
    if (!tarea) return;

    // Orden destino con la tarea ya colocada en su posicion final.
    const orden = this.tareasDe(status).filter((t) => t.id !== id).map((t) => t.id);
    orden.splice(ev.currentIndex, 0, id);

    if (tarea.status === status) {
      // Mismo estado: si no se movio de lugar, no hay nada que guardar.
      const antes = this.tareasDe(status).map((t) => t.id);
      if (antes[ev.previousIndex] === id && ev.previousIndex === ev.currentIndex) return;

      this.tareasService
        .reorder({ status, orden })
        .pipe(takeUntil(this.destroy$))
        .subscribe({ error: () => this.cargar(false) });
      return;
    }

    this.tareasService
      .update(id, { status })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // El PATCH no fija el orden, asi que se persiste aparte la posicion.
          this.tareasService
            .reorder({ status, orden })
            .pipe(takeUntil(this.destroy$))
            .subscribe({ error: () => this.cargar(false) });
        },
        error: (e) => {
          this.error = e?.error?.message ?? 'No se pudo mover la tarea';
          this.cdr.markForCheck();
          this.cargar(false);
        },
      });
  }

  // ─────────────────────────── UTILIDADES ───────────────────────────

  formatMinutos(m: number): string {
    if (!m) return '0h';
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!h) return `${r}m`;
    if (!r) return `${h}h`;
    return `${h}h ${r}m`;
  }

  statusLabel(s: string): string {
    return this.statusMeta.find((x) => x.key === s)?.label ?? s;
  }

  statusBadge(s: string): string {
    return this.statusMeta.find((x) => x.key === s)?.badge ?? 'is-pendiente';
  }

  prioridadLabel(p: string): string {
    return (
      { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' } as Record<string, string>
    )[p] ?? p;
  }

  get paginas(): number {
    return Math.max(1, Math.ceil(this.total / this.limite));
  }

  trackById(_i: number, t: Tarea): string {
    return t.id;
  }
}
