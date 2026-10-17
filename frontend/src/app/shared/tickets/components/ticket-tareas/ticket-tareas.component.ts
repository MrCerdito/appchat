import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { TareaService } from '../../../../core/services/tarea.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TareaFormModalComponent } from '../../../../features/developer/workspace/tarea-form-modal/tarea-form-modal.component';
import { TareaDetalleModalComponent } from '../../../../features/developer/workspace/tarea-detalle-modal/tarea-detalle-modal.component';
import {
  Tarea,
  TareaStatus,
  TareaProgresoTicket,
  TAREA_STATUS_META,
} from '../../../../core/models/tarea.model';

/**
 * Bloque de tareas dentro del detalle del ticket.
 *
 * Es una vista de solo lectura resumida mas el alta rapida: el trabajo a fondo
 * (arbol de subtareas, comentarios, tiempo) vive en el workspace de tareas. El
 * backend ya limita a `ticketId` y aplica visibilidad, asi que no hace falta
 * filtrar nada aqui.
 */
@Component({
  selector: 'app-ticket-tareas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TareaFormModalComponent,
    TareaDetalleModalComponent,
  ],
  templateUrl: './ticket-tareas.html',
  styleUrl: './ticket-tareas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketTareasComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) ticketId!: string;

  readonly statusMeta = TAREA_STATUS_META;

  tareas: Tarea[] = [];
  progreso: TareaProgresoTicket | null = null;
  cargando = true;
  error = '';
  soloRaices = false;

  formAbierto = false;
  formTarea: Tarea | null = null;
  formPadreId: string | null = null;
  detalleId: string | null = null;
  /** Se incrementa al guardar para que el detalle abierto recargue su arbol. */
  detalleRefresco = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly tareasService: TareaService,
    private readonly notif: NotificationService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(ch: SimpleChanges): void {
    // El modal de ticket reutiliza el mismo componente para otro ticket, asi que
    // hay que reaccionar al cambio de id y no solo al primer render.
    // El primer cambio tambien carga: el componente nace cuando se abre un
    // ticket y ese primer render es el que trae el id real.
    const cambio = ch['ticketId'];
    if (cambio && cambio.currentValue) this.cargar();
  }

  get esAdmin(): boolean {
    const r = this.auth.getUser()?.role;
    return r === 'admin' || r === 'superadmin';
  }

  get porcentaje(): number {
    return this.progreso?.porcentaje ?? 0;
  }

  /** Getter aparte: `@if (progreso?.total)` no estrecha `progreso` dentro. */
  get total(): number {
    return this.progreso?.total ?? 0;
  }

  get resumen(): string {
    if (!this.progreso || !this.progreso.total) return 'Sin tareas';
    return `${this.progreso.completadas} de ${this.progreso.total}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────── DATOS ───────────────────────────────

  cargar(silencioso = false): void {
    if (!this.ticketId) return;
    if (!silencioso) {
      this.cargando = true;
      this.cdr.markForCheck();
    }

    this.tareasService
      .findAll({
        ticketId: this.ticketId,
        soloRaiz: this.soloRaices,
        limit: 50,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.tareas = r.items;
          this.cargando = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.cargando = false;
          this.error = e?.error?.message ?? 'No se pudieron cargar las tareas';
          this.cdr.markForCheck();
        },
      });

    this.tareasService
      .progresoTicket(this.ticketId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (p) => {
          this.progreso = p;
          this.cdr.markForCheck();
        },
        error: () => {
          this.progreso = null;
          this.cdr.markForCheck();
        },
      });
  }

  // ─────────────────────────────── ACCIONES ────────────────────────────

  abrirDetalle(t: Tarea): void {
    this.detalleId = t.id;
  }

  cerrarDetalle(): void {
    this.detalleId = null;
  }

  onDetalleCambiado(): void {
    this.cargar(true);
  }

  editar(t: Tarea): void {
    this.formTarea = t;
    this.formPadreId = null;
    this.formAbierto = true;
  }

  abrirNueva(): void {
    this.formTarea = null;
    this.formPadreId = null;
    this.formAbierto = true;
  }

  /** Subtarea de una tarea de este mismo ticket: hereda su ticket. */
  abrirSubtarea(padre: Tarea): void {
    this.formTarea = null;
    this.formPadreId = padre.id;
    this.formAbierto = true;
  }

  cerrarForm(): void {
    this.formAbierto = false;
    this.formTarea = null;
    this.formPadreId = null;
  }

  onGuardado(): void {
    this.cerrarForm();
    this.detalleRefresco++;
    this.cargar(true);
  }

  /** Alterna completada/abierta sin salir del ticket. */
  alternarCompletada(t: Tarea): void {
    const estabaCompletada = t.status === 'completada';
    const nuevo: TareaStatus = estabaCompletada ? 'en_progreso' : 'completada';

    this.tareasService
      .update(t.id, { status: nuevo })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notif.success(estabaCompletada ? 'Tarea reabierta' : 'Tarea completada');
          this.cargar(true);
        },
        error: (e) => this.notif.error(e?.error?.message ?? 'No se pudo actualizar'),
      });
  }

  // ─────────────────────────────── UTILIDADES ──────────────────────────

  statusBadge(s: TareaStatus): string {
    return this.statusMeta.find((x) => x.key === s)?.badge ?? 'is-pendiente';
  }

  statusLabel(s: TareaStatus): string {
    return this.statusMeta.find((x) => x.key === s)?.label ?? s;
  }

  trackById(_i: number, t: Tarea): string {
    return t.id;
  }
}