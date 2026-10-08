import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  HostListener,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  CorreosAdminService,
  CuboCorreo,
  CuerpoCorreoAdmin,
  FilaAsesorSla,
  ListadoAsesorAdmin,
  MensajeCorreoAdmin,
} from '../../../../../../core/services/correos-admin.service';
import { ThemeService } from '../../../../../../core/services/theme.service';
import { COLOR_ESTADO, estiloNivel } from '../../correos-sla.util';
import {
  colorCategoria,
  etiquetaCategoria,
  esCategoriaPendiente,
} from '../../correos-categoria.util';
import { fechaCorta, numero, tiempoRelativo } from '../../correos-fecha.util';

const LIMITE = 50;

/**
 * Cubos ofrecidos como filtro, con su color de columna.
 *
 * `campo` apunta al contador equivalente en `FilaAsesorSla`: asi el chip puede
 * mostrar cuantos correos hay detras. Solo se pinta si la fila del dashboard
 * viajo en el estado del router; con F5 no hay de donde sacarlo y se omite en
 * vez de inventar un cero.
 */
const CUBOS: {
  valor: CuboCorreo | '';
  etiqueta: string;
  color?: string;
  campo?: keyof Pick<
    FilaAsesorSla,
    'pendiente' | 'enProceso' | 'gestionado' | 'escalado' | 'resuelto' | 'otros'
  >;
}[] = [
  {
    valor: 'pendiente',
    etiqueta: 'Pendiente',
    color: COLOR_ESTADO['pendiente'],
    campo: 'pendiente',
  },
  { valor: 'en_proceso', etiqueta: 'En proceso', color: COLOR_ESTADO['enProceso'], campo: 'enProceso' },
  { valor: 'gestionado', etiqueta: 'Gestionado', color: COLOR_ESTADO['gestionado'], campo: 'gestionado' },
  { valor: 'escalado', etiqueta: 'Escalado', color: COLOR_ESTADO['escalado'], campo: 'escalado' },
  { valor: 'resuelto', etiqueta: 'Resuelto', color: COLOR_ESTADO['resuelto'], campo: 'resuelto' },
  { valor: 'otros', etiqueta: 'Otros', color: COLOR_ESTADO['otros'], campo: 'otros' },
];

@Component({
  selector: 'app-correos-asesor-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './correos-asesor-admin.html',
  styleUrls: ['./correos-asesor-admin.scss'],
})
export class CorreosAsesorAdmin implements OnInit, OnDestroy {
  private api = inject(CorreosAdminService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private themeService = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);

  @HostBinding('class.theme-dark') protected themeDark = false;

  private readonly destroy$ = new Subject<void>();

  /**
   * Boton que abrio el visor.
   *
   * Al cerrar, el foco vuelve a el. Sin esto el teclado queda en el `body` y
   * hay que empezar a recorrer la pagina entera otra vez.
   */
  private ultimoFoco: HTMLElement | null = null;

  readonly limite = LIMITE;

  /** Cubos sin la opcion "Todos": esa va aparte en la plantilla. */
  readonly cubosVisibles = CUBOS;

  readonly asesorId = signal<string>('');
  /** Fila de la tabla del dashboard; da nombre, carpeta y nivel sin otra llamada. */
  readonly fila = signal<FilaAsesorSla | null>(null);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly listado = signal<ListadoAsesorAdmin | null>(null);

  readonly cubo = signal<CuboCorreo | ''>('');
  readonly soloNoLeidos = signal(false);
  readonly buscar = signal('');
  readonly offset = signal(0);

  /** Mensaje abierto en el visor. */
  readonly abierto = signal<MensajeCorreoAdmin | null>(null);
  readonly cuerpoAbierto = signal<CuerpoCorreoAdmin | null>(null);
  readonly cargandoCuerpo = signal(false);

  /**
   * Contexto de la carpeta, para mostrar cuantos correos hay en cada cubo sin
   * pedir otra vez el resumen entero.
   */
  readonly contadorCubo = signal<number | null>(null);

  ngOnInit(): void {
    this.themeDark = this.themeService.currentTheme === 'dark';
    this.themeService.currentTheme$.pipe(takeUntil(this.destroy$)).subscribe((t) => {
      this.themeDark = t === 'dark';
      this.cdr.markForCheck();
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/admin/correos']);
      return;
    }
    this.asesorId.set(id);
    this.cargar();

    // La fila del dashboard viaja en el estado del router y evita que el detalle
    // tenga que pedir el resumen entero otra vez. Si se recarga la pagina (F5)
    // ese estado se pierde, y el encabezado se conforma con el propio listado.
    const fila = (history.state as { fila?: FilaAsesorSla } | null)?.fila;
    if (fila?.asesorId === id) {
      this.fila.set(fila);
      this.actualizarContador();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api
      .mensajes(this.asesorId(), {
        limite: this.limite,
        offset: this.offset(),
        soloNoLeidos: this.soloNoLeidos(),
        buscar: this.buscar().trim(),
        cubo: this.cubo() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.listado.set(r);
          this.cargando.set(false);
          this.actualizarContador();
        },
        error: () => {
          this.error.set('No se pudo cargar la bandeja de este asesor.');
          this.cargando.set(false);
        },
      });
  }

  /** Ajusta el contador del cubo activo a partir de la fila del dashboard. */
  private actualizarContador(): void {
    const cubo = this.cubo();
    if (!cubo) {
      this.contadorCubo.set(null);
      return;
    }
    const fila = this.fila();
    const def = CUBOS.find((c) => c.valor === cubo);
    if (fila && def?.campo) {
      this.contadorCubo.set(fila[def.campo] ?? null);
      return;
    }
    this.contadorCubo.set(null);
  }

  /** Cambia un filtro y vuelve a la primera página. */
  aplicar(): void {
    this.offset.set(0);
    this.cargar();
  }

  setCubo(valor: CuboCorreo | ''): void {
    this.cubo.set(valor);
    this.offset.set(0);
    this.aplicar();
    this.actualizarContador();
  }

  /** Etiqueta del cubo activo, para el contador de resultados. */
  nombreCubo(valor: CuboCorreo | ''): string {
    return CUBOS.find((c) => c.valor === valor)?.etiqueta ?? '';
  }

  toggleNoLeidos(): void {
    this.soloNoLeidos.update((v) => !v);
    this.aplicar();
  }

  onBuscar(event: Event): void {
    this.buscar.set((event.target as HTMLInputElement).value);
  }

  pagina(delta: number): void {
    const total = this.listado()?.total ?? 0;
    const siguiente = this.offset() + delta * this.limite;
    if (siguiente < 0 || siguiente >= total) return;
    this.offset.set(siguiente);
    this.cargar();
  }

  hayAnterior(): boolean {
    return this.offset() > 0;
  }

  haySiguiente(): boolean {
    const l = this.listado();
    return !!l && this.offset() + this.limite < l.total;
  }

  paginaActual(): number {
    return Math.floor(this.offset() / this.limite) + 1;
  }

  totalPaginas(): number {
    const total = this.listado()?.total ?? 0;
    return Math.max(1, Math.ceil(total / this.limite));
  }

  /** Abre el visor del correo y pide el cuerpo sanitizado. */
  verCuerpo(m: MensajeCorreoAdmin, boton: HTMLElement): void {
    this.ultimoFoco = boton;
    this.abierto.set(m);
    this.cuerpoAbierto.set(null);
    this.cargandoCuerpo.set(true);
    this.api.cuerpo(this.asesorId(), m.id).subscribe({
      next: (r) => {
        this.cuerpoAbierto.set(r);
        this.cargandoCuerpo.set(false);
      },
      error: () => {
        this.cuerpoAbierto.set(null);
        this.cargandoCuerpo.set(false);
      },
    });
  }

  cerrarCuerpo(): void {
    this.abierto.set(null);
    this.cuerpoAbierto.set(null);
    this.cargandoCuerpo.set(false);
    this.ultimoFoco?.focus();
    this.ultimoFoco = null;
  }

  /**
   * Escape cierra el visor.
   *
   * Un modal sin salida con teclado deja encerrado a quien navega con el, y el
   * boton de cerrar ni siquiera recibe el foco al abrirse.
   */
  @HostListener('document:keydown.escape')
  alPresionarEscape(): void {
    if (this.abierto()) this.cerrarCuerpo();
  }

  /**
   * Nombre para el encabezado. El listado ya devuelve el asesor, asi que no
   * hace falta una segunda llamada; la fila del dashboard solo añade la carpeta
   * y el badge de SLA cuando se llegó navegando desde la tabla.
   */
  nombreAsesor(): string {
    return this.fila()?.asesor ?? this.listado()?.asesor.nombre ?? this.asesorId();
  }

  carpeta(): string | null {
    return this.fila()?.carpeta ?? this.listado()?.carpeta ?? null;
  }

  /** Estilo del badge de SLA, si la fila del dashboard trajo el nivel. */
  estiloNivel(): ReturnType<typeof estiloNivel> {
    return estiloNivel(this.fila()?.nivel ?? 'al_dia');
  }

  fecha(valor: string | null): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** "hace 3 min" junto al asunto; el instante exacto va en el `title`. */
  desde(valor: string | null): string {
    return tiempoRelativo(valor) ?? '—';
  }

  /** Instante exacto para el `title` de la celda. */
  tituloFecha(valor: string | null): string {
    return fechaCorta(valor) ?? '';
  }

  /** Rango visible de la pagina actual, para el contador de resultados. */
  rango(): string {
    const l = this.listado();
    if (!l || !l.total) return '';
    const desde = this.offset() + 1;
    const hasta = Math.min(this.offset() + this.limite, l.total);
    return `${desde}-${hasta} de ${numero(l.total)}`;
  }

  /** Cuenta del cubo activo. */
  cuentaCubo(): string | null {
    const cubo = this.cubo();
    if (!cubo) return null;
    const fila = this.fila();
    if (fila) {
      const def = CUBOS.find((c) => c.valor === cubo);
      if (def?.campo) {
        const v = fila[def.campo];
        return `${numero(v)} en total`;
      }
    }
    const l = this.listado();
    if (l) return `${numero(l.total)}`;
    return null;
  }

  num(v: number): string {
    return numero(v);
  }

  etiquetaCat(cat: string | null | undefined): string {
    return etiquetaCategoria(cat);
  }

  colorCat(cat: string | null | undefined): string {
    return colorCategoria(cat);
  }

  esPendienteCat(cat: string | null | undefined): boolean {
    return esCategoriaPendiente(cat);
  }
}