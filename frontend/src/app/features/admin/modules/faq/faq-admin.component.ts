import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FaqService, Faq, CreateFaqDto, FaqCategory, CreateFaqCategoryDto } from '../../../../core/services/faq.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex } from '../../../../shared/utils/track-by';
import { formatFaqText } from '../../../../shared/utils/faq-format';

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

  @ViewChild('respuestaTextarea') respuestaTextarea!: ElementRef<HTMLTextAreaElement>;

  faqs: Faq[] = [];
  faqsFiltradas: Faq[] = [];
  filtro = '';
  cargando = true;
  modalAbierto = false;
  editando: Faq | null = null;
  guardando = false;
  deletingId: number | null = null;
  eliminando = false;
  showPreview = false;

  selectedIds = new Set<number>();
  showBulkConfirm = false;
  bulkDeleting = false;

  // ── Categorías (faq_categories) ──────────────────────────────────────────
  categorias: FaqCategory[] = [];
  categoriasCargando = false;
  categoriasModal = false;
  editandoCategoria: FaqCategory | null = null;
  categoriaFormVisible = false;
  guardandoCategoria = false;
  formCategoria = { name: '', icon: 'HelpCircle', description: '', roles: [] as string[], orden: 0, activo: true };
  iconosDisponibles: string[] = [
    'GraduationCap', 'BookOpen', 'Smartphone', 'TabletSmartphone', 'MonitorSmartphone',
    'Shield', 'ShieldCheck', 'Lock', 'LockKeyhole', 'MessageCircle', 'MessageCircleMore',
    'Headphones', 'HelpCircle', 'FileText', 'Users', 'UsersRound', 'Settings',
    'CreditCard', 'Phone',
  ];

  // Roles disponibles en la plataforma para filtrar FAQ por rol.
  rolesDisponibles: { value: string; label: string }[] = [
    { value: 'estudiante', label: 'Estudiante' },
    { value: 'docente', label: 'Docente' },
    { value: 'padre', label: 'Padre/Acudiente' },
    { value: 'administrador', label: 'Administrador' },
  ];

  private clickStartedInside = false;
  private destroy$ = new Subject<void>();

  form = {
    pregunta: '',
    respuesta: '',
    categoria: '',
    orden: 0,
    keywordsStr: '',
    roles: [] as string[],
    activo: true,
  };

  constructor(
    private faqService: FaqService,
    private cdr: ChangeDetectorRef,
    private notification: NotificationService,
    private sanitizer: DomSanitizer,
  ) {}

  exportarExcel(): void {
    this.faqService.exportXlsx().pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'faqs.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.notification.success('Éxito', 'Preguntas frecuentes exportadas correctamente');
      },
      error: () => this.notification.error('Error', 'No se pudo exportar'),
    });
  }

  importarExcel(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.faqService.importXlsx(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        let msg = `${res.imported} de ${res.total} preguntas importadas`;
        if (res.skipped > 0) {
          msg += ` (${res.skipped} duplicada${res.skipped !== 1 ? 's' : ''} omitida${res.skipped !== 1 ? 's' : ''})`;
        }
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

  private cargar(_bustCache = true): void {
    this.faqService.getAll(undefined, undefined, true).pipe(takeUntil(this.destroy$)).subscribe({
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
    this.cargarCategorias();
  }

  cargarCategorias(): void {
    this.categoriasCargando = true;
    this.faqService.getCategoryList(true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (cats) => {
        this.categorias = (cats || []).sort((a, b) => a.orden - b.orden);
        this.categoriasCargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.categoriasCargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ── CRUD categorías ──────────────────────────────────────────────────────

  abrirModalCategoria(cat?: FaqCategory): void {
    if (cat) {
      this.editandoCategoria = cat;
      this.categoriaFormVisible = true;
      this.formCategoria = {
        name: cat.name,
        icon: cat.icon || 'HelpCircle',
        description: cat.description || '',
        roles: cat.roles || [],
        orden: cat.orden,
        activo: cat.activo,
      };
    } else {
      this.editandoCategoria = null;
      this.categoriaFormVisible = false;
    }
    this.categoriasModal = true;
  }

  nuevaCategoria(): void {
    this.editandoCategoria = null;
    this.categoriaFormVisible = true;
    this.formCategoria = { name: '', icon: 'HelpCircle', description: '', roles: [], orden: this.categorias.length, activo: true };
    this.categoriasModal = true;
  }

  cerrarModalCategoria(): void {
    this.categoriasModal = false;
    this.editandoCategoria = null;
    this.categoriaFormVisible = false;
    this.guardandoCategoria = false;
  }

  guardarCategoria(): void {
    const name = this.formCategoria.name.trim();
    if (!name) {
      this.notification.error('Error', 'El nombre de la categoría es obligatorio');
      return;
    }
    this.guardandoCategoria = true;
    const esEdicion = !!this.editandoCategoria;
    const dto: CreateFaqCategoryDto = {
      name,
      icon: this.formCategoria.icon || 'HelpCircle',
      description: this.formCategoria.description.trim(),
      roles: this.formCategoria.roles?.length ? this.formCategoria.roles : undefined,
      orden: this.formCategoria.orden,
      activo: this.formCategoria.activo,
    };
    const req = esEdicion
      ? this.faqService.updateCategory(this.editandoCategoria!.id, dto)
      : this.faqService.createCategory(dto);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.guardandoCategoria = false;
        this.categoriasModal = false;
        this.editandoCategoria = null;
        this.notification.success('Éxito', esEdicion ? 'Categoría actualizada' : 'Categoría creada');
        this.cargarCategorias();
      },
      error: (err) => {
        this.guardandoCategoria = false;
        this.cdr.detectChanges();
        this.notification.error('Error', err.error?.message || 'No se pudo guardar la categoría');
      },
    });
  }

  eliminarCategoria(cat: FaqCategory): void {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    this.faqService.removeCategory(cat.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success('Éxito', 'Categoría eliminada');
        this.cargarCategorias();
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudo eliminar la categoría');
      },
    });
  }

  filtrar(): void {
    const q = this.filtro.trim().toLowerCase();
    this.faqsFiltradas = q
      ? this.faqs.filter(f => f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q) || (f.categoria && f.categoria.toLowerCase().includes(q)))
      : this.faqs;
  }

  toggleFaqRol(rol: string): void {
    const i = this.form.roles.indexOf(rol);
    if (i >= 0) {
      this.form.roles.splice(i, 1);
    } else {
      this.form.roles.push(rol);
    }
    this.form.roles = [...this.form.roles];
  }

  toggleCatRol(rol: string): void {
    const i = this.formCategoria.roles.indexOf(rol);
    if (i >= 0) {
      this.formCategoria.roles.splice(i, 1);
    } else {
      this.formCategoria.roles.push(rol);
    }
    this.formCategoria.roles = [...this.formCategoria.roles];
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
        roles: faq.roles || [],
        activo: faq.activo,
      };
    } else {
      this.editando = null;
      this.form = { pregunta: '', respuesta: '', categoria: '', orden: 0, keywordsStr: '', roles: [], activo: true };
    }
    this.modalAbierto = true;
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.editando = null;
    this.guardando = false;
    this.showPreview = false;
  }

  get respuestaPreview(): SafeHtml {
    if (!this.form.respuesta) return this.sanitizer.bypassSecurityTrustHtml('<span style="color: var(--text-faint)">La vista previa aparecerá aquí...</span>');
    return this.sanitizer.bypassSecurityTrustHtml(formatFaqText(this.form.respuesta));
  }

  togglePreview(): void {
    this.showPreview = !this.showPreview;
    this.cdr.detectChanges();
  }

  private getTa(): HTMLTextAreaElement | null {
    return this.respuestaTextarea?.nativeElement || null;
  }

  private insertAtCursor(before: string, after: string, placeholder: string): void {
    const ta = this.getTa();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = this.form.respuesta.substring(start, end);
    const text = selected || placeholder;
    const newText = before + text + after;
    this.form.respuesta = this.form.respuesta.substring(0, start) + newText + this.form.respuesta.substring(end);
    this.cdr.detectChanges();
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + text.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }

  private insertBlockPrefix(prefix: string): void {
    const ta = this.getTa();
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = this.form.respuesta.lastIndexOf('\n', start - 1) + 1;
    this.form.respuesta = this.form.respuesta.substring(0, lineStart) + prefix + this.form.respuesta.substring(lineStart);
    this.cdr.detectChanges();
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    }, 0);
  }

  editorBold(): void {
    this.insertAtCursor('**', '**', 'texto en negrita');
  }

  editorItalic(): void {
    this.insertAtCursor('*', '*', 'texto en cursiva');
  }

  editorBulletList(): void {
    const ta = this.getTa();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = this.form.respuesta.substring(start, end);
    if (selected) {
      const lines = selected.split('\n').map(l => '* ' + l.trimStart());
      this.form.respuesta = this.form.respuesta.substring(0, start) + lines.join('\n') + this.form.respuesta.substring(end);
    } else {
      this.insertBlockPrefix('* ');
    }
    this.cdr.detectChanges();
    setTimeout(() => ta.focus(), 0);
  }

  editorNumberedList(): void {
    const ta = this.getTa();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = this.form.respuesta.substring(start, end);
    if (selected) {
      const lines = selected.split('\n').map((l, i) => (i + 1) + '. ' + l.trimStart());
      this.form.respuesta = this.form.respuesta.substring(0, start) + lines.join('\n') + this.form.respuesta.substring(end);
    } else {
      this.insertBlockPrefix('1. ');
    }
    this.cdr.detectChanges();
    setTimeout(() => ta.focus(), 0);
  }

  editorHeading(): void {
    this.insertBlockPrefix('## ');
  }

  editorSeparator(): void {
    const ta = this.getTa();
    if (!ta) return;
    const start = ta.selectionStart;
    const needNewline = start > 0 && this.form.respuesta[start - 1] !== '\n';
    const insertion = (needNewline ? '\n' : '') + '---\n';
    this.form.respuesta = this.form.respuesta.substring(0, start) + insertion + this.form.respuesta.substring(start);
    this.cdr.detectChanges();
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
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
      roles: this.form.roles?.length ? this.form.roles : undefined,
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
          if (err?.status === 409) {
            this.notification.warning('Duplicado', 'Ya existe una pregunta frecuente con ese texto');
          } else {
            this.notification.error('Error', err.error?.message || 'No se pudo crear la pregunta frecuente');
          }
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
