import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';
import { trackByIndex, trackById } from '../../../shared/utils/track-by';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastContainerComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private notification: NotificationService,
  ) {}

  login(): void {
    this.error = '';

    if (!this.email.trim() || !this.password.trim()) {
      this.error = 'Debes ingresar correo y contraseña';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email.trim())) {
      this.error = 'Correo electrónico inválido';
      return;
    }

    if (this.password.length < 8) {
      this.error = 'La contraseña debe tener mínimo 8 caracteres';
      return;
    }

    this.loading = true;

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;  // ← sin finalize, aquí mismo

        const body = err.error;

        if (Array.isArray(body?.message)) {
          const msgs: string[] = body.message;
          const tieneEmail = msgs.some(m =>
            m.toLowerCase().includes('correo') || m.toLowerCase().includes('email')
          );
          const tienePassword = msgs.some(m =>
            m.toLowerCase().includes('contraseña') || m.toLowerCase().includes('password')
          );

          if (tieneEmail && tienePassword) {
            this.error = 'Ingresa un correo válido y una contraseña de al menos 8 caracteres';
          } else if (tieneEmail) {
            this.error = 'El correo electrónico no es válido';
          } else if (tienePassword) {
            this.error = 'La contraseña debe tener al menos 8 caracteres';
          } else {
            this.error = msgs.join('. ');
          }

        } else if (err.status === 401) {
          this.error = 'Credenciales inválidas';
        } else if (err.status === 0) {
          this.error = 'No se pudo conectar con el servidor';
        } else {
          this.error = typeof body?.message === 'string'
            ? body.message
            : 'Error al iniciar sesión';
        }

        this.cdr.detectChanges(); // ← forzar render
        this.notification.error('Error al iniciar sesión', this.error);
      }
    });
  }
}