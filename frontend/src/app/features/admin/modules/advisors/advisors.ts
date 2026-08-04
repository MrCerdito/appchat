import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, PaginatedResponse } from '../../../../core/services/admin.service';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/models/user.model';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

@Component({
  selector: 'app-advisors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './advisors.html',
  styleUrl: './advisors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvisorsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  advisors: User[] = [];
  statusCounts = { online: 0, busy: 0, offline: 0 };
  total = 0;
  page = 1;
  limit = 20;
  pages = 0;
  search = '';
  loading = false;
  error = '';
  success = '';

  showForm = false;
  editingId: string | null = null;

  form = { name: '', email: '', password: '' };
  formErrors: Record<string, string> = {};

  showPasswordField = false;

  sort: SortState = { column: 'name', direction: 'asc' };

  confirmAction: { type: 'delete'; advisor: User } | null = null;
  savingPassword = false;

  importing = false;
  exporting = false;
  importResult: {
    message: string;
    created: number;
    updated: number;
    errors: { row: number; email: string; error: string }[];
  } | null = null;

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private socket: SocketService,
    private auth: AuthService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAdvisors();

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.loadAdvisors();
    });

      this.socket.on<{ advisorId: string; name: string; status: string }>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const index = this.advisors.findIndex(a => a.id === data.advisorId);
        if (index !== -1) {
          this.advisors[index] = { ...this.advisors[index], status: data.status };
          this.advisors = [...this.advisors];
          this.computeStatusCounts();
          this.cdr.detectChanges();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearch(value: string): void {
    this.search = value;
    this.searchSubject.next(value);
  }

  private computeStatusCounts(): void {
    this.statusCounts = { online: 0, busy: 0, offline: 0 };
    for (const a of this.advisors) {
      const s = a.status ?? 'offline';
      if (s === 'online') this.statusCounts.online++;
      else if (s === 'busy') this.statusCounts.busy++;
      else this.statusCounts.offline++;
    }
  }

  loadAdvisors(): void {
    this.loading = true;
    this.error = '';
    this.adminService.getAdvisors(this.page, this.limit, this.search || undefined).subscribe({
      next: (res: PaginatedResponse<User>) => {
        this.advisors = res.data;
        this.computeStatusCounts();
        this.total = res.total;
        this.page = res.page;
        this.pages = res.pages;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.showError('Error cargando asesores');
      },
    });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.pages) return;
    this.page = p;
    this.loadAdvisors();
  }

  setSort(column: string): void {
    if (this.sort.column === column) {
      this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sort.column = column;
      this.sort.direction = 'asc';
    }
    this.sortAdvisors();
  }

  sortAdvisors(): void {
    this.advisors = [...this.advisors].sort((a, b) => {
      const aVal = (a as any)[this.sort.column] ?? '';
      const bVal = (b as any)[this.sort.column] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return this.sort.direction === 'asc' ? cmp : -cmp;
    });
    this.cdr.detectChanges();
  }

  sortIcon(column: string): string {
    if (this.sort.column !== column) return '↕';
    return this.sort.direction === 'asc' ? '↑' : '↓';
  }

  openCreate(): void {
    this.editingId = null;
    this.form = { name: '', email: '', password: '' };
    this.formErrors = {};
    this.showPasswordField = true;
    this.showForm = true;
    this.error = '';
  }

  openEdit(advisor: User): void {
    this.editingId = advisor.id;
    this.form = { name: advisor.name, email: advisor.email, password: '' };
    this.formErrors = {};
    this.showPasswordField = false;
    this.showForm = true;
    this.error = '';
  }

  validateForm(): boolean {
    this.formErrors = {};

    if (!this.form.name || this.form.name.trim().length < 2) {
      this.formErrors['name'] = 'El nombre debe tener al menos 2 caracteres';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.form.email || !emailRegex.test(this.form.email)) {
      this.formErrors['email'] = 'Correo electrónico inválido';
    }

    if (!this.editingId && (!this.form.password || this.form.password.length < 8)) {
      this.formErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    }

    if (this.form.password && this.form.password.length > 0 && this.form.password.length < 8) {
      this.formErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    }

    return Object.keys(this.formErrors).length === 0;
  }

  save(): void {
    if (!this.validateForm()) return;

    this.loading = true;
    this.error = '';
    const name = this.form.name.trim();
    const email = this.form.email.trim();

    const obs = this.editingId
      ? this.adminService.updateAdvisor(this.editingId, { name, email })
      : this.adminService.createAdvisor(name, email, this.form.password);

    obs.subscribe({
      next: () => {
        if (this.editingId && this.form.password) {
          this.savingPassword = true;
          this.adminService.updatePassword(this.editingId, this.form.password).subscribe({
            next: () => {
              this.savingPassword = false;
              this.finishSave();
            },
            error: () => {
              this.savingPassword = false;
              this.showError('Error al actualizar contraseña');
            },
          });
        } else {
          this.finishSave();
        }
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.message;
        if (msg?.includes('email')) {
          this.formErrors['email'] = msg;
        } else {
          this.showError(msg ?? 'Error al guardar');
        }
        this.cdr.detectChanges();
      },
    });
  }

  private finishSave(): void {
    this.showForm = false;
    this.loading = false;
    this.showSuccess(this.editingId ? 'Asesor actualizado' : 'Asesor creado');
    this.loadAdvisors();
  }

  onImportClick(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      this.showError('Formato no válido. Sube un archivo Excel (.xlsx o .xls)');
      return;
    }

    this.importing = true;
    this.importResult = null;
    this.error = '';
    this.adminService.importUsers(file).subscribe({
      next: (res) => {
        this.importing = false;
        this.importResult = res;
        this.notification.success('Importación', res.message);
        this.loadAdvisors();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.importing = false;
        this.showError(err.error?.message ?? 'Error al importar asesores');
        this.cdr.detectChanges();
      },
    });
  }

  onExportExcel(): void {
    this.exporting = true;
    this.error = '';
    this.adminService.exportUsers().subscribe({
      next: (blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asesores-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        this.cdr.detectChanges();
      },
      error: () => {
        this.exporting = false;
        this.showError('Error al exportar asesores');
        this.cdr.detectChanges();
      },
    });
  }

  toggle(advisor: User): void {
    this.loading = true;
    this.adminService.toggleAdvisor(advisor.id).subscribe({
      next: () => {
        this.loading = false;
        this.loadAdvisors();
      },
      error: () => {
        this.loading = false;
        this.showError('Error al cambiar estado');
      },
    });
  }

  confirmRemove(advisor: User): void {
    this.confirmAction = { type: 'delete', advisor };
    this.cdr.detectChanges();
  }

  cancelConfirm(): void {
    this.confirmAction = null;
    this.cdr.detectChanges();
  }

  executeConfirm(): void {
    if (!this.confirmAction) return;
    const { advisor } = this.confirmAction;
    this.confirmAction = null;
    this.loading = true;

    this.adminService.removeAdvisor(advisor.id).subscribe({
      next: () => {
        this.loading = false;
        this.showSuccess('Asesor eliminado');
        if (this.advisors.length === 1 && this.page > 1) {
          this.page--;
        }
        this.loadAdvisors();
      },
      error: (err) => {
        this.loading = false;
        this.showError(err.error?.message ?? 'Error al eliminar');
      },
    });
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = { online: 'Disponible', busy: 'Ocupado', offline: 'Inactivo' };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  getRoleLabel(role?: string): string {
    return role === 'admin' ? 'Admin' : 'Asesor';
  }

  formatDate(date?: string): string {
    if (!date) return '-';
    const d = new Date(date);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const dd = String(bogota.getUTCDate()).padStart(2, '0');
    const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = bogota.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private showSuccess(msg: string): void {
    this.success = msg;
    this.notification.success('Éxito', msg);
    setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3000);
    this.cdr.detectChanges();
  }

  private showError(msg: string): void {
    this.error = msg;
    this.notification.error('Error', msg);
    this.cdr.detectChanges();
  }
}
