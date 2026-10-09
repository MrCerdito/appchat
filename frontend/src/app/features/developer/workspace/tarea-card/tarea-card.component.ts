import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tarea, TAREA_STATUS_META, TAREA_PRIORIDAD_META } from '../../../../core/models/tarea.model';

/**
 * Tarjeta de tarea, compartida por el panel y el kanban.
 *
 * Solo usa tokens globales, asi que el tema oscuro llega sin codigo extra.
 */
@Component({
  selector: 'app-tarea-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tarea-card.html',
  styleUrl: './tarea-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TareaCardComponent {
  @Input({ required: true }) tarea!: Tarea;
  /** Oculta el chip de ticket cuando la vista ya agrupa por ticket. */
  @Input() mostrarTicket = true;
  @Output() abrir = new EventEmitter<Tarea>();

  readonly statusMeta = TAREA_STATUS_META;
  readonly prioridadMeta = TAREA_PRIORIDAD_META;

  get statusBadge(): string {
    return this.statusMeta.find((s) => s.key === this.tarea.status)?.badge ?? 'is-pendiente';
  }

  get prioridadBadge(): string {
    return this.prioridadMeta[this.tarea.prioridad]?.badge ?? 'p-medium';
  }

  get prioridadLabel(): string {
    return this.prioridadMeta[this.tarea.prioridad]?.label ?? 'Media';
  }

  /** `vencida` alimenta el borde rojo; `proxima` el ambar. */
  get vencimiento(): 'vencida' | 'proxima' | null {
    if (!this.tarea.dueDate || this.tarea.status === 'completada') return null;
    const restante = new Date(this.tarea.dueDate).getTime() - Date.now();
    if (restante < 0) return 'vencida';
    if (restante < 24 * 3600_000) return 'proxima';
    return null;
  }

  get subtareasPct(): number {
    const { total, completadas } = this.tarea.subtareas ?? { total: 0, completadas: 0 };
    return total ? Math.round((completadas / total) * 100) : 0;
  }

  get tieneSubtareas(): boolean {
    return (this.tarea.subtareas?.total ?? 0) > 0;
  }

  onClick(): void {
    this.abrir.emit(this.tarea);
  }
}