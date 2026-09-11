import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfiguracionData,
  ConfiguracionFrontendService,
  MailsenderCredencial,
} from '../../../../../../core/services/configuracion.service';
import { NotificationService } from '../../../../../../core/services/notification.service';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SmtpState {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  mailFrom: string;
  smtpImapHost: string;
  smtpImapPort: number;
  revisarRebotes: boolean;
  mailsenderUrl: string;
  mailsenderModo: 'individual' | 'lote';
  metodoEnvioCorreo: 'mailsender' | 'smtp';
  credencialEmail: string;
  credencialUsuario: string;
  credencialPassword: string;
  credencialNombre: string;
  credencialPort: number;
  credencialServidor: string;
  credencialSeguridadSsl: boolean;
  credencialTls12: boolean;
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
}

@Component({
  selector: 'app-smtp-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './smtp-config.html',
  styleUrl: './smtp-config.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmtpConfigComponent implements OnChanges, OnDestroy {
  @Input() config: ConfiguracionData | null = null;
  @Output() configChange = new EventEmitter<ConfiguracionData>();

  smtp: SmtpState = {
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    mailFrom: '',
    smtpImapHost: '',
    smtpImapPort: 993,
    revisarRebotes: true,
    mailsenderUrl: '',
    mailsenderModo: 'individual',
    metodoEnvioCorreo: 'mailsender',
    credencialEmail: '',
    credencialUsuario: '',
    credencialPassword: '',
    credencialNombre: '',
    credencialPort: 587,
    credencialServidor: 'vacio',
    credencialSeguridadSsl: true,
    credencialTls12: true,
    azureTenantId: '',
    azureClientId: '',
    azureClientSecret: '',
  };

  dirty = false;
  status: SaveStatus = 'idle';
  saveError = '';
  smtpOpen = true;

  smtpPreset = 'custom';
  mailTestEmail = '';
  mailTesting = false;
  mailTestResult: { ok: boolean; message: string } | null = null;

  readonly presets = [
    { value: 'gmail', label: 'Gmail' },
    { value: 'outlook', label: 'Outlook / Microsoft 365' },
    { value: 'custom', label: 'Otro (configuracion manual)' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      if (!this.dirty) this.syncFromConfig();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncFromConfig(): void {
    if (!this.config) return;
    this.smtp = {
      smtpHost: this.config.smtpHost || '',
      smtpPort: this.config.smtpPort || 465,
      smtpSecure: this.config.smtpSecure ?? true,
      smtpUser: this.config.smtpUser || '',
      smtpPass: this.config.smtpPass || '',
      mailFrom: this.config.mailFrom || '',
      smtpImapHost: this.config.smtpImapHost || '',
      smtpImapPort: this.config.smtpImapPort || 993,
      revisarRebotes: this.config.revisarRebotes ?? true,
      mailsenderUrl: this.config.mailsenderUrl || '',
      mailsenderModo: this.config.mailsenderModo || 'individual',
      metodoEnvioCorreo: this.config.metodoEnvioCorreo || 'mailsender',
      credencialEmail: this.config.mailsenderCredencial?.email || '',
      credencialUsuario: this.config.mailsenderCredencial?.usuario || '',
      credencialPassword: this.config.mailsenderCredencial?.password || '',
      credencialNombre: this.config.mailsenderCredencial?.nombre || '',
      credencialPort: this.config.mailsenderCredencial?.port || 587,
      credencialServidor: this.config.mailsenderCredencial?.servidorsmtp || 'vacio',
      credencialSeguridadSsl: this.config.mailsenderCredencial?.seguridadssl ?? true,
      credencialTls12: this.config.mailsenderCredencial?.protocolo_Tls12 ?? true,
      azureTenantId: this.config.mailsenderCredencial?.azure_TenantId || '',
      azureClientId: this.config.mailsenderCredencial?.azure_ClientId || '',
      azureClientSecret: this.config.mailsenderCredencial?.azure_ClientSecret || '',
    };
    this.detectPreset();
    this.dirty = false;
    this.saveError = '';
    this.cdr.detectChanges();
  }

  private buildMailsenderCredencial(): MailsenderCredencial {
    return {
      email: this.smtp.credencialEmail.trim(),
      usuario: this.smtp.credencialUsuario.trim(),
      password: this.smtp.credencialPassword,
      nombre: this.smtp.credencialNombre.trim(),
      port: this.smtp.credencialPort,
      servidorsmtp: this.smtp.credencialServidor.trim() || 'vacio',
      seguridadssl: this.smtp.credencialSeguridadSsl,
      protocolo_Tls12: this.smtp.credencialTls12,
      azure_TenantId: this.smtp.azureTenantId.trim(),
      azure_ClientId: this.smtp.azureClientId.trim(),
      azure_ClientSecret: this.smtp.azureClientSecret,
    };
  }

  markDirty(): void {
    this.dirty = true;
    this.status = 'dirty';
    this.saveError = '';
    this.emitConfig();
    this.cdr.detectChanges();
  }

  private emitConfig(): void {
    if (!this.config) return;
    this.configChange.emit({
      ...this.config,
      smtpHost: this.smtp.smtpHost,
      smtpPort: this.smtp.smtpPort,
      smtpSecure: this.smtp.smtpSecure,
      smtpUser: this.smtp.smtpUser,
      smtpPass: this.smtp.smtpPass,
      mailFrom: this.smtp.mailFrom,
      smtpImapHost: this.smtp.smtpImapHost,
      smtpImapPort: this.smtp.smtpImapPort,
      revisarRebotes: this.smtp.revisarRebotes,
      mailsenderUrl: this.smtp.mailsenderUrl,
      mailsenderModo: this.smtp.mailsenderModo,
      metodoEnvioCorreo: this.smtp.metodoEnvioCorreo,
      mailsenderCredencial: this.buildMailsenderCredencial(),
    });
  }

  get statusLabel(): string {
    switch (this.status) {
      case 'saving':
        return 'Guardando...';
      case 'saved':
        return 'Cambios guardados';
      case 'error':
        return 'Error al guardar';
      case 'dirty':
        return 'Cambios sin guardar';
      default:
        return 'Al dia';
    }
  }

  guardar(): void {
    if (!this.config || this.status === 'saving') return;
    this.status = 'saving';
    this.saveError = '';

    const payload: Partial<ConfiguracionData> = {
      smtpHost: this.smtp.smtpHost,
      smtpPort: this.smtp.smtpPort,
      smtpSecure: this.smtp.smtpSecure,
      smtpUser: this.smtp.smtpUser,
      smtpPass: this.smtp.smtpPass,
      mailFrom: this.smtp.mailFrom,
      smtpImapHost: this.smtp.smtpImapHost,
      smtpImapPort: this.smtp.smtpImapPort,
      revisarRebotes: this.smtp.revisarRebotes,
      mailsenderUrl: this.smtp.mailsenderUrl,
      mailsenderModo: this.smtp.mailsenderModo,
      metodoEnvioCorreo: this.smtp.metodoEnvioCorreo,
      mailsenderCredencial: this.buildMailsenderCredencial(),
    };

    this.svc
      .guardarGlobal(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.status = 'saved';
          this.dirty = false;
          this.saveError = '';
          this.configChange.emit(res);
          this.notification.success(
            'Configuración de correo guardada',
            'Los datos de envio se actualizaron correctamente.',
          );
          setTimeout(() => {
            if (this.status === 'saved') this.status = 'idle';
            this.cdr.detectChanges();
          }, 3000);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.status = 'error';
          this.saveError = this.extractError(err);
          this.notification.error('Error al guardar', this.saveError);
          this.cdr.detectChanges();
        },
      });
  }

  aplicarPresetSmtp(preset: string): void {
    this.smtpPreset = preset;
    if (preset === 'gmail') {
      this.smtp.smtpHost = 'smtp.gmail.com';
      this.smtp.smtpPort = 465;
      this.smtp.smtpSecure = true;
    } else if (preset === 'outlook') {
      this.smtp.smtpHost = 'smtp-mail.outlook.com';
      this.smtp.smtpPort = 587;
      this.smtp.smtpSecure = false;
    }
    this.markDirty();
  }

  private detectPreset(): void {
    const host = this.smtp.smtpHost.toLowerCase();
    if (host.includes('gmail')) {
      this.smtpPreset = 'gmail';
    } else if (
      host.includes('outlook') ||
      host.includes('microsoft') ||
      host.includes('office365')
    ) {
      this.smtpPreset = 'outlook';
    } else {
      this.smtpPreset = 'custom';
    }
  }

  cambiarMetodo(metodo: 'mailsender' | 'smtp'): void {
    if (this.smtp.metodoEnvioCorreo === metodo) return;
    this.smtp.metodoEnvioCorreo = metodo;
    this.markDirty();
  }

  probarCorreo(canal: 'mailsender' | 'smtp'): void {
    if (!this.mailTestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.mailTestEmail)) {
      this.notification.warning(
        'Correo de prueba',
        'Escribe un correo valido que recibira la prueba.',
      );
      return;
    }
    this.mailTesting = true;
    this.mailTestResult = null;
    const credencial = this.buildMailsenderCredencial();
    const usaMailsender = canal === 'mailsender';
    this.svc
      .probarMail(
        usaMailsender
          ? {
              baseUrl: this.smtp.mailsenderUrl,
              credencial,
              to: this.mailTestEmail.trim(),
              asunto: 'Prueba de conexion Mailsender',
              cuerpo: '<p>Este es un correo de prueba de la conexion Mailsender.</p>',
            }
          : {
              smtpHost: this.smtp.smtpHost,
              smtpPort: this.smtp.smtpPort,
              smtpSecure: this.smtp.smtpSecure,
              smtpUser: this.smtp.smtpUser,
              smtpPass: this.smtp.smtpPass,
              mailFrom: this.smtp.mailFrom,
              senderName: 'Correo SMTP',
              to: this.mailTestEmail.trim(),
              asunto: 'Prueba de conexion SMTP',
              cuerpo: '<p>Este es un correo de prueba de la conexion SMTP.</p>',
            },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.mailTesting = false;
          this.mailTestResult = res;
          if (res.ok) {
            this.notification.success(
              usaMailsender ? 'Conexion Mailsender OK' : 'Conexion SMTP OK',
              'Correo de prueba enviado correctamente.',
            );
          } else {
            this.notification.error(
              usaMailsender ? 'Fallo la conexion Mailsender' : 'Fallo la conexion SMTP',
              res.message,
            );
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.mailTesting = false;
          const msg = Array.isArray(err.error?.message)
            ? err.error.message.join('. ')
            : err.error?.message || 'No se pudo probar la conexion.';
          this.mailTestResult = { ok: false, message: msg };
          this.notification.error('Error al probar la conexion', msg);
          this.cdr.detectChanges();
        },
      });
  }

  private extractError(err: any): string {
    const body = err?.error;
    if (Array.isArray(body?.message)) return body.message.join('. ');
    if (typeof body?.message === 'string') return body.message;
    return 'Error al guardar. Intenta de nuevo.';
  }
}
