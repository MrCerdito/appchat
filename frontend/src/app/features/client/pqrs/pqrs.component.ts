import { Component, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PqrsService, CreatePqrsPayload } from '../../../core/services/pqrs.service';
import { trackByIndex } from '../../../shared/utils/track-by';

@Component({
  selector: 'app-pqrs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pqrs.component.html',
  styleUrl: './pqrs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PqrsComponent {
  protected readonly trackByIndex = trackByIndex;

  @Output() volver = new EventEmitter<void>();
  @Output() enviado = new EventEmitter<string>();

  tipo = '';
  asunto = '';
  descripcion = '';
  nombre = '';
  apellido = '';
  identificacion = '';
  email = '';
  telefono = '';
  colegio = '';
  submitted = false;
  enviando = false;
  errorMsg = '';

  readonly tipos = [
    { value: 'peticion',   label: 'Petición',   icon: 'petition' },
    { value: 'queja',      label: 'Queja',       icon: 'complaint' },
    { value: 'reclamo',    label: 'Reclamo',     icon: 'claim' },
    { value: 'sugerencia', label: 'Sugerencia',  icon: 'suggestion' },
  ];

  constructor(
    private pqrsService: PqrsService,
    private cdr: ChangeDetectorRef,
  ) {}

  onIdentificacionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/[^0-9]/g, '');
    if (input.value !== cleaned) {
      input.value = cleaned;
      this.identificacion = cleaned;
    }
  }

  isValid(): boolean {
    return !!(this.tipo && this.asunto.trim() && this.descripcion.trim() && this.nombre.trim());
  }

  enviar(): void {
    this.submitted = true;
    if (!this.isValid() || this.enviando) return;

    this.enviando = true;
    this.errorMsg = '';

    const payload: CreatePqrsPayload = {
      tipo: this.tipo,
      asunto: this.asunto.trim(),
      descripcion: this.descripcion.trim(),
      nombre: this.nombre.trim(),
    };
    if (this.apellido.trim()) payload.apellido = this.apellido.trim();
    if (this.identificacion.trim()) payload.identificacion = this.identificacion.trim();
    if (this.email.trim()) payload.email = this.email.trim();
    if (this.telefono.trim()) payload.telefono = this.telefono.trim();
    if (this.colegio.trim()) payload.colegio = this.colegio.trim();

    this.pqrsService.create(payload).subscribe({
      next: (res) => {
        this.enviando = false;
        this.enviado.emit(res.codigo);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.enviando = false;
        this.errorMsg = err.error?.message || 'Error al enviar. Intenta de nuevo.';
        this.cdr.detectChanges();
      },
    });
  }
}
