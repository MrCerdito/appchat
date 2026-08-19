import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FaqService, Faq, CreateFaqDto } from '../../../../core/services/faq.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-faq-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './faq-admin.component.html',
  styleUrl: './faq-admin.component.scss'
})
export class FaqAdminComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;

  faqs: Faq[] = [];
  faqsFiltradas: Faq[] = [];
  filtro = '';
  cargando = true;
  modalAbierto = false;
  editando: Faq | null = null;
  guardando = false;
  deletingId: number | null = null;
  eliminando = false;

  selectedIds = new Set<number>();
  showBulkConfirm = false;
  bulkDeleting = false;

  private clickStartedInside = false;
  private destroy$ = new Subject<void>();

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
    private notification: NotificationService,
  ) {}

  exportarCsv(): void {
    this.faqService.exportCsv().pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'faqs.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        this.notification.success('Éxito', 'Preguntas frecuentes exportadas correctamente');
      },
      error: () => this.notification.error('Error', 'No se pudo exportar'),
    });
  }

  importarCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.faqService.importCsv(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        let msg = `${res.imported} de ${res.total} preguntas importadas`;
        if (res.errors?.length) {
          msg += ` (${res.errors.length} con errores)`;
        }
        this.notification.success('Importación completa', msg);
        input.value = '';
        this.cargar(true);
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudo importar el archivo');
        input.value = '';
      },
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargar(bustCache = false): void {
    this.faqService.getAll(undefined, undefined, bustCache).pipe(takeUntil(this.destroy$)).subscribe({
      next: (faqs) => {
        this.faqs = faqs;
        this.filtrar();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('HTTP Error:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  filtrar(): void {
    const q = this.filtro.trim().toLowerCase();
    this.faqsFiltradas = q
      ? this.faqs.filter(f => f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q) || (f.categoria && f.categoria.toLowerCase().includes(q)))
      : this.faqs;
  }

  private aplicarFiltroYActualizar(): void {
    this.filtrar();
    this.cdr.detectChanges();
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
    if (event.target !== event.currentTarget) {
      this.clickStartedInside = true;
    }
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
      this.faqService.update(this.editando.id, dto).pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          const idx = this.faqs.findIndex(f => f.id === updated.id);
          if (idx !== -1) this.faqs[idx] = updated;
          this.notification.success('Éxito', 'Pregunta frecuente actualizada correctamente');
          this.cerrarModal();
          this.aplicarFiltroYActualizar();
        },
        error: (err) => {
          this.notification.error('Error', err.error?.message || 'No se pudo actualizar la pregunta frecuente');
          this.guardando = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.faqService.create(dto).pipe(takeUntil(this.destroy$)).subscribe({
        next: (created) => {
          this.faqs.unshift(created);
          this.notification.success('Éxito', 'Pregunta frecuente creada correctamente');
          this.cerrarModal();
          this.aplicarFiltroYActualizar();
        },
        error: (err) => {
          this.notification.error('Error', err.error?.message || 'No se pudo crear la pregunta frecuente');
          this.guardando = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  confirmarEliminar(id: number): void {
    if (this.eliminando) return;
    this.eliminando = true;
    this.faqService.remove(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.faqs = this.faqs.filter(f => f.id !== id);
        this.selectedIds.delete(id);
        this.notification.success('Éxito', 'Pregunta frecuente eliminada correctamente');
        this.deletingId = null;
        this.eliminando = false;
        this.aplicarFiltroYActualizar();
      },
      error: (err) => {
        if (err?.status === 404) {
          this.faqs = this.faqs.filter(f => f.id !== id);
          this.selectedIds.delete(id);
          this.notification.warning('Información', 'La pregunta frecuente ya fue eliminada o no existe');
        } else {
          this.notification.error('Error', err.error?.message || 'No se pudo eliminar la pregunta frecuente');
        }
        this.deletingId = null;
        this.eliminando = false;
        this.aplicarFiltroYActualizar();
      }
    });
  }

  get allSelected(): boolean {
    return this.faqsFiltradas.length > 0 && this.faqsFiltradas.every(f => this.selectedIds.has(f.id));
  }

  get someSelected(): boolean {
    return this.faqsFiltradas.some(f => this.selectedIds.has(f.id)) && !this.allSelected;
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.faqsFiltradas.forEach(f => this.selectedIds.delete(f.id));
    } else {
      this.faqsFiltradas.forEach(f => this.selectedIds.add(f.id));
    }
    this.cdr.detectChanges();
  }

  toggleSelect(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.cdr.detectChanges();
  }

  abrirBulkConfirm(): void {
    if (this.selectedIds.size === 0) return;
    this.showBulkConfirm = true;
  }

  cerrarBulkConfirm(): void {
    this.showBulkConfirm = false;
  }

  confirmarEliminacionMasiva(): void {
    if (this.bulkDeleting) return;
    this.bulkDeleting = true;
    const ids = Array.from(this.selectedIds);
    this.faqService.removeBulk(ids).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const deletedSet = new Set(ids);
        this.faqs = this.faqs.filter(f => !deletedSet.has(f.id));
        this.selectedIds.clear();
        this.notification.success('Éxito', `${res.deleted} preguntas eliminadas correctamente`);
        this.showBulkConfirm = false;
        this.bulkDeleting = false;
        this.aplicarFiltroYActualizar();
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudieron eliminar las preguntas');
        this.showBulkConfirm = false;
        this.bulkDeleting = false;
      }
    });
  }
}
