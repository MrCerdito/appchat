import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FaqService, Faq, CreateFaqDto } from '../../../../core/services/faq.service';
import { trackByIndex } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-faq-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="faq-admin">
      <div class="faq-admin-header">
        <h2>Gestión de Preguntas Frecuentes</h2>
        <button class="btn-add" (click)="abrirModal()">+ Nueva FAQ</button>
      </div>

      <div class="faq-admin-search">
        <input type="text" [(ngModel)]="filtro" placeholder="Buscar preguntas..." (input)="filtrar()" />
      </div>

      <div class="faq-admin-table" *ngIf="!cargando; else loading">
        <div class="faq-row" *ngFor="let faq of faqsFiltradas; trackBy: trackByIndex">
          <div class="faq-row-info">
            <strong>{{ faq.pregunta }}</strong>
            <span class="faq-row-meta">
              <span class="faq-cat-badge" *ngIf="faq.categoria">{{ faq.categoria }}</span>
              <span class="faq-ord">Orden: {{ faq.orden }}</span>
              <span class="faq-status" [class.inactive]="!faq.activo">{{ faq.activo ? 'Activo' : 'Inactivo' }}</span>
            </span>
          </div>
          <div class="faq-row-actions">
            <button class="btn-edit" (click)="abrirModal(faq)">✏️</button>
            <button class="btn-delete" (click)="eliminar(faq.id)">🗑️</button>
          </div>
        </div>
        <div class="faq-empty" *ngIf="faqsFiltradas.length === 0">
          <p>No hay preguntas frecuentes. Crea la primera.</p>
        </div>
      </div>
    </div>

    <div class="modal-overlay" *ngIf="modalAbierto" (mousedown)="onOverlayMousedown($event)" (click)="onOverlayClick($event)">
      <div class="modal-content" (mousedown)="onContentMousedown($event)" (click)="$event.stopPropagation()">
        <h3>{{ editando ? 'Editar FAQ' : 'Nueva FAQ' }}</h3>

        <div class="modal-field">
          <label>Pregunta *</label>
          <input type="text" [(ngModel)]="form.pregunta" maxlength="500" />
        </div>

        <div class="modal-field">
          <label>Respuesta *</label>
          <textarea [(ngModel)]="form.respuesta" rows="4"></textarea>
        </div>

        <div class="modal-field-row">
          <div class="modal-field">
            <label>Categoría</label>
            <input type="text" [(ngModel)]="form.categoria" placeholder="Ej: Matrícula, Pagos..." />
          </div>
          <div class="modal-field">
            <label>Orden</label>
            <input type="number" [(ngModel)]="form.orden" />
          </div>
        </div>

        <div class="modal-field">
          <label>Keywords (separadas por coma)</label>
          <input type="text" [(ngModel)]="form.keywordsStr" placeholder="Ej: matricula, inscripcion, costo" />
        </div>

        <div class="modal-check">
          <input type="checkbox" [(ngModel)]="form.activo" id="faq-activo" />
          <label for="faq-activo">Activo</label>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" (click)="cerrarModal()">Cancelar</button>
          <button class="btn-save" (click)="guardar()" [disabled]="!form.pregunta || !form.respuesta || guardando">
            {{ guardando ? 'Guardando...' : (editando ? 'Actualizar' : 'Crear') }}
          </button>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="faq-loading">Cargando...</div>
    </ng-template>
  `,
  styles: [`
    .faq-admin { padding: 1.5rem; font-family: 'DM Sans', sans-serif; }
    .faq-admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .faq-admin-header h2 { margin: 0; font-size: 1.1rem; }
    .btn-add { padding: 0.5rem 1rem; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 0.85rem; }
    .faq-admin-search { margin-bottom: 1rem; }
    .faq-admin-search input { width: 100%; padding: 0.6rem 0.85rem; border: 1px solid #e2ddd8; border-radius: 8px; font-family: inherit; font-size: 0.85rem; box-sizing: border-box; }
    .faq-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border: 1px solid #e2ddd8; border-radius: 10px; margin-bottom: 0.4rem; background: #fff; }
    .faq-row-info strong { font-size: 0.85rem; display: block; margin-bottom: 4px; }
    .faq-row-meta { display: flex; gap: 0.5rem; align-items: center; font-size: 0.72rem; color: #6b6560; }
    .faq-cat-badge { background: #f0ede9; padding: 2px 8px; border-radius: 10px; }
    .faq-status { color: #15803d; font-weight: 500; &.inactive { color: #dc2626; } }
    .faq-row-actions { display: flex; gap: 0.3rem; }
    .faq-row-actions button { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 6px; &:hover { background: #f0ede9; } }
    .faq-empty { text-align: center; padding: 2rem; color: #6b6560; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: #fff; border-radius: 16px; padding: 1.5rem; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
    .modal-content h3 { margin: 0 0 1rem; font-size: 1rem; }
    .modal-field { margin-bottom: 0.75rem; }
    .modal-field label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 4px; color: #333; }
    .modal-field input, .modal-field textarea { width: 100%; padding: 0.55rem 0.75rem; border: 1px solid #e2ddd8; border-radius: 8px; font-family: inherit; font-size: 0.85rem; box-sizing: border-box; }
    .modal-field textarea { resize: vertical; min-height: 80px; }
    .modal-field-row { display: flex; gap: 0.75rem; }
    .modal-field-row .modal-field { flex: 1; }
    .modal-check { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
    .modal-check input { width: auto; }
    .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    .btn-cancel, .btn-save { padding: 0.55rem 1.25rem; border-radius: 8px; font-family: inherit; font-size: 0.85rem; cursor: pointer; border: none; }
    .btn-cancel { background: #f0ede9; color: #333; }
    .btn-save { background: #1a1a1a; color: #fff; &:disabled { opacity: 0.4; cursor: not-allowed; } }
    .faq-loading { text-align: center; padding: 2rem; color: #6b6560; }
  `]
})
export class FaqAdminComponent implements OnInit {
  protected readonly trackByIndex = trackByIndex;

  faqs: Faq[] = [];
  faqsFiltradas: Faq[] = [];
  filtro = '';
  cargando = true;
  modalAbierto = false;
  editando: Faq | null = null;
  guardando = false;

  private clickStartedInside = false;

  form = {
    pregunta: '',
    respuesta: '',
    categoria: '',
    orden: 0,
    keywordsStr: '',
    activo: true,
  };

  constructor(
    private faqService: FaqService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.faqService.getAll().subscribe(faqs => {
      this.faqs = faqs;
      this.filtrar();
      this.cargando = false;
      this.cdr.detectChanges();
    });
  }

  filtrar(): void {
    const q = this.filtro.trim().toLowerCase();
    this.faqsFiltradas = q
      ? this.faqs.filter(f => f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q))
      : this.faqs;
  }

  abrirModal(faq?: Faq): void {
    if (faq) {
      this.editando = faq;
      this.form = {
        pregunta: faq.pregunta,
        respuesta: faq.respuesta,
        categoria: faq.categoria || '',
        orden: faq.orden,
        keywordsStr: (faq.keywords || []).join(', '),
        activo: faq.activo,
      };
    } else {
      this.editando = null;
      this.form = { pregunta: '', respuesta: '', categoria: '', orden: 0, keywordsStr: '', activo: true };
    }
    this.modalAbierto = true;
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.editando = null;
    this.guardando = false;
  }

  onOverlayMousedown(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.clickStartedInside = false;
    }
  }

  onContentMousedown(event: MouseEvent): void {
    this.clickStartedInside = true;
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.clickStartedInside) {
      this.cerrarModal();
    }
    this.clickStartedInside = false;
  }

  guardar(): void {
    if (this.guardando) return;
    this.guardando = true;

    const dto: CreateFaqDto = {
      pregunta: this.form.pregunta,
      respuesta: this.form.respuesta,
      categoria: this.form.categoria?.trim() || undefined,
      orden: this.form.orden,
      keywords: this.form.keywordsStr ? this.form.keywordsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      activo: this.form.activo,
    };

    if (this.editando) {
      this.faqService.update(this.editando.id, dto).subscribe({
        next: () => {
          this.cerrarModal();
          this.cargar();
        },
        error: () => {
          this.guardando = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.faqService.create(dto).subscribe({
        next: () => {
          this.cerrarModal();
          this.cargar();
        },
        error: () => {
          this.guardando = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  eliminar(id: number): void {
    if (confirm('¿Eliminar esta pregunta frecuente?')) {
      this.faqService.remove(id).subscribe(() => this.cargar());
    }
  }
}
