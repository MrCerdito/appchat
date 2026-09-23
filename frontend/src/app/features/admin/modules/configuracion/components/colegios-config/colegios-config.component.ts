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
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { Colegio, SessionService } from '../../../../../../core/services/session.service';
import { NotificationService } from '../../../../../../core/services/notification.service';

@Component({
  selector: 'app-colegios-config',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  form = { nombre: '', link: '', email: '', calendario: '', tipoColegio: '', ciudad: '', advisorId: '' };
  additionalLinks: string[] = [];
  selectedIds = new Set<string>();
  deletingId: string | null = null;
  deletingBulk = false;
  page = 1;
  pageSize = 10;
  pageSizeOptions = [10, 25, 50, 100];

  exportando = false;
  mostrarModalImportar = false;
  archivoImportar: File | null = null;
  importando = false;
  arrastrandoArchivo = false;
  resultadoImportar: { imported: number; updated: number; skipped: number; warnings: string[] } | null = null;
  pasoImportar: 'archivo' | 'preview' | 'resultado' = 'archivo';
  previewImportar: {
    preview: boolean;
    imported: number;
    updated: number;
    skipped: number;
    warnings: string[];
    cambiosAsesor: { colegio: string; anterior: string | null; nuevo: string }[];
    filas: { nombre: string; estado: 'crear' | 'actualizar' | 'omito'; cambios: string[] }[];
  } | null = null;
  filasImportar: any[] | null = null;
  erroresParseImportar: string[] = [];
  reasignarAsesoresImportar = false;
  backups: string[] = [];
  mostrarBackups = false;
  backupMsg: string | null = null;

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

  get calendarioOptions(): { value: string; label: string }[] {
    const fixed = [
      { value: 'A', label: 'Calendario A' },
      { value: 'B', label: 'Calendario B' },
    ];
    const current = this.form.calendario;
    if (current && current !== 'A' && current !== 'B')
      return [...fixed, { value: current, label: current }];
    return fixed;
  }

  get tipoColegioOptions(): { value: string; label: string }[] {
    const fixed = [
      { value: 'ControlAcademic', label: 'Control Academic' },
      { value: 'Sian365', label: 'Sian365' },
    ];
    const current = this.form.tipoColegio;
    if (current && current !== 'ControlAcademic' && current !== 'Sian365')
      return [...fixed, { value: current, label: current }];
    return fixed;
  }

  loadColegios(): void {
    this.loading = true;
    this.sessionService.getColegios().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.colegios = data.map(c => ({
          ...c,
          tipoColegio: this.normalizarTipo(c.tipoColegio ?? '') || null,
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

  private normalizarTipo(value: string): string {
    const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (['controlacademic', 'controlacademico', 'control', 'ctrl', 'ctl', 'korvixcontrol'].includes(key)) {
      return 'ControlAcademic';
    }
    if (['sian365', 'sian', 'korvixsian'].includes(key)) {
      return 'Sian365';
    }
    return value.trim();
  }

  get filteredColegios(): Colegio[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.paginatedColegios;
    const all = this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.advisorName || '').toLowerCase().includes(q) ||
      (c.calendario || '').toLowerCase().includes(q) ||
      (c.tipoColegio || '').toLowerCase().includes(q) ||
      (c.ciudad || '').toLowerCase().includes(q)
    );
    return all.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }

  get allFilteredColegios(): Colegio[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.colegios;
    return this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.advisorName || '').toLowerCase().includes(q) ||
      (c.calendario || '').toLowerCase().includes(q) ||
      (c.tipoColegio || '').toLowerCase().includes(q) ||
      (c.ciudad || '').toLowerCase().includes(q)
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
        calendario: colegio.calendario || '',
        tipoColegio: colegio.tipoColegio || '',
        ciudad: colegio.ciudad || '',
        advisorId: colegio.advisorId || '',
      };
      this.additionalLinks = (colegio.links || []).filter(l => l !== colegio.link);
    } else {
      this.editingColegio = null;
      this.form = { nombre: '', link: '', email: '', calendario: '', tipoColegio: '', ciudad: '', advisorId: '' };
      this.additionalLinks = [];
    }
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingColegio = null;
    this.form = { nombre: '', link: '', email: '', calendario: '', tipoColegio: '', ciudad: '', advisorId: '' };
    this.additionalLinks = [];
  }

  addAdditionalLink(): void {
    if (this.additionalLinks.length < 9) {
      this.additionalLinks.push('');
    }
  }

  removeAdditionalLink(index: number): void {
    this.additionalLinks.splice(index, 1);
  }

  saveColegio(): void {
    if (!this.form.nombre.trim() || !this.form.link.trim()) return;
    this.saving = true;

    const payload: any = {
      nombre: this.form.nombre.trim(),
      link: this.form.link.trim(),
      links: [this.form.link.trim(), ...this.additionalLinks.filter(l => l.trim())],
      email: this.form.email.trim(),
      calendario: this.form.calendario.trim(),
      tipoColegio: this.form.tipoColegio.trim(),
      ciudad: this.form.ciudad.trim(),
      advisorId: this.form.advisorId || null,
    };

    const req$ = this.editingColegio
      ? this.sessionService.updateColegio(this.editingColegio.id, payload)
      : this.sessionService.createColegio(payload);

    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.saving = false;
        if (this.editingColegio) {
          const updated = res as Colegio;
          const idx = this.colegios.findIndex(c => c.id === updated.id);
          if (idx !== -1) {
            this.colegios[idx] = {
              ...this.colegios[idx],
              ...updated,
              advisorName: updated.advisor?.name || null,
            };
          }
          this.notification.success('Actualizado', 'Los datos del colegio se guardaron correctamente.');
        } else {
          const created = res as Colegio;
          this.colegios = [{ ...created, advisorName: created.advisor?.name || null }, ...this.colegios];
          this.notification.success('Creado', 'El colegio fue registrado exitosamente.');
        }
        this.closeForm();
        this.cdr.detectChanges();
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
    if (this.exportando) return;
    this.exportando = true;
    this.cdr.detectChanges();
    this.sessionService.exportColegios().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.exportando = false;
        const csv = res?.csv;
        if (!csv) {
          this.notification.error('Error', 'No se pudo generar el archivo CSV.');
          this.cdr.detectChanges();
          return;
        }
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `colegios-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.notification.success('Exportación', 'Archivo CSV descargado correctamente.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.exportando = false;
        this.notification.error('Error', 'No se pudo exportar los colegios.');
        this.cdr.detectChanges();
      },
    });
  }

  /* ── Import (modal) ── */
  abrirModalImportar(): void {
    this.mostrarModalImportar = true;
    this.archivoImportar = null;
    this.resultadoImportar = null;
    this.previewImportar = null;
    this.filasImportar = null;
    this.erroresParseImportar = [];
    this.pasoImportar = 'archivo';
    this.importando = false;
    this.arrastrandoArchivo = false;
    this.reasignarAsesoresImportar = false;
  }

  cerrarModalImportar(): void {
    this.mostrarModalImportar = false;
    this.archivoImportar = null;
    this.resultadoImportar = null;
    this.previewImportar = null;
    this.filasImportar = null;
    this.erroresParseImportar = [];
    this.pasoImportar = 'archivo';
    this.importando = false;
    this.arrastrandoArchivo = false;
    this.reasignarAsesoresImportar = false;
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoImportar = input.files?.[0] ?? null;
    this.resultadoImportar = null;
    this.previewImportar = null;
    this.pasoImportar = 'archivo';
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.archivoImportar = file;
      this.resultadoImportar = null;
      this.previewImportar = null;
      this.pasoImportar = 'archivo';
    }
  }

  descargarPlantilla(): void {
    const header = 'nombre;link;links;email;calendario;tipo_colegio;ciudad;asesor';
    const ejemplo = 'Colegio Ejemplo;https://ejemplo.com;;contacto@colegio.com;A;Sian365;Bogotá;Juan Pérez';
    const blob = new Blob(['\uFEFF' + header + '\n' + ejemplo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-colegios.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  ejecutarImportar(): void {
    if (!this.archivoImportar || this.importando) return;
    this.importando = true;
    this.cdr.detectChanges();

    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string).replace(/^\uFEFF/, '');
      const parsed = this.parseCsv(text);

      if (!parsed.rows.length) {
        this.importando = false;
        this.pasoImportar = 'resultado';
        this.resultadoImportar = { imported: 0, updated: 0, skipped: 0, warnings: parsed.errores };
        this.cdr.detectChanges();
        return;
      }

      this.sessionService.importColegios(parsed.rows, { preview: true }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: any) => {
          this.importando = false;
          this.filasImportar = parsed.rows;
          this.erroresParseImportar = parsed.errores;
          this.previewImportar = res;
          this.pasoImportar = 'preview';
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.importando = false;
          this.pasoImportar = 'resultado';
          this.resultadoImportar = {
            imported: 0,
            updated: 0,
            skipped: 0,
            warnings: [err?.error?.message || 'No se pudo previsualizar el archivo.'],
          };
          this.cdr.detectChanges();
        },
      });
    };
    reader.readAsText(this.archivoImportar);
  }

  aplicarImportar(): void {
    if (!this.filasImportar || this.importando) return;
    this.importando = true;
    this.cdr.detectChanges();

    this.sessionService
      .importColegios(this.filasImportar, { reasignarAsesores: this.reasignarAsesoresImportar })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.importando = false;
          this.resultadoImportar = {
            imported: res?.imported ?? 0,
            updated: res?.updated ?? 0,
            skipped: res?.skipped ?? 0,
            warnings: [...(res?.warnings ?? []), ...this.erroresParseImportar],
          };
          this.pasoImportar = 'resultado';
          this.loadColegios();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.importando = false;
          this.pasoImportar = 'resultado';
          this.resultadoImportar = {
            imported: 0,
            updated: 0,
            skipped: 0,
            warnings: [err?.error?.message || 'No se pudo importar el archivo.'],
          };
          this.cdr.detectChanges();
        },
      });
  }

  volverDesdePreview(): void {
    this.pasoImportar = 'archivo';
    this.previewImportar = null;
    this.filasImportar = null;
    this.erroresParseImportar = [];
    this.resultadoImportar = null;
    this.importando = false;
  }

  /* ── Backups (respaldo/restauración) ── */
  crearBackupManualColegios(): void {
    this.backupMsg = null;
    this.sessionService.crearBackupManual().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.backupMsg = `Respaldo creado: ${res.archivo}`;
        this.notification.success('Respaldo', 'Se creó un respaldo de colegios y Perfil Institucional.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err?.error?.message || 'No se pudo crear el respaldo.';
        this.backupMsg = msg;
        this.notification.error('Respaldo', msg);
        this.cdr.detectChanges();
      },
    });
  }

  toggleBackups(): void {
    this.mostrarBackups = !this.mostrarBackups;
    if (this.mostrarBackups) {
      this.sessionService.listarBackups().pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          this.backups = res ?? [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.backups = [];
          this.cdr.detectChanges();
        },
      });
    }
  }

  restaurarBackupColegios(fileName: string): void {
    const nombre = fileName.split(/[\\/]/).pop() || fileName;
    if (!confirm(`¿Restaurar el respaldo "${nombre}"? Se reemplazarán colegios y valores de Perfil Institucional guardados en el respaldo.`)) return;
    this.sessionService.restaurarBackup(fileName).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.notification.success('Restauración', `${res.colegios} colegios y ${res.valores} valores restaurados.`);
        this.loadColegios();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.notification.error('Restauración', err?.error?.message || 'No se pudo restaurar el respaldo.');
      },
    });
  }

  private parseCsv(text: string): { rows: any[]; errores: string[] } {
    const errores: string[] = [];
    const raw = this.parseCsvRows(text);
    if (!raw.length) {
      errores.push('El archivo está vacío o no tiene filas de datos.');
      return { rows: [], errores };
    }

    const header = raw[0].map(h => this.normalizarHeader(h));
    const idx = {
      nombre: header.indexOf('nombre'),
      link: header.indexOf('link'),
      links: header.indexOf('links'),
      email: header.indexOf('email'),
      calendario: header.indexOf('calendario'),
      tipo: header.findIndex(h => ['tipo', 'tipo_colegio', 'tipocolegio', 'proyecto'].includes(h)),
      ciudad: header.indexOf('ciudad'),
      asesor: header.findIndex(h => ['asesor', 'asesor_principal'].includes(h)),
    };

    if (idx.nombre === -1 || idx.link === -1) {
      errores.push('El archivo debe contener las columnas "nombre" y "link".');
      return { rows: [], errores };
    }

    const rows: any[] = [];
    raw.slice(1).forEach((cols, i) => {
      const linea = i + 2;
      const nombre = (cols[idx.nombre] ?? '').trim();
      const link = (cols[idx.link] ?? '').trim();
      if (!nombre && !link) return;
      if (!nombre || !link) {
        errores.push(`Fila ${linea}: faltan campos obligatorios (nombre y link).`);
        return;
      }
      rows.push({
        nombre,
        link,
        email: idx.email !== -1 ? (cols[idx.email] ?? '').trim() : '',
        calendario: idx.calendario !== -1 ? (cols[idx.calendario] ?? '').trim() : '',
        tipoColegio: idx.tipo !== -1 ? (cols[idx.tipo] ?? '').trim() : '',
        ciudad: idx.ciudad !== -1 ? (cols[idx.ciudad] ?? '').trim() : '',
        asesor: idx.asesor !== -1 ? (cols[idx.asesor] ?? '').trim() : '',
        ...(idx.links !== -1
          ? { links: (cols[idx.links] ?? '').split('|').map((l: string) => l.trim()).filter(Boolean) }
          : {}),
      });
    });

    if (!rows.length) {
      errores.push('No se encontraron colegios válidos en el archivo.');
    }
    return { rows, errores };
  }

  private parseCsvRows(text: string): string[][] {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const firstLine = clean.split(/\r?\n/)[0] || '';
    const semis = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const delimiter = semis > commas ? ';' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          row.push(field);
          field = '';
        } else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && clean[i + 1] === '\n') i++;
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
        } else {
          field += ch;
        }
      }
    }
    row.push(field);
    if (row.length > 1 || (row[0] || '').trim()) rows.push(row);
    return rows;
  }

  private normalizarHeader(h: string): string {
    return h.replace(/"/g, '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  getAdvisorName(id: string | null | undefined): string {
    if (!id) return '';
    return this.advisorsList.find(a => a.id === id)?.name || '';
  }

  get stats(): { total: number; sian: number; control: number; sinAsesor: number } {
    const colegios = this.colegios;
    return {
      total: colegios.length,
      sian: colegios.filter(c => c.tipoColegio === 'Sian365').length,
      control: colegios.filter(c => c.tipoColegio === 'ControlAcademic').length,
      sinAsesor: colegios.filter(c => !c.advisorId && !c.advisorName).length,
    };
  }

  tipoClass(tipo: string | null | undefined): string {
    if (tipo === 'Sian365') return 'tmc-pill--sian';
    if (tipo === 'ControlAcademic') return 'tmc-pill--control';
    return 'tmc-pill--tipo';
  }
}
