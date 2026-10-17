import {
  Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy,
  HostListener, ViewChild, ViewChildren, QueryList, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, of } from 'rxjs';
import { catchError, switchMap, takeUntil, tap } from 'rxjs/operators';
import {
  AdminService, MetricsDashboard, MxProyecto, MxFilaAsesorAtencion, MxFilaAtencion,
  MxFilaReunion, MxFilaAsesorTc, MxFilaTicketTc, MxFilaCorreoTc,
  MxConexionEvento, MxConexionHistorial, MxConexiones,
} from '../../../../core/services/admin.service';
import { SessionService } from '../../../../core/services/session.service';
import { User } from '../../../../core/models/user.model';
import { SocketService } from '../../../../core/services/socket.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { buscarCategoria } from '../../../../shared/utils/categoria-reunion.util';
import { priorityLabel, priorityColor } from '../../../../shared/utils/ticket-categories';

/**
 * Cómo el admin elige el rango.
 *
 *  - 'hoy'    solo el día de hoy.
 *  - 'mes'    un mes calendario completo (el más usado para ver el desempeño).
 *  - 'custom' un rango libre. Los inputs siempre están acotados al mes elegido
 *             en el selector, que es la forma más rápida de moverse por la
 *             historia sin escribir fechas a mano.
 */
type FechaPreset = 'hoy' | 'mes' | 'custom';

export type MxTab =
  | 'general'
  | 'ticketsCorreos'
  | 'atencion'
  | 'reuniones'
  | 'solicitudes'
  | 'conexiones';

interface TicketStatusEntry {
  key: string;
  label: string;
  color: string;
  value: number;
}

/** Minutos por estado: lo que traen las filas de la tabla de conexiones y el
 *  resumen por día de la ficha (mismas 5 columnas). */
type ConnMinutos = {
  disponibleMin: number;
  ocupadoMin: number;
  reunionMin: number;
  almuerzoMin: number;
  inactivoMin: number;
};

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
  /** Lo que muestran los controles: se EDITA aquí y solo se manda al backend
   *  cuando el admin da click en «Aplicar filtro». */
  filtros = {
    asesorId: '',
    proyecto: 'all' as MxProyecto,
    preset: 'mes' as FechaPreset,
  };
  desde = '';
  hasta = '';
  /** Copia EXACTA de lo que se pidió en la última carga: es lo que consulta el
   *  backend (cargar/exportar) y contra lo que se compara para saber si el
   *  filtro de arriba quedó con cambios sin aplicar. */
  aplicados = {
    asesorId: '',
    proyecto: 'all' as MxProyecto,
    preset: 'mes' as FechaPreset,
    desde: '',
    hasta: '',
  };
  /** Mes del selector, 'YYYY-MM'. Manda sobre `desde`/`hasta` en 'mes' y en
   *  'custom' define el rango en el que se pueden mover los inputs. */
  mesSel = '';
  advisors: User[] = [];
  /** true si la lista de asesores del desplegable no pudo cargarse: se avisa
   *  dentro del combo para que una lista con una sola opción nunca pase
   *  desapercibida. */
  asesoresError = false;

  // ── Selector de proyecto (lista desplegable con color por proyecto) ────────
  /** Abierto/cerrado de la lista de proyectos. */
  proyectoAbierto = false;
  /** Opciones de la lista: el mismo trío que tenían los segmentos. */
  readonly proyectos: { id: MxProyecto; label: string }[] = [
    { id: 'all', label: 'General' },
    { id: 'Sian365', label: 'SIAN365' },
    { id: 'ControlAcademic', label: 'Control Académico' },
  ];

  // ── Combobox de asesor (lista buscable) ──
  /** Abierto/cerrado del desplegable. */
  asesorAbierto = false;
  /** Texto escrito en el buscador del desplegable. */
  asesorBusqueda = '';
  /** Índice resaltado con las flechas del teclado. */
  asesorIndice = 0;
  @ViewChild('asesorInput') asesorInput?: ElementRef<HTMLInputElement>;

  /** Página de la tabla de Reuniones (1 por defecto). */
  capPagina = 1;

  // ── Paginación en memoria de las tablas (chats, asesores, tickets,
  //    correos y conexiones) ─────────────────────────────────────────────────
  /** Página visible de cada tabla, por nombre de tabla (1 por defecto). */
  private tablaPaginas: Record<string, number> = {};
  /** Filas por página: el mismo rango prudente que ya usan Atención y la
   *  tabla de Reuniones (que pagina el backend a 15). */
  readonly TABLA_POR_PAGINA = 15;

  /** Página en la que está la tabla `clave`. */
  tablaPagina(clave: string): number {
    return this.tablaPaginas[clave] ?? 1;
  }

  /** Páginas que necesita una tabla con `total` filas (mínimo 1). */
  paginasDe(total: number): number {
    return Math.max(1, Math.ceil(total / this.TABLA_POR_PAGINA));
  }

  /** Mueve la tabla `clave` a la página pedida, acotada a su total. */
  setTablaPagina(clave: string, total: number, destino: number): void {
    const max = this.paginasDe(total);
    const p = Math.min(Math.max(1, Math.round(destino)), max);
    if (p === this.tablaPagina(clave)) return;
    this.tablaPaginas[clave] = p;
    this.cdr.markForCheck();
  }

  /** Filas de la página visible de la tabla `clave`. Si el total encogió (otro
   *  filtro, otro refresh), acota la página para no apuntar a una que ya no
   *  existe — mismo criterio que Reuniones y Atención. */
  tablaFilas<T>(clave: string, filas: readonly T[]): T[] {
    const max = this.paginasDe(filas.length);
    const p = Math.min(this.tablaPagina(clave), max);
    if (p !== this.tablaPagina(clave)) this.tablaPaginas[clave] = p;
    const ini = (p - 1) * this.TABLA_POR_PAGINA;
    return filas.slice(ini, ini + this.TABLA_POR_PAGINA);
  }

  /** Vuelve a la página 1 de las tablas indicadas (sin args: de todas). */
  reiniciarTablas(...claves: string[]): void {
    for (const c of claves.length ? claves : Object.keys(this.tablaPaginas)) {
      delete this.tablaPaginas[c];
    }
  }

  // ── Pestaña Atención (lista de asesores → detalle de colegios) ────────────
  /** Texto del buscador; filtra asesores (nivel 1) o colegios (nivel 2). */
  atencionBusca = '';
  /** Asesor abierto con clic en la lista (null = lista). */
  atencionAsesor: string | null = null;
  /** Página visible de la tabla de Atención. */
  atencionPagina = 1;
  readonly ATENCION_POR_PAGINA = 15;

  // ── Pestaña Tickets/Correos (lista de asesores → tickets | correos) ───────
  /** Asesor abierto con clic en la lista (null = lista). */
  tcAsesor: string | null = null;
  /** Chip de filtro activo sobre la tabla de TICKETS: un estado ('abierto' /
   *  'resuelto') o una gestión ('Sin clasificar' o el nombre del catálogo). */
  tcTicketsFiltro: { tipo: 'estado' | 'gestion'; valor: string } | null = null;
  /** Chip de filtro activo sobre la tabla de CORREOS (su gestión). */
  tcCorreosFiltro: string | null = null;

  // ── Pestaña Conexiones (ficha del asesor) ─────────────────────────────────
  /** Asesor abierto con clic en la tabla (null = nivel 1). */
  connAsesor: string | null = null;
  /** Historial de la ficha del asesor (eventos + resumen + KPIs). */
  connHist: MxConexionHistorial | null = null;
  connHistCargando = false;
  private connHistToken = 0;
  /** Chip de filtro activo sobre los eventos del historial. */
  connHistFiltro: { tipo: 'tipo' | 'estado'; valor: string } | null = null;

  // ── Datos (una sola llamada por cambio de filtro) ──
  dash: MetricsDashboard | null = null;
  tab: MxTab = 'general';

  loading = true;
  /** true mientras la carga viene de «Aplicar filtro»: el overlay de pantalla
   *  completa dice CARGANDO; los refrescos automáticos dicen ACTUALIZANDO. */
  aplicando = false;
  error = false;
  exporting = false;

  readonly tabs: { id: MxTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'ticketsCorreos', label: 'Tickets/Correos' },
    { id: 'atencion', label: 'Atención' },
    { id: 'reuniones', label: 'Reuniones' },
    { id: 'solicitudes', label: 'Solicitudes' },
    { id: 'conexiones', label: 'Conexiones por agente' },
  ];

  /** Botones de las pestañas, para medir dónde va el indicador deslizante. */
  @ViewChildren('tabBtn') tabBtns?: QueryList<ElementRef<HTMLButtonElement>>;
  /** Posición/medida del indicador azul que se desliza bajo la pestaña activa. */
  tabIndX = 0;
  tabIndW = 0;
  /**
   * Activa la transición del indicador SOLO después del primer posicionamiento.
   * Al cargar, el indicador arranca en width 0: sin este guard, transicionaría
   * desde el borde izquierdo y la pestaña activa (texto blanco sobre fondo
   * transparente) quedaría invisible durante la animación → parpadeo.
   */
  tabsAnim = false;

  private refresh$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private sessionService: SessionService,
    private socket: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Mes en curso como punto de partida: es el rango que más se usa.
    this.setMes(this.valorMes(new Date()));

    this.sessionService.findAdvisors().subscribe({
      next: (list) => {
        // TODOS los asesores, ordenados alfabéticamente para que el desplegable
        // se lea igual que en el resto del módulo.
        this.advisors = [...(list ?? [])].sort((a, b) =>
          String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es'),
        );
        this.asesoresError = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.advisors = [];
        this.asesoresError = true;
        this.cdr.markForCheck();
      },
    });

    // Carga inicial + refresco en tiempo real. `switchMap` cancela la petición
    // anterior: al aplicar un filtro rápido, la respuesta con los filtros viejos
    // ya no puede pisar la nueva. No hay debounce: los filtros ya no se disparan
    // en cada click (se aplican con el botón), así que cada señal es intencionada
    // y el indicador de carga puede encenderse de inmediato.
    this.refresh$
      .pipe(
        tap(() => {
          this.loading = true;
          this.cdr.markForCheck();
        }),
        switchMap(() => this.cargar()),
        takeUntil(this.destroy$),
      )
      .subscribe((d) => {
        if (d) {
          this.dash = d;
          // El backend recorta la página pedida al último rango válido: si al
          // cambiar de filtro el total se encogió, hay que reflejarlo aquí o el
          // paginador quedaría apuntando a una página inexistente.
          this.capPagina = d.reuniones.tablaPagina || 1;
          // Mismo criterio para Atención: si el rango se encogió, la página
          // visible no puede quedar más allá del total de páginas (de la vista
          // que esté abierta: lista de asesores o detalle de un asesor).
          this.atencionPagina = Math.min(this.atencionPagina, this.atencionPaginas);
          this.error = false;
          // Refresca las cargas perezosas de Conexiones (timeline y ficha):
          // los eventos en vivo (`advisor_status_changed`) deben verse.
          this.trasNuevoDashboard();
        } else {
          // Antes el fallo se tragaba si ya había datos (`if (!this.dash)`), y
          // la UI seguía mostrando el dashboard viejo con las etiquetas de
          // filtro nuevas: parecía que el filtro no aplicara. Ahora se avisa.
          this.error = true;
        }
        this.loading = false;
        this.aplicando = false;
        this.cdr.detectChanges();
      });
    this.aplicarFiltros();

    this.socket.on('metrics_updated').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
    this.socket.on('session_updated').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
    this.socket.on('advisor_status_changed').pipe(takeUntil(this.destroy$)).subscribe(() => this.refresh$.next());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Posición inicial del indicador deslizante (ya están renderizados los botones). */
  ngAfterViewInit(): void {
    this.medirTabActiva();
    // Tras pintar el primer posicionamiento SIN transición, se habilita la
    // animación: a partir de ahí solo se desliza al cambiar de pestaña.
    setTimeout(() => {
      this.tabsAnim = true;
      this.cdr.markForCheck();
    });
  }

  /** Al reflowar la ventana los offsets de las pestañas cambian: se remide. */
  @HostListener('window:resize')
  onResize(): void {
    this.medirTrasRender();
  }

  /**
   * Mueve el indicador azul a la pestaña activa midiendo su `offsetLeft` y su
   * `offsetWidth`. El CSS se encarga de la transición, así que el cambio se ve
   * como un deslizamiento y no como un salto.
   */
  private medirTabActiva(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    const btn = this.tabBtns?.get(i)?.nativeElement;
    if (!btn) return;
    this.tabIndX = btn.offsetLeft;
    this.tabIndW = btn.offsetWidth;
    this.cdr.markForCheck();
  }

  /**
   * Remide el indicador DESPUÉS de que el navegador haya pintado el nuevo
   * estado. Usa doble `requestAnimationFrame`: el primero deja que Angular
   * aplique el `.active` al botón nuevo; el segundo espera a que el layout ya
   * esté comprometido. Sin esta separación, el `transform` del indicador se
   * actualiza en el mismo frame que el cambio de clase y el navegador no tiene
   * un estado "desde" que animar → la transición no se dispara a la primera
   * (bug de «hay que darle dos veces»).
   */
  private medirTrasRender(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => this.medirTabActiva()));
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  setTab(tab: MxTab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.resetVistas();
    this.cdr.markForCheck();
    this.medirTrasRender();
  }

  /**
   * Al cambiar de pestaña se vuelve a la vista de LISTA: se cierra el detalle
   * (nivel 2) de TODAS las pestañas para que regresar a cualquiera muestre la
   * tabla y no el asesor que quedó abierto al irse. Reutiliza los mismos
   * cerradores que los botones «Volver» de cada card, así el reset y el botón
   * nunca pueden divergir.
   *
   * Nota: si el filtro global de asesor fija uno, `atencionDetalleId` /
   * `tcDetalleId` siguen mandando el filtro (el backend solo trae ese asesor);
   * ese detalle se fuerza por diseño y aquí no se toca.
   */
  private resetVistas(): void {
    this.cerrarAtencionAsesor();
    this.cerrarTcAsesor();
    this.cerrarConnAsesor();
    this.cerrarAsesorLista();
    this.cerrarProyectoLista();
  }

  setAsesor(id: string): void {
    this.filtros.asesorId = id;
    this.capPagina = 1;
    // El filtro de arriba manda sobre el detalle: al aplicarlo se vuelve a la
    // lista (si eligió uno, el detalle lo abre el filtro, no el clic).
    this.atencionAsesor = null;
    this.atencionBusca = '';
    this.atencionPagina = 1;
    this.tcAsesor = null;
    this.connAsesor = null;
    this.connHist = null;
    this.cerrarAsesorLista();
    this.cdr.markForCheck();
  }

  setProyecto(m: MxProyecto): void {
    this.filtros.proyecto = m;
    this.proyectoAbierto = false;
    this.capPagina = 1;
    this.cdr.markForCheck();
  }

  setPreset(preset: FechaPreset): void {
    this.filtros.preset = preset;
    if (preset === 'hoy') {
      const hoy = new Date();
      // El selector de mes es el marco de los inputs: si hoy cae en otro mes,
      // hay que moverlo para que el rango quede en el mes que se está viendo.
      this.mesSel = this.valorMes(hoy);
      this.desde = this.iso(hoy);
      this.hasta = this.iso(hoy);
    } else if (preset === 'mes') {
      // Un mes calendario completo: del 1 al último día del mes elegido.
      this.aplicarMesCompleto();
    }
    this.capPagina = 1;
    this.cdr.markForCheck();
  }

  /**
   * Cambia el mes del selector. El mes NO es un preset aparte: es el rango en el
   * que vive el filtro. Si el admin está en 'hoy' se queda en 'hoy' (que también
   * depende del mes) y si está en 'custom' se recoloca su rango libre al mes.
   */
  setMes(valor: string): void {
    if (!valor) return;
    this.mesSel = valor;
    if (this.filtros.preset === 'hoy') {
      // 'hoy' es un solo día: solo tiene sentido si cae dentro del mes nuevo.
      const hoy = this.iso(new Date());
      if (hoy.startsWith(valor)) {
        this.desde = hoy;
        this.hasta = hoy;
      } else {
        this.setPreset('mes');
      }
    } else {
      // 'mes' y 'custom' terminan con el rango del mes.
      this.filtros.preset = 'mes';
      this.aplicarMesCompleto();
    }
    this.capPagina = 1;
    this.cdr.markForCheck();
  }

  /**
   * Inputs Desde/Hasta editados a mano: el preset pasa a 'custom' y el mes del
   * selector sigue al día editado, así el resto del mes queda disponible.
   */
  onFechasCambiadas(): void {
    this.filtros.preset = 'custom';
    if (this.desde && this.hasta && this.desde > this.hasta) this.hasta = this.desde;
    if (this.desde && this.hasta && this.hasta < this.desde) this.desde = this.hasta;
    // El mes se acota a la fecha que se tocó: si el admin pone un día, el
    // selector salta al mes de ese día para poder navegar el resto.
    const elegida = this.desde || this.hasta;
    if (elegida && !elegida.startsWith(this.mesSel)) this.mesSel = elegida.slice(0, 7);
    this.capPagina = 1;
    this.cdr.markForCheck();
  }

  /** Hay cambios en los controles que todavía no se le pidieron al backend. */
  get filtrosPendientes(): boolean {
    return (
      this.filtros.asesorId !== this.aplicados.asesorId ||
      this.filtros.proyecto !== this.aplicados.proyecto ||
      this.desde !== this.aplicados.desde ||
      this.hasta !== this.aplicados.hasta
    );
  }

  /** Controles fuera de su valor por defecto: es el contador del panel de
   *  filtros (solo presentación, no cambia lo que se consulta). */
  get filtrosActivos(): number {
    return (
      (this.filtros.proyecto !== 'all' ? 1 : 0) +
      (this.filtros.asesorId ? 1 : 0) +
      (this.filtros.preset !== 'mes' ? 1 : 0)
    );
  }

  /** Único punto por el que un cambio de filtro se vuelve una petición: copia
   *  los controles a `aplicados` y recarga UNA sola vez. */
  aplicarFiltros(): void {
    this.aplicados = {
      asesorId: this.filtros.asesorId,
      proyecto: this.filtros.proyecto,
      preset: this.filtros.preset,
      desde: this.desde,
      hasta: this.hasta,
    };
    this.capPagina = 1;
    this.atencionPagina = 1;
    this.reiniciarTablas();
    this.aplicando = true;
    this.refresh$.next();
  }

  resetFiltros(): void {
    this.filtros.asesorId = '';
    this.filtros.proyecto = 'all';
    this.filtros.preset = 'mes';
    this.atencionAsesor = null;
    this.atencionBusca = '';
    this.atencionPagina = 1;
    this.tcAsesor = null;
    this.connAsesor = null;
    this.connHist = null;
    this.asesorBusqueda = '';
    this.setMes(this.valorMes(new Date()));
    this.aplicarFiltros();
  }

  // ── Navegador de mes (‹ Octubre 2026 ›) ────────────────────────────────────
  /** Mes visible en el navegador, p. ej. "Octubre 2026". */
  get mesLabel(): string {
    if (!this.mesSel) return '';
    const [y, m] = this.mesSel.split('-').map(Number);
    const fmt = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
    const label = fmt.format(new Date(y, (m || 1) - 1, 1));
    return label.replace(' de ', ' ').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  }

  mesAnterior(): void {
    this.navegarMes(-1);
  }

  mesSiguiente(): void {
    this.navegarMes(1);
  }

  /** Mueve un mes calendario (paso negativo = más antiguo, positivo = más
   *  reciente) recalculando el rango con el preset vigente. */
  private navegarMes(paso: number): void {
    const base = this.mesSel || this.valorMes(new Date());
    const [y, m] = base.split('-').map(Number);
    this.setMes(this.valorMes(new Date(y, (m || 1) - 1 + paso, 1)));
  }

  // ── Combobox de asesor (lista buscable) ────────────────────────────────────
  /** Etiqueta de lo elegido en el desplegable. */
  get asesorSeleccionado(): string {
    if (!this.filtros.asesorId) return 'Todos los asesores';
    return (
      this.advisors.find((a) => String(a.id) === this.filtros.asesorId)?.name ??
      'Todos los asesores'
    );
  }

  /** Opciones del desplegable: SIEMPRE "Todos los asesores" + TODOS los
   *  asesores que coinciden con lo escrito (sin distinguir acentos ni
   *  mayúsculas). */
  get opcionesAsesor(): { id: string; label: string }[] {
    const q = this.normalizar(this.asesorBusqueda);
    const lista = this.advisors
      .filter((a) => !q || this.normalizar(String(a.name ?? '')).includes(q))
      .map((a) => ({ id: String(a.id), label: String(a.name ?? '—') }));
    return [{ id: '', label: 'Todos los asesores' }, ...lista];
  }

  toggleAsesorLista(): void {
    if (this.asesorAbierto) this.cerrarAsesorLista();
    else this.abrirAsesorLista();
  }

  abrirAsesorLista(): void {
    this.asesorAbierto = true;
    this.asesorBusqueda = '';
    const i = this.opcionesAsesor.findIndex((o) => o.id === this.filtros.asesorId);
    this.asesorIndice = i >= 0 ? i : 0;
    this.cdr.markForCheck();
    // El foco al buscador para poder escribir de una.
    setTimeout(() => this.asesorInput?.nativeElement.focus());
  }

  cerrarAsesorLista(): void {
    if (!this.asesorAbierto) return;
    this.asesorAbierto = false;
    this.asesorBusqueda = '';
    this.cdr.markForCheck();
  }

  filtrarAsesorBusqueda(texto: string): void {
    this.asesorBusqueda = texto;
    this.asesorIndice = 0;
    this.cdr.markForCheck();
  }

  moverAsesorIndice(delta: number): void {
    const total = this.opcionesAsesor.length;
    if (!total) return;
    this.asesorIndice = Math.min(Math.max(0, this.asesorIndice + delta), total - 1);
    this.cdr.markForCheck();
  }

  elegirAsesor(id: string): void {
    // setAsesor cierra el desplegable y deja el detalle en la lista.
    this.setAsesor(id);
    this.cdr.markForCheck();
  }

  /** Teclado dentro del buscador: flechas para moverse, Enter para elegir,
   *  Escape para cerrar. */
  onAsesorTecla(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.cerrarAsesorLista();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moverAsesorIndice(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moverAsesorIndice(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const op = this.opcionesAsesor[this.asesorIndice];
      if (op) this.elegirAsesor(op.id);
    }
  }

  // ── Lista de proyectos ────────────────────────────────────────────────────
  toggleProyectoLista(): void {
    if (this.proyectoAbierto) {
      this.cerrarProyectoLista();
    } else {
      this.cerrarAsesorLista();
      this.proyectoAbierto = true;
      this.cdr.markForCheck();
    }
  }

  cerrarProyectoLista(): void {
    if (!this.proyectoAbierto) return;
    this.proyectoAbierto = false;
    this.cdr.markForCheck();
  }

  /** Texto del toggle: la etiqueta del proyecto elegido. */
  proyectoLabel(p: MxProyecto | string): string {
    return this.proyectos.find((o) => o.id === p)?.label ?? 'General';
  }

  /** Al hacer click fuera de un desplegable se cierra. */
  @HostListener('document:click', ['$event'])
  onDocumentoClick(e: MouseEvent): void {
    const destino = e.target as HTMLElement | null;
    if (destino?.closest?.('.mx-combo')) return;
    if (destino?.closest?.('.mx-procombo')) return;
    if (this.asesorAbierto) this.cerrarAsesorLista();
    if (this.proyectoAbierto) this.cerrarProyectoLista();
  }

  setCapPagina(pagina: number): void {
    const max = this.dash?.reuniones.tablaPaginas ?? 1;
    const destino = Math.min(Math.max(1, Math.round(pagina)), max);
    if (destino === this.capPagina) return;
    this.capPagina = destino;
    this.refresh$.next();
  }

  // ── Atención (lista de asesores → colegios atendidos) ──────────────────────
  /**
   * Dos niveles, todo calculado AQUÍ sin volver a pedirle nada al backend:
   * el dashboard ya trae la lista de asesores y los pares atendidos, así que
   * entrar a un asesor, buscar y paginar son operaciones de memoria.
   */

  /** Detalle: el asesor elegido al hacer clic; si el filtro APLICADO ya fija
   *  uno, manda el filtro (es lo que realmente trae el backend). */
  get atencionDetalleId(): string | null {
    return this.aplicados.asesorId || this.atencionAsesor;
  }

  get atencionEnDetalle(): boolean {
    return !!this.atencionDetalleId;
  }

  abrirAtencionAsesor(id: string): void {
    this.atencionAsesor = id;
    this.atencionBusca = '';
    this.atencionPagina = 1;
    this.cdr.markForCheck();
  }

  cerrarAtencionAsesor(): void {
    this.atencionAsesor = null;
    this.atencionBusca = '';
    this.atencionPagina = 1;
    this.cdr.markForCheck();
  }

  /** Nombre del asesor del detalle, para el título de la card. */
  get atencionAsesorNombre(): string {
    const id = this.atencionDetalleId;
    return this.baseAsesores().find((a) => a.id === id)?.asesor ?? 'Asesor';
  }

  /** Nivel 1: todos los asesores activos del filtro. */
  private baseAsesores(): MxFilaAsesorAtencion[] {
    return this.dash?.atencion?.asesores ?? [];
  }

  /** Nivel 2: todos los pares atendidos del rango (sin buscar). */
  private baseAtencion(): MxFilaAtencion[] {
    return this.dash?.atencion?.tabla ?? [];
  }

  private normalizar(t: string): string {
    return t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /** Nivel 1: lista de asesores menos los que descarta el buscador. */
  get atencionAsesores(): MxFilaAsesorAtencion[] {
    const q = this.normalizar(this.atencionBusca);
    const lista = this.baseAsesores();
    if (!q) return lista;
    return lista.filter((a) => this.normalizar(a.asesor).includes(q));
  }

  /** Nivel 2: colegios ATENDIDOS por el asesor entrado, menos los que
   *  descarta el buscador (colegio o proyecto). */
  get atencionDetalleFilas(): MxFilaAtencion[] {
    const id = this.atencionDetalleId;
    const filas = this.baseAtencion().filter((f) => f.id === id);
    const q = this.normalizar(this.atencionBusca);
    if (!q) return filas;
    return filas.filter((f) =>
      this.normalizar(`${f.colegio} ${f.proyecto}`).includes(q),
    );
  }

  /** Filas que pagina la vista activa (lista de asesores o detalle). */
  atencionVisibles(): number {
    return this.atencionEnDetalle
      ? this.atencionDetalleFilas.length
      : this.atencionAsesores.length;
  }

  get atencionPaginas(): number {
    return Math.max(1, Math.ceil(this.atencionVisibles() / this.ATENCION_POR_PAGINA));
  }

  get atencionAsesoresPaginados(): MxFilaAsesorAtencion[] {
    const ini = (this.atencionPagina - 1) * this.ATENCION_POR_PAGINA;
    return this.atencionAsesores.slice(ini, ini + this.ATENCION_POR_PAGINA);
  }

  get atencionDetallePaginado(): MxFilaAtencion[] {
    const ini = (this.atencionPagina - 1) * this.ATENCION_POR_PAGINA;
    return this.atencionDetalleFilas.slice(ini, ini + this.ATENCION_POR_PAGINA);
  }

  setAtencionBusca(texto: string): void {
    this.atencionBusca = texto;
    this.atencionPagina = 1;
    this.cdr.markForCheck();
  }

  setAtencionPagina(pagina: number): void {
    const destino = Math.min(Math.max(1, Math.round(pagina)), this.atencionPaginas);
    if (destino === this.atencionPagina) return;
    this.atencionPagina = destino;
    this.cdr.markForCheck();
  }

  /** Totales del pie de la tabla, siempre sobre lo que está visible: buscar
   *  "María" responde en el pie cuánto atendió María. En la lista, `sesiones`
   *  es la suma de lo que cerró cada asesor visible. */
  get atencionResumen(): {
    asesores: number;
    colegios: number;
    sesiones: number;
  } {
    if (this.atencionEnDetalle) {
      const filas = this.atencionDetalleFilas;
      const colegios = new Set<string>();
      let sesiones = 0;
      for (const f of filas) {
        sesiones += f.atendidas;
        colegios.add(String(f.colegio ?? '').toLowerCase());
      }
      return { asesores: 1, colegios: colegios.size, sesiones };
    }
    const visibles = this.atencionAsesores;
    let sesiones = 0;
    for (const a of visibles) sesiones += a.sesiones;
    return { asesores: visibles.length, colegios: 0, sesiones };
  }

  /** Aviso de que el backend recortó la lista (solo si pasó el `LIMIT`). */
  get atencionRecortada(): boolean {
    return this.atencionTotalPares > this.atencionFilasBase;
  }

  /** Pares (asesor, colegio) que existen en el rango según el backend. */
  get atencionTotalPares(): number {
    return this.dash?.atencion?.tablaTotal ?? 0;
  }

  /** Pares que el backend devolvió realmente (después del `LIMIT`). */
  get atencionFilasBase(): number {
    return this.baseAtencion().length;
  }

  // ── Tickets/Correos (lista de asesores → tickets | correos) ────────────────
  /**
   * Dos niveles como en Atención, todo calculado AQUÍ sin pedir nada más al
   * backend: el dashboard trae la lista de asesores con sus conteos y, por
   * asesor, el detalle de tickets y correos, así que entrar a un asesor es
   * filtrar en memoria.
   */

  /** Detalle: el asesor elegido al hacer clic; si el filtro APLICADO ya fija
   *  uno, manda el filtro (es lo que realmente trae el backend). */
  get tcDetalleId(): string | null {
    return this.aplicados.asesorId || this.tcAsesor;
  }

  get tcEnDetalle(): boolean {
    return !!this.tcDetalleId;
  }

  abrirTcAsesor(id: string): void {
    this.tcAsesor = id;
    this.limpiarFiltroTickets();
    this.limpiarFiltroCorreos();
    this.reiniciarTablas('tcTickets', 'tcCorreos');
    this.cdr.markForCheck();
  }

  cerrarTcAsesor(): void {
    this.tcAsesor = null;
    this.limpiarFiltroTickets();
    this.limpiarFiltroCorreos();
    this.reiniciarTablas('tcTickets', 'tcCorreos');
    this.cdr.markForCheck();
  }

  // ── Filtros por chip (etiquetas de la tabla de tickets/correos) ───────────
  /** Clic en un chip de la tabla de TICKETS: filtra por ese estado o gestión;
   *  si ya estaba activo, el segundo clic lo quita. El paginador vuelve a 1. */
  alternaFiltroTickets(tipo: 'estado' | 'gestion', valor: string): void {
    const f = this.tcTicketsFiltro;
    this.tcTicketsFiltro = f && f.tipo === tipo && f.valor === valor ? null : { tipo, valor };
    this.reiniciarTablas('tcTickets');
    this.cdr.markForCheck();
  }

  limpiarFiltroTickets(): void {
    if (!this.tcTicketsFiltro) return;
    this.tcTicketsFiltro = null;
    this.reiniciarTablas('tcTickets');
    this.cdr.markForCheck();
  }

  estaTicketsFiltro(tipo: 'estado' | 'gestion', valor: string): boolean {
    const f = this.tcTicketsFiltro;
    return !!f && f.tipo === tipo && f.valor === valor;
  }

  /** Etiqueta del chip activo, para el mensaje de "sin resultados". */
  get tcTicketsFiltroLabel(): string {
    const f = this.tcTicketsFiltro;
    if (!f) return '';
    if (f.tipo === 'estado') return f.valor === 'abierto' ? 'Abiertos' : 'Resueltos';
    return f.valor;
  }

  /** Clic en un chip de la tabla de CORREOS: filtra por su gestión. */
  alternaFiltroCorreos(valor: string): void {
    this.tcCorreosFiltro = this.tcCorreosFiltro === valor ? null : valor;
    this.reiniciarTablas('tcCorreos');
    this.cdr.markForCheck();
  }

  limpiarFiltroCorreos(): void {
    if (this.tcCorreosFiltro == null) return;
    this.tcCorreosFiltro = null;
    this.reiniciarTablas('tcCorreos');
    this.cdr.markForCheck();
  }

  estaCorreosFiltro(valor: string): boolean {
    return this.tcCorreosFiltro === valor;
  }

  /** Nombre del asesor del detalle, para el título. */
  get tcAsesorNombre(): string {
    const id = this.tcDetalleId;
    return this.tcBaseAsesores().find((a) => a.id === id)?.asesor ?? 'Asesor';
  }

  private tcBaseAsesores(): MxFilaAsesorTc[] {
    return this.dash?.ticketsCorreos.asesores ?? [];
  }

  /** Nivel 1: todos los asesores del filtro con sus conteos del rango. */
  get tcAsesores(): MxFilaAsesorTc[] {
    return this.tcBaseAsesores();
  }

  /** Fila del asesor en detalle (conteos exactos, sin truncar). */
  get tcFilaAsesor(): MxFilaAsesorTc | null {
    const id = this.tcDetalleId;
    if (!id) return null;
    return this.tcBaseAsesores().find((a) => a.id === id) ?? null;
  }

  /** Lado izquierdo: tickets del asesor entrado (los 50 más recientes). */
  get tcTickets(): MxFilaTicketTc[] {
    const id = this.tcDetalleId;
    if (!id) return [];
    return (this.dash?.ticketsCorreos.tickets ?? []).filter((t) => t.id === id);
  }

  /** Lado derecho: correos del asesor entrado (los 50 más recientes). */
  get tcCorreos(): MxFilaCorreoTc[] {
    const id = this.tcDetalleId;
    if (!id) return [];
    return (this.dash?.ticketsCorreos.correos ?? []).filter((c) => c.id === id);
  }

  /** Tickets ya filtrados por el chip activo (estado o gestión). Los chips
   *  siempre muestran el conteo SIN filtrar: son las opciones, no el resultado. */
  get tcTicketsVisibles(): MxFilaTicketTc[] {
    const filas = this.tcTickets;
    const f = this.tcTicketsFiltro;
    if (!f) return filas;
    if (f.tipo === 'estado') {
      // Mismo criterio que los conteos «Abiertos / Resueltos» del backend.
      const abiertos = f.valor === 'abierto';
      return filas.filter((t) =>
        abiertos
          ? ['open', 'in_progress', 'on_hold'].includes(t.estado)
          : ['resolved', 'closed'].includes(t.estado),
      );
    }
    return filas.filter((t) => t.gestion === f.valor);
  }

  /** Correos ya filtrados por el chip de gestión activo. */
  get tcCorreosVisibles(): MxFilaCorreoTc[] {
    const filas = this.tcCorreos;
    const g = this.tcCorreosFiltro;
    return g == null ? filas : filas.filter((c) => c.gestion === g);
  }

  /** Chips de Gestión de los TICKETS del asesor (catálogo asignado). */
  get tcGestionTickets(): { clave: string; count: number }[] {
    const id = this.tcDetalleId;
    if (!id) return [];
    return (this.dash?.ticketsCorreos.gestionTickets ?? [])
      .filter((g) => g.id === id)
      .map((g) => ({ clave: g.clave, count: g.count }));
  }

  /** Chips de Gestión de los CORREOS del asesor: SOLO las categorías que el
   *  equipo asignó (Requerimiento, Error, ...); no aparecen estados tipo
   *  RESUELTO/PENDIENTE porque esos viven en las marcas de Outlook. */
  get tcGestionCorreos(): { clave: string; count: number }[] {
    const id = this.tcDetalleId;
    if (!id) return [];
    return (this.dash?.ticketsCorreos.gestionCorreos ?? [])
      .filter((g) => g.id === id)
      .map((g) => ({ clave: g.clave, count: g.count }));
  }

  /** Totales del pie de la tabla del nivel 1 (sobre lo que está visible). */
  get tcTotales(): { asesores: number; tickets: number; correos: number } {
    const visibles = this.tcAsesores;
    let tickets = 0;
    let correos = 0;
    for (const a of visibles) {
      tickets += a.tickets;
      correos += a.correos;
    }
    return { asesores: visibles.length, tickets, correos };
  }

  // ── Conexiones: ficha del asesor ──────────────────────────────────────────

  /** Etiqueta corta de una pill de día: «Hoy 16 oct» o «15 oct».
   *  Una fecha no parseable muestra «—» y nunca «NaN oct». */
  diaLabel(fecha: string): string {
    const partes = String(fecha ?? '').split('-').map(Number);
    if (partes.length < 3 || partes.some((n) => !Number.isFinite(n))) return '—';
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][(partes[1] || 1) - 1];
    const base = `${partes[2]} ${mes ?? ''}`.trim();
    return fecha === this.iso(new Date()) ? `Hoy ${base}` : base;
  }

  // ── Ficha del asesor (clic en la tabla de Detalle por agente) ─────────────

  get connEnDetalle(): boolean {
    return !!this.connAsesor;
  }

  /** Fila de la tabla con los minutos del asesor entrado. */
  get connFilaAsesor(): MxConexiones['tabla'][number] | null {
    const id = this.connAsesor;
    if (!id) return null;
    return this.dash?.conexiones.tabla.find((c) => c.id === id) ?? null;
  }

  get connAsesorNombre(): string {
    return this.connFilaAsesor?.nombre ?? 'Asesor';
  }

  /** KPIs del historial (null mientras carga). El getter permite usar
   *  `connKpis?.campo` en la plantilla: el verificador de Angular marca
   *  TS2532 si se accede a un campo DESPUÉS de un `?.` encadenado. */
  get connKpis(): MxConexionHistorial['kpis'] | null {
    return this.connHist?.kpis ?? null;
  }

  /** Total de eventos del historial (0 si aún no carga). */
  get connEventosTotal(): number {
    return this.connHist?.eventos.length ?? 0;
  }

  abrirConnAsesor(id: string): void {
    this.connAsesor = id;
    this.connHistFiltro = null;
    this.reiniciarTablas('connHist', 'connDias');
    this.cargarHistorialConn();
    this.cdr.markForCheck();
  }

  cerrarConnAsesor(): void {
    this.connAsesor = null;
    this.connHist = null;
    this.connHistFiltro = null;
    this.connHistCargando = false;
    this.reiniciarTablas('connHist', 'connDias');
    this.cdr.markForCheck();
  }

  /** Historial de la ficha: se recarga con cada refresh del dashboard para
   *  que las desconexiones en vivo se vean sin volver a entrar. */
  cargarHistorialConn(): void {
    const id = this.connAsesor;
    if (!id) return;
    const token = ++this.connHistToken;
    this.connHistCargando = true;
    this.adminService
      .getMetricasConexionHistorial(id, {
        proyecto: this.aplicados.proyecto,
        desde: this.aplicados.desde || undefined,
        hasta: this.aplicados.hasta || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (h) => {
          if (token !== this.connHistToken || this.connAsesor !== id) return;
          this.connHist = h;
          this.connHistCargando = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (token !== this.connHistToken) return;
          this.connHist = null;
          this.connHistCargando = false;
          this.cdr.markForCheck();
        },
      });
  }

  /** Tras cada recarga del dashboard: se refresca la ficha si estaba abierta. */
  private trasNuevoDashboard(): void {
    if (this.connAsesor) this.cargarHistorialConn();
  }

  // ── Historial: filtros por chip ────────────────────────────────────────────

  /** Chips del historial: Todo + los tipos y estados que HAY en los eventos
   *  cargados (los que salen en 0 no se muestran; solo «Todo» siempre está). */
  get connFiltroChips(): { filtro: { tipo: 'tipo' | 'estado'; valor: string } | null; label: string; count: number }[] {
    const evs = this.connHist?.eventos ?? [];
    const cTipo = (t: string) => evs.filter((e) => e.tipo === t).length;
    const cEstado = (s: string) => evs.filter((e) => e.estado === s).length;
    const chips: { filtro: { tipo: 'tipo' | 'estado'; valor: string } | null; label: string; count: number }[] = [
      { filtro: null, label: 'Todo', count: evs.length },
      { filtro: { tipo: 'tipo', valor: 'conexion' }, label: 'Conexión', count: cTipo('conexion') },
      { filtro: { tipo: 'tipo', valor: 'desconexion' }, label: 'Desconexión', count: cTipo('desconexion') },
      { filtro: { tipo: 'estado', valor: 'online' }, label: 'Disponible', count: cEstado('online') },
      { filtro: { tipo: 'estado', valor: 'busy' }, label: 'Ocupado', count: cEstado('busy') },
      { filtro: { tipo: 'estado', valor: 'meeting' }, label: 'Reunión', count: cEstado('meeting') },
      { filtro: { tipo: 'estado', valor: 'offline' }, label: 'Inactivo', count: cEstado('offline') },
      { filtro: { tipo: 'estado', valor: 'almuerzo' }, label: 'Almuerzo', count: cEstado('almuerzo') },
    ];
    return chips.filter((c) => !c.filtro || c.count > 0);
  }

  alternaConnFiltro(filtro: { tipo: 'tipo' | 'estado'; valor: string } | null): void {
    const f = this.connHistFiltro;
    this.connHistFiltro =
      filtro && f && f.tipo === filtro.tipo && f.valor === filtro.valor ? null : filtro;
    this.reiniciarTablas('connHist');
    this.cdr.markForCheck();
  }

  estaConnFiltro(filtro: { tipo: 'tipo' | 'estado'; valor: string } | null): boolean {
    const f = this.connHistFiltro;
    if (!filtro) return !f;
    return !!f && f.tipo === filtro.tipo && f.valor === filtro.valor;
  }

  /** Etiqueta del chip activo, para el "sin resultados" del historial. */
  get connFiltroLabel(): string {
    if (!this.connHistFiltro) return '';
    return this.connFiltroChips.find(
      (c) =>
        c.filtro &&
        c.filtro.tipo === this.connHistFiltro!.tipo &&
        c.filtro.valor === this.connHistFiltro!.valor,
    )?.label ?? '';
  }

  /** Eventos del historial ya filtrados por el chip activo. */
  get connEventosVisibles(): MxConexionEvento[] {
    const evs = this.connHist?.eventos ?? [];
    const f = this.connHistFiltro;
    if (!f) return evs;
    return f.tipo === 'tipo'
      ? evs.filter((e) => e.tipo === f.valor)
      : evs.filter((e) => e.estado === f.valor);
  }

  // ── Etiquetas de eventos (historial) ───────────────────────────────────────

  /** `tipo` crudo → etiqueta amable. */
  tipoLabel(tipo: string | null | undefined): string {
    const map: Record<string, string> = {
      conexion: 'Conexión',
      desconexion: 'Desconexión',
      status: 'Cambio de estado',
      almuerzo_inicio: 'Inicio almuerzo',
      almuerzo_fin: 'Fin almuerzo',
      almuerzo: 'Almuerzo',
    };
    return tipo ? map[tipo] ?? tipo : '—';
  }

  /** `causa` cruda → etiqueta (timeout = corte por pérdida de señal). */
  causaLabel(causa: string | null | undefined): string {
    const map: Record<string, string> = {
      connect: 'Conexión',
      disconnect: 'Desconexión',
      manual: 'Manual',
      almuerzo: 'Almuerzo',
      timeout: 'Sin señal',
      sistema: 'Sistema',
    };
    return causa ? map[causa] ?? causa : '—';
  }

  /** Color de la causa: rojo para lo que corta la sesión, verde para conexión. */
  causaColor(causa: string | null | undefined): string {
    const map: Record<string, string> = {
      connect: '#16a34a',
      disconnect: '#ef4444',
      timeout: '#ef4444',
      manual: '#f59e0b',
      almuerzo: '#f59e0b',
      sistema: '#64748b',
    };
    return map[causa ?? ''] ?? '#94a3b8';
  }

  /** Duración amable de un evento: 45s / 12m / 2h 14m. */
  fmtDur(ms: number | null | undefined): string {
    if (ms == null || ms < 0) return '—';
    const seg = Math.round(ms / 1000);
    if (seg < 60) return `${seg}s`;
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }

  // ── KPIs y barras de la pestaña ────────────────────────────────────────────

  /** % de disponibilidad de una fila (Disponible ÷ Total sin Almuerzo):
   *  el mismo criterio que calcula el backend en sus KPIs. */
  pctDisponible(f: ConnMinutos): number | null {
    const total =
      f.disponibleMin + f.ocupadoMin + f.reunionMin + f.almuerzoMin + f.inactivoMin;
    const base = total - f.almuerzoMin;
    return base > 0 ? Math.round((f.disponibleMin / base) * 100) : null;
  }

  /** 42% | — para los porcentajes que pueden no tener base. */
  pctStr(v: number | null | undefined): string {
    return v == null ? '—' : `${v}%`;
  }

  /** Segmentos de la barrita apilada de la celda % (solo estados con minutos). */
  estadoBarraSegs(f: ConnMinutos): { label: string; color: string; pct: number }[] {
    const total =
      f.disponibleMin + f.ocupadoMin + f.reunionMin + f.almuerzoMin + f.inactivoMin;
    if (!total) return [];
    const defs = [
      { label: 'Disponible', min: f.disponibleMin, color: '#16a34a' },
      { label: 'Ocupado', min: f.ocupadoMin, color: '#3b82f6' },
      { label: 'Reuniones', min: f.reunionMin, color: '#8b5cf6' },
      { label: 'Almuerzo', min: f.almuerzoMin, color: '#f59e0b' },
      { label: 'Inactivo', min: f.inactivoMin, color: '#94a3b8' },
    ];
    return defs
      .filter((d) => d.min > 0)
      .map((d) => ({ label: d.label, color: d.color, pct: (d.min / total) * 100 }));
  }

  /** Resumen por día de la ficha, del más reciente al más antiguo. */
  get connDiasResumen(): MxConexionHistorial['dias'] {
    return [...(this.connHist?.dias ?? [])].reverse();
  }

  // ── Helpers de fechas ─────────────────────────────────────────────────────
  private iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 'YYYY-MM' del día. */
  private valorMes(d: Date): string {
    return this.iso(d).slice(0, 7);
  }

  /** Primer día del mes del selector, a medianoche local. */
  private primerDiaMes(): Date {
    const [y, m] = this.mesSel.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }

  /** Día final del mes del selector (inclusive). */
  private ultimoDiaMes(): Date {
    const ini = this.primerDiaMes();
    return new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
  }

  private aplicarMesCompleto(): void {
    this.desde = this.iso(this.primerDiaMes());
    this.hasta = this.iso(this.ultimoDiaMes());
  }

  // ── Carga ──────────────────────────────────────────────────────────────────
  /**
   * Trae el dashboard con los filtros vigentes.
   *
   * Devuelve el Observable en vez de suscribirse: así `switchMap` puede
   * cancelar la petición anterior si cambian los filtros. Un fallo se
   * convierte en `null` para poder mostrar el aviso sin romper el pipeline.
   */
  private cargar(): Observable<MetricsDashboard | null> {
    // Siempre en `loading`, también cuando ya hay datos en pantalla: si no,
    // al aplicar un filtro no se ve nada y parece que el click no sirvió.
    this.loading = true;
    this.cdr.markForCheck();
    return this.adminService
      .getMetricsDashboard({
        proyecto: this.aplicados.proyecto,
        desde: this.aplicados.desde || undefined,
        hasta: this.aplicados.hasta || undefined,
        asesorId: this.aplicados.asesorId || undefined,
        tablaPagina: this.capPagina,
      })
      .pipe(catchError(() => of(null)));
  }

  retry(): void {
    this.error = false;
    this.loading = true;
    this.cdr.detectChanges();
    // Pasa por el mismo pipeline (con cancelación) que cualquier filtro.
    this.refresh$.next();
  }

  exportarExcel(): void {
    if (this.exporting || !this.dash) return;
    this.exporting = true;
    this.cdr.detectChanges();
    this.adminService
      .exportMetricsDashboard({
        proyecto: this.aplicados.proyecto,
        desde: this.aplicados.desde || undefined,
        hasta: this.aplicados.hasta || undefined,
        asesorId: this.aplicados.asesorId || undefined,
      })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `metricas_${this.aplicados.desde || 'todo'}_a_${this.aplicados.hasta || 'hoy'}.xlsx`;
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
    return this.dash?.resumen.kpis.tickets ?? null;
  }

  get horaActualizacion(): string {
    if (!this.dash) return '';
    return new Date(this.dash.generadoEn).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Las reuniones por empezar más cercanas (máx. 5) para la card de
   *  Reuniones del tab General: las mismas que lista la pestaña Reuniones. */
  get proximasReunionesLista(): MxFilaReunion[] {
    return (this.dash?.reuniones.proximasLista ?? []).slice(0, 5);
  }

  // ── Gráficas (CSS puro) ────────────────────────────────────────────────────
  get solicitudesSerieMax(): number {
    return Math.max(1, ...(this.dash?.solicitudes.serie ?? []).map((s) => s.count));
  }

  barHeightOf(total: number, max: number): number {
    return (total / max) * 100;
  }

  pctOf(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  /** Etiqueta de eje «MM/DD»; fechas inválidas o inexistentes muestran «—». */
  fechaCorta(fecha: string): string {
    const s = String(fecha ?? '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(5, 10).replace('-', '/') : '—';
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

  /**
   * Color de un tipo de evento, IGUAL que en el Calendario.
   *
   * Resuelve contra `CATEGORIAS_REUNION` (la única fuente de la paleta):
   * amarillo=virtual, azul=presencial, morado=equipo, verde=cumpleaños,
   * naranja=ausencia, púrpura=vacaciones, rojo=incapacidad. Si aquí se pusiera
   * un hex a mano, Métricas y Calendario dejarían de coincidir y los colores
   * dejarían de significar algo.
   *
   * Tolera además las claves cortas 'virtual'/'presencial', que es lo que
   * todavía mandan los KPIs de la tarjeta General.
   */
  categoriaColor(clave: string): string {
    const alias = clave === 'presencial'
      ? 'Reunion presencial'
      : clave === 'virtual'
        ? 'Reunion virtual'
        : clave;
    return buscarCategoria(alias)?.color ?? '#94a3b8';
  }

  donutReunionesStyle(): string {
    const categorias = this.dash?.reuniones.porCategoria ?? [];
    return this.donutStyle(
      categorias.map((m) => ({
        color: this.categoriaColor(m.clave),
        value: m.count,
      })),
    );
  }

  // ── Helpers del rediseño del tab General ───────────────────────────────────
  get gestionCorreos() {
    return this.dash?.resumen.gestionCorreos ?? null;
  }

  /**
   * Total del hueco del donut «Gestión en correos»: la suma de las gestiones
   * que se LISTAN (las clasificadas a mano), no el total de todos los correos
   * del rango. Si no, el centro no cuadraría con los segmentos del donut.
   */
  get gestionCorreosTotal(): number {
    return (this.gestionCorreos?.porCategoria ?? []).reduce(
      (s, c) => s + (c.count || 0),
      0,
    );
  }

  /** La card "Conexión del asesor" solo aplica cuando el rango APLICADO es "Hoy". */
  get esHoy(): boolean {
    return this.aplicados.preset === 'hoy';
  }

  /** Paleta minimalista compartida por los donuts (acento de proyecto + grises). */
  private readonly donutPalette = [
    '#1a3fa8', // azul ControlAcademic
    '#ce9b30', // dorado Sian365
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

  /**
   * Color por nombre de gestión para la columna Gestión de la tabla de
   * correos: mismo color para la misma gestión en cualquier asesor. Sale de
   * la paleta minimalista (aleatorio entre 8, estable por nombre).
   */
  tcGestionColor(nombre: string | null | undefined): string {
    const clave = (nombre ?? '').trim();
    if (!clave || clave === 'Sin clasificar') return '#94a3b8';
    let h = 0;
    for (let i = 0; i < clave.length; i++) {
      h = (h * 31 + clave.charCodeAt(i)) | 0;
    }
    return this.donutPalette[Math.abs(h) % this.donutPalette.length];
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

  /**
   * Jornada del día, en epoch ms: de la primera actividad de cualquier asesor
   * a la última.
   *
   * Es la ESCALA de la barra. Antes cada periodo se medía contra las 24 h
   * fijas del día, así que una jornada de 08:00–12:00 ocupaba ~17% de la pista
   * y no se distinguía nada entre asesores. Midiendo contra `t0..t1` las barras
   * llenan la pista y las diferencias se ven; la hora exacta sigue disponible
   * en el tooltip y en las etiquetas del eje.
   */
  private get jornadaVentana(): { t0: number; t1: number } | null {
    const asesores = this.dash?.conexiones.barras?.asesores ?? [];
    let t0 = Infinity;
    let t1 = -Infinity;
    for (const a of asesores) {
      for (const p of a.periodos) {
        if (!p.desde) continue;
        const ini = new Date(p.desde).getTime();
        if (!Number.isFinite(ini)) continue;
        t0 = Math.min(t0, ini);
        // Un periodo sin `hasta` sigue abierto: cuenta hasta ahora.
        const fin = p.hasta ? new Date(p.hasta).getTime() : Date.now();
        if (Number.isFinite(fin)) t1 = Math.max(t1, fin);
      }
    }
    if (!Number.isFinite(t0) || t1 <= t0) return null;
    return { t0, t1 };
  }

  /** Desplazamiento horizontal (left %) de un periodo dentro de la jornada. */
  periodoLeft(p: { desde: string }): number {
    const w = this.jornadaVentana;
    if (!w) return 0;
    const ini = new Date(p.desde).getTime();
    if (!Number.isFinite(ini)) return 0;
    // Recortar a la ventana: un periodo que empieza antes de la jornada no debe
    // salirse de la pista por la izquierda.
    const iniRec = Math.min(Math.max(ini, w.t0), w.t1);
    return ((iniRec - w.t0) / (w.t1 - w.t0)) * 100;
  }

  /** Ancho (width %) de un periodo dentro de la jornada. */
  periodoWidth(p: { desde: string; hasta: string | null }): number {
    const w = this.jornadaVentana;
    if (!w) return 0;
    const ini = new Date(p.desde).getTime();
    if (!Number.isFinite(ini)) return 0;
    const iniRec = Math.min(Math.max(ini, w.t0), w.t1);
    // Periodo abierto (`hasta` null): se dibuja hasta ahora, sin pasar de t1.
    const finCrudo = p.hasta
      ? new Date(p.hasta).getTime()
      : Math.max(Date.now(), iniRec);
    const fin = Number.isFinite(finCrudo)
      ? Math.min(Math.max(finCrudo, w.t0), w.t1)
      : iniRec;
    return ((fin - iniRec) / (w.t1 - w.t0)) * 100;
  }

  /** Hora en hora Bogotá (HH:MM) para un instante ISO. */
  horaCorta(iso: string | null): string {
    if (!iso) return '—';
    const bog = new Date(new Date(iso).getTime() + MetricsComponent.OFFSET_BOGOTA_MIN * 60000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(bog.getUTCHours())}:${p(bog.getUTCMinutes())}`;
  }

  /** Hora entera de jornada (HH:00) para mostrar el rango laboral configurado. */
  hh(n: number): string {
    return `${String(n).padStart(2, '0')}:00`;
  }

  /** Jornada del día en horas Bogotá, calculada de la misma ventana que escala la barra. */
  get jornadaRango(): { inicio: string; fin: string } | null {
    const w = this.jornadaVentana;
    if (!w) return null;
    return {
      inicio: this.horaCorta(new Date(w.t0).toISOString()),
      fin: this.horaCorta(new Date(w.t1).toISOString()),
    };
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
    return (this.dash?.resumen.kpis.ticketsPorEstado ?? []).map((t) => ({
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

  /** Prioridad con los MISMOS colores y etiquetas del módulo de Tickets. */
  colorPrioridad(p: string | null | undefined): string {
    return priorityColor(p ?? '');
  }

  prioridadLabel(p: string | null | undefined): string {
    return p ? priorityLabel(p) : '—';
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
