import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../core/services/admin.service';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { User } from '../../../../core/models/user.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

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
  showForm = false;
  editingId: string | null = null;
  loading = false;
  error = '';
  success = '';

  form = { name: '', email: '', password: '' };

  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private socket: SocketService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAdvisors();

    // Escuchar cambios de estado en tiempo real
    this.socket.on<{ advisorId: string; name: string; status: string }>('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const index = this.advisors.findIndex(a => a.id === data.advisorId);
        if (index !== -1) {
          this.advisors[index] = { ...this.advisors[index], status: data.status };
          this.advisors = [...this.advisors]; // nueva referencia → Angular detecta el cambio
          this.cdr.detectChanges();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAdvisors(): void {
    this.adminService.getAdvisors().subscribe({
      next: (a) => { this.advisors = a; this.cdr.detectChanges(); },
      error: () => this.showError('Error cargando asesores'),
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.form = { name: '', email: '', password: '' };
    this.showForm = true;
    this.error = '';
  }

  openEdit(advisor: User): void {
    this.editingId = advisor.id;
    this.form = { name: advisor.name, email: advisor.email, password: '' };
    this.showForm = true;
    this.error = '';
  }

  save(): void {
    this.loading = true;
    this.error = '';

    const obs = this.editingId
      ? this.adminService.updateAdvisor(this.editingId, { name: this.form.name, email: this.form.email })
      : this.adminService.createAdvisor(this.form.name, this.form.email, this.form.password);

    obs.subscribe({
      next: () => {
        this.showForm = false;
        this.loading = false;
        this.showSuccess(this.editingId ? 'Asesor actualizado' : 'Asesor creado');
        this.loadAdvisors();
      },
      error: (err) => {
        this.loading = false;
        this.showError(err.error?.message ?? 'Error al guardar');
      },
    });
  }

  toggle(advisor: User): void {
    this.adminService.toggleAdvisor(advisor.id).subscribe({
      next: () => this.loadAdvisors(),
      error: () => this.showError('Error al cambiar estado'),
    });
  }

  remove(advisor: User): void {
    if (!confirm(`¿Eliminar a ${advisor.name}? Esta acción no se puede deshacer.`)) return;
    this.adminService.removeAdvisor(advisor.id).subscribe({
      next: () => {
        this.showSuccess('Asesor eliminado');
        this.loadAdvisors();
      },
      error: () => this.showError('Error al eliminar'),
    });
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = { online: 'Disponible', busy: 'Ocupado', offline: 'Inactivo' };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  private showSuccess(msg: string): void {
    this.success = msg;
    setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3000);
    this.cdr.detectChanges();
  }

  private showError(msg: string): void {
    this.error = msg;
    this.cdr.detectChanges();
  }
}