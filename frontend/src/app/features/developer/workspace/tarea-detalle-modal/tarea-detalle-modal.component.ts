import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { TareaService } from '../../../../core/services/tarea.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Tarea,
  TareaDetalle,
  TareaStatus,
  TareaPrioridad,
  TAREA_STATUS_META,
  TAREA_PRIORIDAD_META,
} from '../../../../core/models/tarea.model';

/** Fila ya aplanada del arbol, con la profundidad para la sangria visual. */
interface Nodo {
  tarea: Tarea;
  profundidad: number;
  tieneHijos: boolean;
}

/** Sangria maxima antes de dejar de anadir. Evita ramas ilegibles en pantalla. */
const PROFUNDIDAD_VISUAL_MAX = 5;

@Component({
  selector: 'app-tarea-detalle-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tarea-detalle-modal.html',
  styleUrl: './tarea-detalle-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TareaDetalleModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) tareaId!: string;
  /**
   * Contador que el padre incrementa para forzar una recarga.
   *
   * Sin esto el modal se quedaba con el `detalle` que cargo al abrirse: al
   * crear una subtarea desde aqui el padre solo recarga la lista, y el arbol
   * seguía sin mostrarla hasta que se cerraba y reabria la tarea.
   */
  @Input() refrescar = 0;
  @Output() cerrar = new EventEmitter<void>();
  /** Avisa al padre para que recargue la lista o el panel. */
  @Output() cambiado = new EventEmitter<void>();
  @Output() editar = new EventEmitter<Tarea>();
  /** Emite la tarea padre completa, para que el alta herede su ticket. */
  @Output() nuevaSubtarea = new EventEmitter<Tarea>();

  readonly statusMeta = TAREA_STATUS_META;
  readonly prioridadMeta = TAREA_PRIORIDAD_META;

  detalle: TareaDetalle | null = null;
  cargando = true;
  error = '';
  tab: 'subtareas' | 'comentarios' | 'tiempo' = 'subtareas';

  comentario = '';
  enviandoComentario = false;
  minutos = 60;
  notaTiempo = '';
  registrandoTiempo = false;
  guardandoEstado = false;

  /** Ids de nodos colapsados. Vacio = todo expandido. */
  private colapsados = new Set<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly tareas: TareaService,
    private readonly notif: NotificationService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  /**
   * El padre bumpea `refrescar` cuando se guarda el formulario de subtarea o la
   * edicion: en ese momento el id no cambia, asi que sin este hook la vista se
   * quedaria congelada. El primer cambio es el que trae el propio `ngOnInit`.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refrescar'] && !changes['refrescar'].firstChange) {
      this.cargar(true);
    }
  }

  cargar(silencioso = false): void {
    if (!silencioso) {
      this.cargando = true;
      this.cdr.markForCheck();
    }
    this.tareas
      .findOne(this.tareaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d) => {
          this.detalle = d;
          this.cargando = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.cargando = false;
          this.error = e?.error?.message ?? 'No se pudo cargar la tarea';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Permisos ─────────────────────────────────────────
  get esAdmin(): boolean {
    return this.auth.getUser()?.role === 'admin' || this.auth.getUser()?.role === 'superadmin';
  }

  get soyCreador(): boolean {
    return !!this.detalle && this.detalle.createdById === this.auth.getUser()?.id;
  }

  /** Admin, creador o asignado pueden mover el estado. */
  get puedeEditar(): boolean {
    if (this.esAdmin || this.soyCreador) return true;
    return (this.detalle?.asignados.length ?? 0) > 0;
  }

  // ── Encabezado ────────────────────────────────────────
  statusBadge(s: TareaStatus): string {
    return this.statusMeta.find((x) => x.key === s)?.badge ?? 'is-pendiente';
  }

  statusLabel(s: TareaStatus): string {
    return this.statusMeta.find((x) => x.key === s)?.label ?? s;
  }

  prioBadge(p: TareaPrioridad): string {
    return this.prioridadMeta[p]?.badge ?? 'pri-medium';
  }

  /** Cambia estado desde el desplegable del encabezado. */
  cambiarEstado(s: TareaStatus): void {
    if (!this.detalle || s === this.detalle.status || this.guardandoEstado) return;
    const previo = this.detalle.status;
    this.detalle.status = s;
    this.guardandoEstado = true;
    this.cdr.markForCheck();

    this.tareas
      .update(this.detalle.id, { status: s })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d) => {
          this.detalle = d;
          this.guardandoEstado = false;
          this.notif.success('Estado actualizado');
          this.cambiado.emit();
          this.cdr.markForCheck();
        },
        error: (e) => {
          // `detalle` se capturo antes del PATCH: si algo lo limpio, no se toca.
          if (this.detalle) this.detalle.status = previo;
          this.guardandoEstado = false;
          this.notif.error(e?.error?.message ?? 'No se pudo cambiar el estado');
          this.cdr.markForCheck();
        },
      });
  }

  editarTarea(): void {
    if (this.detalle) this.editar.emit(this.detalle);
  }

  // ── Arbol de subtareas ────────────────────────────────
  /**
   * Aplana `detalle.arbol` en filas. Un nodo se omite cuando su padre esta
   * colapsado, asi que basta con saltar los hijos de los colapsados.
   */
  get nodos(): Nodo[] {
    const out: Nodo[] = [];
    const roots = this.detalle?.arbol ?? [];
    for (const r of roots) this.aplanar(r, 0, out);
    return out;
  }

  private aplanar(t: Tarea, profundidad: number, out: Nodo[]): void {
    const hijos = t.hijos ?? [];
    out.push({
      tarea: t,
      profundidad: Math.min(profundidad, PROFUNDIDAD_VISUAL_MAX),
      tieneHijos: hijos.length > 0,
    });

    if (this.colapsados.has(t.id)) return;
    for (const h of hijos) this.aplanar(h, profundidad + 1, out);
  }

  toggle(id: string): void {
    if (this.colapsados.has(id)) this.colapsados.delete(id);
    else this.colapsados.add(id);
    this.cdr.markForCheck();
  }

  colapsado(id: string): boolean {
    return this.colapsados.has(id);
  }

  /**
   * Progreso de todo el subarbol de un nodo, no solo el nivel directo. Los
   * contadores del backend solo miran descendientes; `totalRaiz` y
   * `completadasRaiz` hacen el +1 de la tarea abierta por separado.
   */
  rollup(id: string, campo: 'total' | 'completadas'): number {
    if (!this.detalle) return 0;
    const t = id === this.detalle.id ? this.detalle : this.buscar(id);
    return t ? t.subtareas[campo] : 0;
  }

  /** Total del subarbol incluyendo la tarea abierta. */
  get totalRaiz(): number {
    return this.detalle ? this.detalle.subtareas.total + 1 : 0;
  }

  /** Completadas del subarbol incluyendo la tarea abierta. */
  get completadasRaiz(): number {
    if (!this.detalle) return 0;
    return this.detalle.subtareas.completadas + (this.estaCompletada(this.detalle) ? 1 : 0);
  }

  get porcentajeRaiz(): number {
    if (!this.totalRaiz) return 0;
    return Math.round((this.completadasRaiz / this.totalRaiz) * 100);
  }

  private estaCompletada(t: Tarea): boolean {
    return t.status === 'completada';
  }

  private buscar(id: string): Tarea | null {
    const d = this.detalle;
    if (!d) return null;
    if (d.id === id) return d;
    const recorre = (lista: Tarea[]): Tarea | null => {
      for (const t of lista) {
        if (t.id === id) return t;
        const r = recorre(t.hijos ?? []);
        if (r) return r;
      }
      return null;
    };
    return recorre(d.arbol);
  }

  /** Marca una subtarea como completada o la revierte, sin abrir el formulario. */
  alternarCompletada(t: Tarea): void {
    if (!this.puedeEditar) return;
    const estabaCompletada = this.estaCompletada(t);
    const nuevo = estabaCompletada ? 'en_progreso' : 'completada';

    this.tareas
      .update(t.id, { status: nuevo })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notif.success(estabaCompletada ? 'Subtarea reabierta' : 'Subtarea completada');
          this.cargar(true);
          this.cambiado.emit();
        },
        error: (e) => this.notif.error(e?.error?.message ?? 'No se pudo actualizar'),
      });
  }

  // ── Comentarios ───────────────────────────────────────
  puedeComentar(): boolean {
    return !!this.comentario.trim() && !this.enviandoComentario;
  }

  enviarComentario(): void {
    if (!this.puedeComentar() || !this.detalle) return;
    const texto = this.comentario.trim();
    this.enviandoComentario = true;
    this.cdr.markForCheck();

    this.tareas
      .addComment(this.detalle.id, texto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.comentario = '';
          this.enviandoComentario = false;
          this.cargar(true);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.enviandoComentario = false;
          this.notif.error(e?.error?.message ?? 'No se pudo comentar');
          this.cdr.markForCheck();
        },
      });
  }

  // ── Tiempo ────────────────────────────────────────────
  puedeRegistrar(): boolean {
    return this.minutos > 0 && !this.registrandoTiempo;
  }

  registrarTiempo(): void {
    if (!this.puedeRegistrar() || !this.detalle) return;
    this.registrandoTiempo = true;
    this.cdr.markForCheck();

    this.tareas
      .addTime(this.detalle.id, {
        minutos: Number(this.minutos),
        nota: this.notaTiempo.trim() || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.notaTiempo = '';
          this.registrandoTiempo = false;
          this.notif.success(`${r.minutos} min registrados · total ${r.totalMinutos} min`);
          this.cargar(true);
          this.cambiado.emit();
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.registrandoTiempo = false;
          this.notif.error(e?.error?.message ?? 'No se pudo registrar el tiempo');
          this.cdr.markForCheck();
        },
      });
  }

  quitarTiempo(entryId: string): void {
    if (!this.detalle || !this.esAdmin) return;
    this.tareas
      .removeTime(this.detalle.id, entryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.notif.success(`Registro eliminado · total ${r.totalMinutos} min`);
          this.cargar(true);
          this.cambiado.emit();
        },
        error: (e) => this.notif.error(e?.error?.message ?? 'No se pudo eliminar'),
      });
  }

  // ── Utilidades ────────────────────────────────────────
  formatTiempo(min: number): string {
    if (!min) return '0m';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
  }

  onOverlay(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.cerrar.emit();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') this.cerrar.emit();
  }
}