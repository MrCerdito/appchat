import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Colegio, SessionService } from '../../../../../../core/services/session.service';
import { NotificationService } from '../../../../../../core/services/notification.service';

@Component({
  selector: 'app-colegios-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './colegios-config.html',
  styleUrl: './colegios-config.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColegiosConfigComponent implements OnInit, OnDestroy {
  @Input() advisorsList: { id: string; name: string }[] = [];

  colegios: Colegio[] = [];
  loading = false;
  saving = false;
  search = '';
  showForm = false;
  editingColegio: Colegio | null = null;
  form = { nombre: '', link: '', email: '', advisorId: '' };
  selectedIds = new Set<string>();
  deletingId: string | null = null;
  deletingBulk = false;
  page = 1;
  pageSize = 10;
  pageSizeOptions = [10, 25, 50, 100];

  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadColegios();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadColegios(): void {
    this.loading = true;
    this.sessionService.getColegios().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.colegios = data.map(c => ({
          ...c,
          advisorName: c.advisor?.name || null,
        }));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get filteredColegios(): Colegio[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.paginatedColegios;
    const all = this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.advisorName || '').toLowerCase().includes(q)
    );
    return all.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }

  get allFilteredColegios(): Colegio[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.colegios;
    return this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.advisorName || '').toLowerCase().includes(q)
    );
  }

  get totalFilteredPages(): number {
    return Math.ceil(this.allFilteredColegios.length / this.pageSize);
  }

  get paginatedColegios(): Colegio[] {
    const start = (this.page - 1) * this.pageSize;
    return this.colegios.slice(start, start + this.pageSize);
  }

  get allSelected(): boolean {
    return this.paginatedColegios.length > 0 &&
      this.paginatedColegios.every(c => this.selectedIds.has(c.id));
  }

  pageRange(): number[] {
    const total = this.totalFilteredPages;
    const current = this.page;
    const range: number[] = [];
    const delta = 2;
    const start = Math.max(1, current - delta);
    const end = Math.min(total, current + delta);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalFilteredPages) return;
    this.page = p;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  toggleAll(): void {
    if (this.allSelected) {
      this.paginatedColegios.forEach(c => this.selectedIds.delete(c.id));
    } else {
      this.paginatedColegios.forEach(c => this.selectedIds.add(c.id));
    }
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  openForm(colegio?: Colegio): void {
    if (colegio) {
      this.editingColegio = colegio;
      this.form = {
        nombre: colegio.nombre,
        link: colegio.link,
        email: colegio.email || '',
        advisorId: colegio.advisorId || '',
      };
    } else {
      this.editingColegio = null;
      this.form = { nombre: '', link: '', email: '', advisorId: '' };
    }
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingColegio = null;
    this.form = { nombre: '', link: '', email: '', advisorId: '' };
  }

  saveColegio(): void {
    if (!this.form.nombre.trim() || !this.form.link.trim()) return;
    this.saving = true;

    const payload: any = {
      nombre: this.form.nombre.trim(),
      link: this.form.link.trim(),
      email: this.form.email.trim() || undefined,
      advisorId: this.form.advisorId || null,
    };

    const req$ = this.editingColegio
      ? this.sessionService.updateColegio(this.editingColegio.id, payload)
      : this.sessionService.createColegio(payload);

    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.notification.success(
          this.editingColegio ? 'Colegio actualizado' : 'Colegio creado',
          'Los cambios se guardaron correctamente.',
        );
        this.closeForm();
        this.loadColegios();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error('Error', err?.error?.message || 'No se pudo guardar el colegio.');
        this.cdr.detectChanges();
      },
    });
  }

  confirmDelete(colegio: Colegio): void {
    this.deletingId = colegio.id;
  }

  cancelDelete(): void {
    this.deletingId = null;
  }

  deleteColegio(id: string): void {
    this.sessionService.deleteColegio(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.deletingId = null;
        this.notification.success('Eliminado', 'El colegio fue eliminado.');
        this.loadColegios();
      },
      error: (err) => {
        this.notification.error('Error', err?.error?.message || 'No se pudo eliminar.');
        this.cdr.detectChanges();
      },
    });
  }

  deleteSelected(): void {
    if (!this.selectedIds.size) return;
    this.deletingBulk = true;
    this.sessionService.deleteColegiosBulk([...this.selectedIds]).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.selectedIds.clear();
        this.deletingBulk = false;
        this.notification.success('Eliminados', 'Los colegios seleccionados fueron eliminados.');
        this.loadColegios();
      },
      error: () => {
        this.deletingBulk = false;
        this.cdr.detectChanges();
      },
    });
  }

  exportCsv(): void {
    this.sessionService.exportColegios().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        if (res.csv) {
          const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `colegios-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
      },
    });
  }

  importCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const rows = lines.slice(1).map(line => {
          const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
          return { nombre: cols[0] || '', link: cols[1] || 'https://', email: cols[2] || '' };
        }).filter(r => r.nombre && r.link);
        this.sessionService.importColegios(rows).pipe(takeUntil(this.destroy$)).subscribe({
          next: (res) => {
            this.notification.success('Importación', `${res.imported} colegios importados, ${res.skipped} omitidos.`);
            this.loadColegios();
          },
          error: () => this.notification.error('Error', 'No se pudo importar el archivo.'),
        });
      } catch {
        this.notification.error('Error', 'Formato de archivo inválido.');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  getAdvisorName(id: string | null | undefined): string {
    if (!id) return '';
    return this.advisorsList.find(a => a.id === id)?.name || '';
  }
}
