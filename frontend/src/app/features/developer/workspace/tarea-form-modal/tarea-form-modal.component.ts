import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { TareaService } from '../../../../core/services/tarea.service';
import { ModuloService } from '../../../../core/services/modulo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/models/user.model';
import { Modulo } from '../../../../core/models/modulo.model';
import {
  Tarea,
  TareaStatus,
  TareaPrioridad,
  TareaCreateDto,
  TareaUpdateDto,
  TAREA_STATUS_META,
  TAREA_PRIORIDADES,
} from '../../../../core/models/tarea.model';

/**
 * Alta y edicion de una tarea.
 *
 * El mismo modal sirve para crear una subtarea: si entra `parentTaskId`, el
 * bloque de subtareas queda bloqueado y el padre se manda en el POST. El
 * backend no admite reparentado, asi que en edicion ese bloque no se muestra.
 */
@Component({
  selector: 'app-tarea-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tarea-form-modal.html',
  styleUrl: './tarea-form-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TareaFormModalComponent implements OnInit {
  @Input() tarea: Tarea | null = null;
  @Input() parentTaskId: string | null = null;
  @Input() parentRuta = '';
  @Input() ticketId: string | null = null;

  @Output() cerrar = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<void>();

  readonly statusMeta = TAREA_STATUS_META;
  readonly prioridades = TAREA_PRIORIDADES;

  titulo = '';
  descripcion = '';
  status: TareaStatus = 'pendiente';
  prioridad: TareaPrioridad = 'medium';
  moduloId = '';
  /** Fecha y hora locales en formato `YYYY-MM-DDTHH:mm`, el que usa `input[type=datetime-local]`. */
  dueDate = '';
  tagsInput = '';
  tagInput = '';

  /** Ids de responsables. Array y no Set porque es lo que espera el DTO. */
  selected: string[] = [];
  desarrolladores: User[] = [];
  modulos: Modulo[] = [];

  guardando = false;
  error = '';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly tareasService: TareaService,
    private readonly moduloService: ModuloService,
    private readonly notif: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get esEdicion(): boolean {
    return !!this.tarea;
  }

  get esSubtarea(): boolean {
    return !this.esEdicion && !!this.parentTaskId;
  }

  get tituloModal(): string {
    if (this.esSubtarea) return 'Nueva subtarea';
    return this.esEdicion ? 'Editar tarea' : 'Nueva tarea';
  }

  get prioridadLabel(): string {
    return (
      { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' } as Record<
        string,
        string
      >
    )[this.prioridad];
  }

  get moduloSeleccionado(): Modulo | null {
    return this.modulos.find((m) => m.id === this.moduloId) ?? null;
  }

  /**
   * Responsables que se ofrecen.
   *
   * Con modulo elegido solo se ofrecen los de ese modulo: quien asigna quiere
   * repartir el trabajo dentro del ambito del modulo, no entre todo el equipo.
   * Sin modulo se cae a la lista completa de desarrolladores activos.
   *
   * Un modulo sin responsables devuelve lista vacia (no todos): si no, el hint
   * "este modulo no tiene" no apareceria nunca y se podrian asignar personas de
   * otros modulos por error.
   */
  get responsablesVisibles(): User[] {
    const mod = this.moduloSeleccionado;
    return mod ? (mod.desarrolladores ?? []) : this.desarrolladores;
  }

  /** Al cambiar de modulo se descartan los responsables que ya no se ofrecen. */
  alCambiarModulo(): void {
    if (this.esEdicion) return;

    const visibles = new Set(this.responsablesVisibles.map((d) => d.id));
    const antes = this.selected.length;
    this.selected = this.selected.filter((id) => visibles.has(id));
    if (this.selected.length !== antes) this.cdr.markForCheck();
  }

  ngOnInit(): void {
    // Solo se cargan si hacen falta: el selector de responsables solo aparece en
    // alta, y en edicion el bloque de subtareas no existe.
    if (!this.esEdicion) {
      this.moduloService
        .getDesarrolladores()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          // El endpoint ya devuelve solo `role = 'desarrollador'` y `active`, y
          // sin el campo `role` en la respuesta. Filtrar por `u.role` aqui
          // dejaba siempre la lista vacia.
          next: (us) => {
            this.desarrolladores = us;
            this.cdr.markForCheck();
          },
          error: () => {
            this.desarrolladores = [];
            this.cdr.markForCheck();
          },
        });
    }

    this.moduloService
      .getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (m) => {
          this.modulos = m;
          this.cdr.markForCheck();
        },
        error: () => {
          this.modulos = [];
          this.cdr.markForCheck();
        },
      });

    if (this.tarea) {
      const t = this.tarea;
      this.titulo = t.titulo;
      this.descripcion = t.descripcion ?? '';
      this.status = t.status;
      this.prioridad = t.prioridad;
      this.moduloId = t.moduloId ?? '';
      this.selected = t.asignados.map((a) => a.userId);
      this.dueDate = this.aLocal(t.dueDate);
      this.tagsInput = t.tags.join(', ');
    }
  }

  /** ISO -> `YYYY-MM-DDTHH:mm` en hora local, que es lo que espera el input. */
  private aLocal(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  }

  // ── Etiquetas ─────────────────────────────────────────
  addTag(): void {
    const raw = this.tagInput.trim().replace(/^#+/, '');
    if (!raw) return;
    const ya = this.tagsActuales();
    if (ya.some((t) => t.toLowerCase() === raw.toLowerCase())) {
      this.tagInput = '';
      return;
    }
    if (ya.length >= 20) {
      this.notif.warning('Maximo 20 etiquetas por tarea');
      this.tagInput = '';
      return;
    }
    this.tagsInput = ya.join(', ');
    this.tagInput = '';
  }

  onTagKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      this.addTag();
    } else if (ev.key === 'Backspace' && !this.tagInput && this.tagsInput) {
      const ya = this.tagsActuales();
      ya.pop();
      this.tagsInput = ya.join(', ');
    }
  }

  removeTag(t: string): void {
    this.tagsInput = this.tagsActuales()
      .filter((x) => x !== t)
      .join(', ');
  }

  tagsActuales(): string[] {
    return this.tagsInput
      .split(',')
      .map((s) => s.trim().replace(/^#+/, ''))
      .filter(Boolean);
  }

  get tags(): string[] {
    return this.tagsActuales();
  }

  // ── Responsables ──────────────────────────────────────
  toggleUser(id: string): void {
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else this.selected.push(id);
  }

  isSelected(id: string): boolean {
    return this.selected.includes(id);
  }

  nombreDe(id: string): string {
    const lista = this.responsablesVisibles;
    return (
      lista.find((d) => d.id === id)?.name ??
      this.desarrolladores.find((d) => d.id === id)?.name ??
      'Usuario'
    );
  }

  // ── Guardado ──────────────────────────────────────────
  puedeGuardar(): boolean {
    return this.titulo.trim().length > 0 && !this.guardando;
  }

  guardar(): void {
    if (!this.puedeGuardar()) return;

    const dueDate = this.dueDate ? new Date(this.dueDate).toISOString() : null;
    this.guardando = true;
    this.error = '';

    if (this.esEdicion) {
      const dto: TareaUpdateDto = {
        titulo: this.titulo.trim(),
        descripcion: this.descripcion.trim() || null,
        status: this.status,
        prioridad: this.prioridad,
        moduloId: this.moduloId || null,
        asignados: this.selected,
        tags: this.tags,
        dueDate,
      };

      this.tareasService
        .update(this.tarea!.id, dto)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.guardando = false;
            this.notif.success('Tarea actualizada');
            this.guardado.emit();
          },
          error: (e) => this.fallar(e),
        });
      return;
    }

    const dto: TareaCreateDto = {
      titulo: this.titulo.trim(),
      descripcion: this.descripcion.trim() || undefined,
      status: this.status,
      prioridad: this.prioridad,
      moduloId: this.moduloId || undefined,
      asignados: this.selected.length ? this.selected : undefined,
      tags: this.tags.length ? this.tags : undefined,
      dueDate: dueDate ?? undefined,
      parentTaskId: this.parentTaskId ?? undefined,
      ticketId: this.ticketId ?? undefined,
    };

    this.tareasService
      .create(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (t) => {
          this.guardando = false;
          this.notif.success(this.esSubtarea ? 'Subtarea creada' : `Tarea ${t.codigo} creada`);
          this.guardado.emit();
        },
        error: (e) => this.fallar(e),
      });
  }

  private fallar(e: any): void {
    this.guardando = false;
    this.error = e?.error?.message ?? 'No se pudo guardar la tarea';
    this.cdr.markForCheck();
  }

  onOverlay(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget && !this.guardando) this.cerrar.emit();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && !this.guardando) this.cerrar.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(ev: KeyboardEvent): void {
    // Ctrl+Enter guarda desde cualquier foco del formulario, incluido el textarea.
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && this.puedeGuardar()) {
      ev.preventDefault();
      this.guardar();
    }
  }
}
