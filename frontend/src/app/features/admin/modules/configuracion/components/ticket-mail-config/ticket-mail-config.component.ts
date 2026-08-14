import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfiguracionData,
  ConfiguracionFrontendService,
} from '../../../../../../core/services/configuracion.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { MailEditorComponent } from '../mail-editor/mail-editor.component';
import { environment } from '../../../../../../../environments/environment';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface MailState {
  activo: boolean;
  asunto: string;
  cuerpo: string;
  design: unknown[] | null;
  senderName: string;
  includeInfo: boolean;
  sendCopy: boolean;
  attachments: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  mailFrom: string;
}

const ASUNTO_FALLBACK = 'Tu caso {{codigo}} fue registrado';

const CUERPO_FALLBACK =
  'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de Soporte';

@Component({
  selector: 'app-ticket-mail-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MailEditorComponent],
  templateUrl: './ticket-mail-config.html',
  styleUrl: './ticket-mail-config.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketMailConfigComponent implements OnChanges, OnDestroy {
  @Input() config: ConfiguracionData | null = null;
  @Output() configChange = new EventEmitter<ConfiguracionData>();

  mail: MailState = {
    activo: true,
    asunto: ASUNTO_FALLBACK,
    cuerpo: CUERPO_FALLBACK,
    design: null,
    senderName: 'Soporte',
    includeInfo: true,
    sendCopy: false,
    attachments: false,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    mailFrom: '',
  };

  dirty = false;
  status: SaveStatus = 'idle';
  saveError = '';
  smtpOpen = false;

  smtpPreset = 'custom';
  mailTestEmail = '';
  mailTesting = false;
  mailTestResult: { ok: boolean; message: string } | null = null;

  readonly presets = [
    { value: 'gmail', label: 'Gmail' },
    { value: 'outlook', label: 'Outlook / Microsoft 365' },
    { value: 'custom', label: 'Otro (configuracion manual)' },
  ];

  private readonly apiBase: string;
  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly cdr: ChangeDetectorRef,
    private readonly el: ElementRef,
  ) {
    try {
      this.apiBase = new URL(environment.apiUrl).origin;
    } catch {
      this.apiBase = '';
    }
  }

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
    this.mail = {
      activo: this.config.ticketEmailActivo ?? true,
      asunto: this.config.ticketEmailAsunto || ASUNTO_FALLBACK,
      cuerpo: this.config.ticketEmailCuerpo || CUERPO_FALLBACK,
      design: Array.isArray(this.config.ticketEmailDesign)
        ? this.config.ticketEmailDesign
        : null,
      senderName: this.config.ticketEmailSenderName || 'Soporte',
      includeInfo: this.config.ticketEmailIncludeInfo ?? true,
      sendCopy: this.config.ticketEmailSendCopy ?? false,
      attachments: this.config.ticketEmailAttachments ?? false,
      smtpHost: this.config.smtpHost || '',
      smtpPort: this.config.smtpPort || 465,
      smtpSecure: this.config.smtpSecure ?? true,
      smtpUser: this.config.smtpUser || '',
      smtpPass: this.config.smtpPass || '',
      mailFrom: this.config.mailFrom || '',
    };
    this.detectPreset();
    this.dirty = false;
    this.saveError = '';
    this.cdr.detectChanges();
  }

  markDirty(): void {
    this.dirty = true;
    this.status = 'dirty';
    this.saveError = '';
    this.emitConfig();
    this.cdr.detectChanges();
  }

  onCuerpoChange(v: string): void {
    this.mail.cuerpo = v;
    this.markDirty();
  }

  onDesignChange(v: unknown[] | null): void {
    this.mail.design = v;
    this.markDirty();
  }

  private emitConfig(): void {
    if (!this.config) return;
    this.configChange.emit({
      ...this.config,
      ticketEmailActivo: this.mail.activo,
      ticketEmailAsunto: this.mail.asunto,
      ticketEmailCuerpo: this.mail.cuerpo,
      ticketEmailDesign: this.mail.design,
      ticketEmailSenderName: this.mail.senderName,
      ticketEmailIncludeInfo: this.mail.includeInfo,
      ticketEmailSendCopy: this.mail.sendCopy,
      ticketEmailAttachments: this.mail.attachments,
      smtpHost: this.mail.smtpHost,
      smtpPort: this.mail.smtpPort,
      smtpSecure: this.mail.smtpSecure,
      smtpUser: this.mail.smtpUser,
      smtpPass: this.mail.smtpPass,
      mailFrom: this.mail.mailFrom,
    });
  }

  guardar(): void {
    if (!this.config || this.status === 'saving') return;
    this.status = 'saving';
    this.saveError = '';

    const payload: Partial<ConfiguracionData> = {
      ticketEmailActivo: this.mail.activo,
      ticketEmailAsunto: this.mail.asunto,
      ticketEmailCuerpo: this.mail.cuerpo,
      ticketEmailDesign: this.mail.design,
      ticketEmailSenderName: this.mail.senderName,
      ticketEmailIncludeInfo: this.mail.includeInfo,
      ticketEmailSendCopy: this.mail.sendCopy,
      ticketEmailAttachments: this.mail.attachments,
      smtpHost: this.mail.smtpHost,
      smtpPort: this.mail.smtpPort,
      smtpSecure: this.mail.smtpSecure,
      smtpUser: this.mail.smtpUser,
      smtpPass: this.mail.smtpPass,
      mailFrom: this.mail.mailFrom,
    };

    this.svc.guardarGlobal(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.status = 'saved';
        this.dirty = false;
        this.saveError = '';
        this.configChange.emit(res);
        this.notification.success(
          'Configuración de correo guardada',
          'El correo de tickets se actualizó correctamente.',
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
      this.mail.smtpHost = 'smtp.gmail.com';
      this.mail.smtpPort = 465;
      this.mail.smtpSecure = true;
    } else if (preset === 'outlook') {
      this.mail.smtpHost = 'smtp-mail.outlook.com';
      this.mail.smtpPort = 587;
      this.mail.smtpSecure = false;
    }
    this.markDirty();
  }

  private detectPreset(): void {
    const host = this.mail.smtpHost.toLowerCase();
    if (host.includes('gmail')) {
      this.smtpPreset = 'gmail';
    } else if (host.includes('outlook') || host.includes('microsoft') || host.includes('office365')) {
      this.smtpPreset = 'outlook';
    } else {
      this.smtpPreset = 'custom';
    }
  }

  probarCorreo(): void {
    if (!this.mailTestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.mailTestEmail)) {
      this.notification.warning('Correo de prueba', 'Escribe un correo valido que recibira la prueba.');
      return;
    }
    this.mailTesting = true;
    this.mailTestResult = null;
    this.svc
      .probarMail({
        smtpHost: this.mail.smtpHost,
        smtpPort: this.mail.smtpPort,
        smtpSecure: this.mail.smtpSecure,
        smtpUser: this.mail.smtpUser,
        smtpPass: this.mail.smtpPass,
        mailFrom: this.mail.mailFrom,
        senderName: this.mail.senderName,
        to: this.mailTestEmail.trim(),
        asunto: this.previewAsunto(),
        cuerpo: this.previewCuerpo(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.mailTesting = false;
          this.mailTestResult = res;
          if (res.ok) {
            this.notification.success('Conexion SMTP OK', 'Correo de prueba enviado correctamente.');
          } else {
            this.notification.error('Fallo la conexion SMTP', res.message);
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

  // ── Vista previa del correo ──────────────────────────────────────────────
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

  previewAsunto(): string {
    return this.mail.asunto
      .replace(/\{\{\s*codigo\s*\}\}/g, 'TKT-2026-0001')
      .replace(/\{\{\s*titulo\s*\}\}/g, 'Solicitud de soporte academico')
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*prioridad\s*\}\}/g, 'Media')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026 09:35');
  }

  previewCuerpo(): string {
    let html = this.absolutizarUploads(this.mail.cuerpo);
    const includeInfo = this.mail.includeInfo;
    const infoHtml = includeInfo
      ? '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Identificacion</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">1098701234</td></tr>' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Rol</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Estudiante</td></tr>' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Colegio</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Colegio San Jose</td></tr>' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Tipo de solicitud</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Soporte tecnico</td></tr>' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Telefono</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">3001234567</td></tr>' +
        '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;">Correo</td><td style="padding:7px 12px;color:#1e293b;">cliente@ejemplo.com</td></tr>' +
        '</table>'
      : '';
    const convHtml = includeInfo
      ? '<div>' +
        '<div style="margin:10px 0;padding:10px 12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;"><div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong>Laura Gomez</strong> · 14/08/2026 09:32</div><div style="font-size:14px;color:#1e293b;">Hola, necesito ayuda con mi matricula porque no aparece registrada.</div></div>' +
        '<div style="margin:10px 0;padding:10px 12px;background:#e0e7ff;border:1px solid #a5b4fc;border-radius:8px;"><div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong>Asesor</strong> · 14/08/2026 09:34</div><div style="font-size:14px;color:#1e293b;">Hola Laura, con gusto reviso tu caso y quedo pendiente de validar la informacion.</div></div>' +
        '</div>'
      : '';
    return html
      .replace(/\{\{\s*codigo\s*\}\}/g, 'TKT-2026-0001')
      .replace(/\{\{\s*titulo\s*\}\}/g, 'Solicitud de soporte academico')
      .replace(/\{\{\s*descripcion\s*\}\}/g, 'Consulta sobre el estado de mi matricula.')
      .replace(/\{\{\s*prioridad\s*\}\}/g, 'Media')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026 09:35')
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*informacion\s*\}\}/g, infoHtml)
      .replace(/\{\{\s*conversacion\s*\}\}/g, convHtml)
      .replace(/\{\{\s*firma\s*\}\}/g, 'Atentamente,<br/>Equipo de Soporte');
  }

  private absolutizarUploads(html: string): string {
    if (!this.apiBase) return html;
    return html.replace(/("|\()\/(uploads\/[^")]+)/g, `$1${this.apiBase}/$2`);
  }

  previewDoc(): string {
    const body = this.previewCuerpo();
    if (/<html[\s>]/i.test(body)) return body;
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>' +
      '<body style="margin:0;padding:24px 0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;overflow-wrap:break-word;word-break:break-word;">' +
      body.replace(/\r?\n/g, '<br/>') +
      '</body></html>'
    );
  }

  frameLoad(): void {
    const frame = this.el.nativeElement.querySelector('iframe.tmc-mail-frame') as HTMLIFrameElement | null;
    if (!frame || !frame.contentWindow) return;
    try {
      const h = frame.contentWindow.document.body?.scrollHeight;
      if (typeof h === 'number' && h > 0) frame.style.height = h + 'px';
    } catch {
      /* cross-origin no aplica: srcdoc es del mismo documento */
    }
  }

  private extractError(err: any): string {
    const body = err?.error;
    if (Array.isArray(body?.message)) return body.message.join('. ');
    if (typeof body?.message === 'string') return body.message;
    return 'Error al guardar. Intenta de nuevo.';
  }
}
