import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, PaginatedResponse } from '../../../../core/services/admin.service';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/models/user.model';
import { Subject, debounceTime, distinctUntilChanged, of, Observable, switchMap, tap } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

type RoleFilter = 'todos' | 'advisor' | 'admin';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_STRENGTH_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

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
  filtroRol: RoleFilter = 'todos';
  currentUserId: string | null = null;

  sort: SortState = { column: 'name', direction: 'asc' };

  // ── Modal crear/editar ────────────────────────────────
  formModal: { mode: 'create' | 'edit'; advisor: User | null } | null = null;
  form = { name: '', email: '', password: '', confirm: '', role: 'advisor' as 'admin' | 'advisor' };
  formErrors: Record<string, string> = {};
  formBusy = false;
  showPasswordField = false;
  formPhoto: File | null = null;
  photoPreview: string | null = null;
  photoUploading = false;

  // ── Modal cambiar contraseña ──────────────────────────
  passwordModal: { advisor: User } | null = null;
  pwForm = { password: '', confirm: '' };
  pwErrors: Record<string, string> = {};
  pwBusy = false;

  // Estado por fila para acciones puntuales
  busyId: string | null = null;

  confirmAction: { type: 'delete'; advisor: User } | null = null;

  importing = false;
  exporting = false;
  importResult: {
    message: string;
    created: number;
    updated: number;
    errors: { row: number; email: string; error: string }[];
  } | null = null;

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pwFirstInput') pwFirstInput?: ElementRef<HTMLInputElement>;
  @ViewChild('formFirstName') formFirstName?: ElementRef<HTMLInputElement>;

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
    this.currentUserId = this.auth.getUser()?.id ?? null;
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

  // ── Carga y filtros ───────────────────────────────────
  onSearch(value: string): void {
    this.search = value;
    this.searchSubject.next(value);
  }

  setFiltroRol(role: RoleFilter): void {
    if (this.filtroRol === role) return;
    this.filtroRol = role;
    this.page = 1;
    this.loadAdvisors();
  }

  limpiarFiltros(): void {
    this.search = '';
    this.filtroRol = 'todos';
    this.page = 1;
    this.loadAdvisors();
  }

  loadAdvisors(): void {
    this.loading = true;
    this.error = '';
    this.adminService
      .getAdvisors(this.page, this.limit, this.search || undefined, this.filtroRol)
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res: PaginatedResponse<User>) => {
          this.advisors = res.data;
          this.computeStatusCounts();
          this.total = res.total;
          this.page = res.page;
          this.pages = res.pages;
          this.sortAdvisors();
        },
        error: () => this.showError('Error cargando agentes'),
      });
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

  // ── Modal crear/editar ────────────────────────────────
  openCreate(): void {
    this.formModal = { mode: 'create', advisor: null };
    this.form = { name: '', email: '', password: '', confirm: '', role: 'advisor' };
    this.formErrors = {};
    this.formBusy = false;
    this.showPasswordField = true;
    this.error = '';
    this.formPhoto = null;
    this.photoPreview = null;
    this.cdr.detectChanges();
    setTimeout(() => this.formFirstName?.nativeElement.focus(), 0);
  }

  openEdit(advisor: User): void {
    this.formModal = { mode: 'edit', advisor };
    this.form = {
      name: advisor.name,
      email: advisor.email,
      password: '',
      confirm: '',
      role: advisor.role === 'admin' ? 'admin' : 'advisor',
    };
    this.formErrors = {};
    this.formBusy = false;
    this.showPasswordField = false;
    this.error = '';
    this.formPhoto = null;
    this.photoPreview = advisor.profilePhotoUrl || null;
    this.cdr.detectChanges();
    setTimeout(() => this.formFirstName?.nativeElement.focus(), 0);
  }

  closeForm(): void {
    this.formModal = null;
    this.formPhoto = null;
    this.photoPreview = null;
  }

  validateForm(): boolean {
    this.formErrors = {};

    if (!this.form.name || this.form.name.trim().length < 2) {
      this.formErrors['name'] = 'El nombre debe tener al menos 2 caracteres';
    }

    if (!this.form.email || !EMAIL_REGEX.test(this.form.email)) {
      this.formErrors['email'] = 'Correo electrónico inválido';
    }

    const isCreate = this.formModal?.mode === 'create';
    const hasPassword = !!this.form.password;
    if (isCreate && !hasPassword) {
      this.formErrors['password'] = 'La contraseña es obligatoria';
    } else if (hasPassword && this.form.password.length < 8) {
      this.formErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    } else if (hasPassword && !PASSWORD_STRENGTH_RE.test(this.form.password)) {
      this.formErrors['password'] =
        'Debe incluir mayúscula, minúscula, número y carácter especial';
    }
    if (hasPassword && this.form.password !== this.form.confirm) {
      this.formErrors['confirm'] = 'Las contraseñas no coinciden';
    }

    this.cdr.detectChanges();
    return Object.keys(this.formErrors).length === 0;
  }

  save(): void {
    if (!this.validateForm()) return;

    this.formBusy = true;
    this.error = '';
    const name = this.form.name.trim();
    const email = this.form.email.trim();
    const role = this.form.role;

    let stream: Observable<any>;
    let targetId = this.formModal?.advisor?.id ?? '';

    if (this.formModal?.mode === 'create') {
      stream = this.adminService
        .createAdvisor(name, email, this.form.password, role)
        .pipe(tap((u: User) => { targetId = u.id; }));
    } else {
      stream = this.adminService.updateAdvisor(targetId, { name, email, role }).pipe(
        switchMap(() =>
          this.form.password
            ? this.adminService.updatePassword(targetId, this.form.password)
            : of(null),
        ),
      );
    }

    stream.pipe(
      switchMap(() => {
        if (!this.formPhoto || !targetId) return of(null);
        return this.adminService.uploadPhoto(targetId, this.formPhoto);
      }),
      finalize(() => { this.formBusy = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        const action = this.formModal?.mode === 'create' ? 'creado' : 'actualizado';
        this.showSuccess(`Agente ${action}`);
        this.closeForm();
        this.loadAdvisors();
      },
      error: (err) => this.handleSaveError(err),
    });
  }

  private handleSaveError(err: any): void {
    const msg = err?.error?.message ?? err?.message ?? 'Error al guardar';
    if (typeof msg === 'string' && msg.toLowerCase().includes('email')) {
      this.formErrors['email'] = msg;
    } else {
      this.showError(msg);
    }
    this.cdr.detectChanges();
  }

  // ── Foto de perfil ─────────────────────────────────────
  onPhotoClick(): void {
    this.photoInput?.nativeElement.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showError('Solo se permiten imágenes');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showError('La imagen supera el límite de 5MB');
      return;
    }
    this.formPhoto = file;
    this.photoPreview = URL.createObjectURL(file);
    this.cdr.detectChanges();
  }

  removePhoto(): void {
    const advisor = this.formModal?.advisor;
    if (this.formModal?.mode !== 'edit' || !advisor) return;
    this.photoUploading = true;
    this.adminService
      .deletePhoto(advisor.id)
      .pipe(finalize(() => { this.photoUploading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.photoPreview = null;
          this.formPhoto = null;
          this.notification.success('Foto', 'Foto eliminada');
        },
        error: () => this.showError('Error al eliminar la foto'),
      });
  }

  // ── Modal cambiar contraseña ───────────────────────────
  openPasswordModal(advisor: User): void {
    this.passwordModal = { advisor };
    this.pwForm = { password: '', confirm: '' };
    this.pwErrors = {};
    this.pwBusy = false;
    this.cdr.detectChanges();
    setTimeout(() => this.pwFirstInput?.nativeElement.focus(), 0);
  }

  closePasswordModal(): void {
    this.passwordModal = null;
  }

  savePassword(): void {
    if (!this.passwordModal) return;
    this.pwErrors = {};

    if (!this.pwForm.password || this.pwForm.password.length < 8) {
      this.pwErrors['password'] = 'La contraseña debe tener mínimo 8 caracteres';
    } else if (!PASSWORD_STRENGTH_RE.test(this.pwForm.password)) {
      this.pwErrors['password'] =
        'Debe incluir mayúscula, minúscula, número y carácter especial';
    }
    if (this.pwForm.password !== this.pwForm.confirm) {
      this.pwErrors['confirm'] = 'Las contraseñas no coinciden';
    }
    if (Object.keys(this.pwErrors).length > 0) {
      this.cdr.detectChanges();
      return;
    }

    this.pwBusy = true;
    this.adminService
      .updatePassword(this.passwordModal.advisor.id, this.pwForm.password)
      .pipe(finalize(() => { this.pwBusy = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.pwForm = { password: '', confirm: '' };
          this.notification.success('Contraseña', 'Contraseña actualizada');
          this.showSuccess('Contraseña actualizada');
          this.loadAdvisors();
          this.closePasswordModal();
        },
        error: (err) => {
          this.pwErrors['password'] =
            err?.error?.message ?? 'Error al actualizar contraseña';
        },
      });
  }

  passwordStrength(pw: string): number {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score += 25;
    if (/[a-z]/.test(pw)) score += 15;
    if (/[A-Z]/.test(pw)) score += 15;
    if (/\d/.test(pw)) score += 15;
    if (/[^A-Za-z0-9]/.test(pw)) score += 15;
    if (pw.length >= 12) score += 15;
    return Math.min(score, 100);
  }

  strengthColor(score: number): string {
    if (score === 0) return '#e2e8f0';
    if (score < 40) return '#ef4444';
    if (score < 70) return '#f59e0b';
    return '#22c55e';
  }

  // ── Importar / exportar ────────────────────────────────
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
    this.adminService.importUsers(file).pipe(
      finalize(() => { this.importing = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.importResult = res;
        this.notification.success('Importación', res.message);
        this.loadAdvisors();
      },
      error: (err) => this.showError(err.error?.message ?? 'Error al importar agentes'),
    });
  }

  onExportExcel(): void {
    this.exporting = true;
    this.error = '';
    this.adminService.exportUsers().pipe(
      finalize(() => { this.exporting = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agentes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.showError('Error al exportar agentes'),
    });
  }

  // ── Acciones por fila ──────────────────────────────────
  toggle(advisor: User): void {
    if (this.busyId) return;
    this.busyId = advisor.id;
    this.adminService.toggleAdvisor(advisor.id).pipe(
      finalize(() => { this.busyId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => this.loadAdvisors(),
      error: (err) => this.showError(err?.error?.message ?? 'Error al cambiar estado'),
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
    if (!this.confirmAction || this.busyId) return;
    const { advisor } = this.confirmAction;
    this.confirmAction = null;
    this.busyId = advisor.id;

    this.adminService.removeAdvisor(advisor.id).pipe(
      finalize(() => { this.busyId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.showSuccess('Agente eliminado');
        if (this.advisors.length === 1 && this.page > 1) {
          this.page--;
        }
        this.loadAdvisors();
      },
      error: (err) => this.showError(err?.error?.message ?? 'Error al eliminar'),
    });
  }

  // ── Helpers de vista ───────────────────────────────────
  isCurrentUser(id: string): boolean {
    return id === this.currentUserId;
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = { online: 'Disponible', busy: 'Ocupado', offline: 'Inactivo' };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  getRoleLabel(role?: string): string {
    return role === 'admin' ? 'Administrador' : 'Agente';
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
