import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';

/** Formato de correo, igual que la validacion del backend (class-validator). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastContainerComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  showPassword = false;

  /** El campo ya perdio el foco: ahi se empieza a mostrar el error inline. */
  emailTouched = false;
  passwordTouched = false;

  /** Estado de Bloq Mayús al escribir la contraseña (keydown/keyup). */
  capsLockOn = false;

  /** Error inline del correo: solo formato (el vacio lo cubre el boton deshabilitado). */
  get emailError(): string | null {
    if (!this.emailTouched) return null;
    const valor = this.email.trim();
    if (!valor) return null;
    return EMAIL_REGEX.test(valor) ? null : 'Correo electrónico inválido';
  }

  /** Error inline de la contraseña: solo el minimo de 8 caracteres. */
  get passwordError(): string | null {
    if (!this.passwordTouched) return null;
    if (!this.password) return null;
    return this.password.length >= 8
      ? null
      : 'La contraseña debe tener mínimo 8 caracteres';
  }

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private notification: NotificationService,
  ) {}

  /**
   * Refleja el estado de Bloq Mayús mientras se escribe en la contraseña.
   * `getModifierState` no existe en todos los navegadores: si falta, simplemente
   * no se muestra el aviso.
   */
  checkCapsLock(event: Event): void {
    const e = event as KeyboardEvent;
    this.capsLockOn =
      typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
  }

  login(): void {
    if (!this.email.trim() || !this.password.trim()) {
      this.notification.warning('Campos requeridos', 'Debes ingresar correo y contraseña');
      return;
    }

    if (!EMAIL_REGEX.test(this.email.trim())) {
      this.emailTouched = true;
      this.passwordTouched = true;
      this.cdr.detectChanges();
      return;
    }

    if (this.password.length < 8) {
      this.emailTouched = true;
      this.passwordTouched = true;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        const user = this.auth.getUser();
        if (user?.role === 'advisor') {
          sessionStorage.setItem('advisor_fresh_login', '1');
        }
        const target = user?.role === 'admin' || user?.role === 'superadmin' ? '/admin' : user?.role === 'desarrollador' ? '/developer' : user?.role === 'interno' ? '/interno' : '/dashboard';
        this.router.navigate([target]);
      },
      error: (err) => {
        this.loading = false;  // ← sin finalize, aquí mismo

        const body = err.error;
        let mensaje: string;

        if (Array.isArray(body?.message)) {
          const msgs: string[] = body.message;
          const tieneEmail = msgs.some(m =>
            m.toLowerCase().includes('correo') || m.toLowerCase().includes('email')
          );
          const tienePassword = msgs.some(m =>
            m.toLowerCase().includes('contraseña') || m.toLowerCase().includes('password')
          );

          if (tieneEmail && tienePassword) {
            mensaje = 'Ingresa un correo válido y una contraseña de al menos 8 caracteres';
          } else if (tieneEmail) {
            mensaje = 'El correo electrónico no es válido';
          } else if (tienePassword) {
            mensaje = 'La contraseña debe tener al menos 8 caracteres';
          } else {
            mensaje = msgs.join('. ');
          }

          // En 401 el backend ya manda mensajes amigables en español:
          // "Cuenta bloqueada. Intenta de nuevo en X minuto(s)",
          // "Usuario desactivado" o "Credenciales inválidas". Se muestran tal
          // cual para que el asesor sepa por que no puede entrar.
        } else if (err.status === 401 && typeof body?.message === 'string' && body.message.trim()) {
          mensaje = body.message;
        } else if (err.status === 401) {
          mensaje = 'Credenciales inválidas';
        } else if (err.status === 0) {
          mensaje = 'No se pudo conectar con el servidor';
        } else {
          mensaje = typeof body?.message === 'string'
            ? body.message
            : 'Error al iniciar sesión';
        }

        this.cdr.detectChanges(); // ← forzar render

        // El formulario no tiene caja de error: todo se notifica arriba a la
        // derecha (duracion 6s para dar tiempo a leer mensajes largos).
        this.notification.show('error', 'Error al iniciar sesión', mensaje, 6000);
      }
    });
  }
}
