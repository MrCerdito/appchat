import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  OnInit,
  OnDestroy,
  AfterViewInit,
  DoCheck,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfiguracionData,
  ConfiguracionFrontendService,
} from '../../../../core/services/configuracion.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { MailEditorComponent, limpiarHTML } from '../../../../features/admin/modules/configuracion/components/mail-editor/mail-editor.component';
import { environment } from '../../../../../environments/environment';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface MailTemplateState {
  activo: boolean;
  asunto: string;
  cuerpo: string;
  design: unknown[] | null;
  senderName: string;
  includeInfo: boolean;
  sendCopy: boolean;
  attachments: boolean;
}

const ASUNTO_FALLBACK = 'Tu caso {{codigo}} fue registrado';

const CUERPO_FALLBACK =
  'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de Soporte';

@Component({
  selector: 'app-ticket-mail-template',
  standalone: true,
  imports: [CommonModule, FormsModule, MailEditorComponent],
  templateUrl: './ticket-mail-template.html',
  styleUrl: './ticket-mail-template.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketMailTemplateComponent
  implements OnInit, DoCheck, AfterViewInit, OnDestroy
{
  @ViewChild('mailFrame') private readonly mailFrame?: ElementRef<HTMLIFrameElement>;
  @Output() stateChange = new EventEmitter<void>();
  private lastPreviewDoc = '';
  private lastRawCuerpo = '';
  private lastCleanCuerpo = '';

  mail: MailTemplateState = {
    activo: true,
    asunto: ASUNTO_FALLBACK,
    cuerpo: CUERPO_FALLBACK,
    design: null,
    senderName: 'Soporte',
    includeInfo: true,
    sendCopy: false,
    attachments: false,
  };

  dirty = false;
  status: SaveStatus = 'idle';
  saveError = '';
  loading = true;

  private readonly apiBase: string;
  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    try {
      this.apiBase = new URL(environment.apiUrl).origin;
    } catch {
      this.apiBase =
        typeof window !== 'undefined' ? window.location.origin : '';
    }
  }

  ngOnInit(): void {
    this.svc.getTicketMail().pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.syncFromConfig(config);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.notification.error(
          'Error',
          'No se pudo cargar la configuracion del correo.',
        );
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngDoCheck(): void {
    const frame = this.mailFrame?.nativeElement;
    if (!frame) return;
    const doc = this.previewDoc();
    if (doc === this.lastPreviewDoc) return;
    this.lastPreviewDoc = doc;
    this.renderPreview(frame, doc);
  }

  ngAfterViewInit(): void {
    const frame = this.mailFrame?.nativeElement;
    if (!frame) return;
    const doc = this.previewDoc();
    this.lastPreviewDoc = doc;
    this.renderPreview(frame, doc);
  }

  private syncFromConfig(config: ConfiguracionData): void {
    this.mail = {
      activo: config.ticketEmailActivo ?? true,
      asunto: config.ticketEmailAsunto || ASUNTO_FALLBACK,
      cuerpo: config.ticketEmailCuerpo || CUERPO_FALLBACK,
      design: Array.isArray(config.ticketEmailDesign)
        ? config.ticketEmailDesign
        : null,
      senderName: config.ticketEmailSenderName || 'Soporte',
      includeInfo: config.ticketEmailIncludeInfo ?? true,
      sendCopy: config.ticketEmailSendCopy ?? false,
      attachments: config.ticketEmailAttachments ?? false,
    };
    this.dirty = false;
    this.saveError = '';
    this.cdr.detectChanges();
  }

  markDirty(): void {
    this.dirty = true;
    this.status = 'dirty';
    this.saveError = '';
    this.stateChange.emit();
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
    if (this.status === 'saving') return;
    this.status = 'saving';
    this.saveError = '';
    this.stateChange.emit();

    const payload: Partial<ConfiguracionData> = {
      ticketEmailActivo: this.mail.activo,
      ticketEmailAsunto: this.mail.asunto,
      ticketEmailCuerpo: this.mail.cuerpo,
      ticketEmailDesign: this.mail.design,
      ticketEmailSenderName: this.mail.senderName,
      ticketEmailIncludeInfo: this.mail.includeInfo,
      ticketEmailSendCopy: this.mail.sendCopy,
      ticketEmailAttachments: this.mail.attachments,
    };

    this.svc
      .guardarTicketMail(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.status = 'saved';
          this.dirty = false;
          this.saveError = '';
          this.stateChange.emit();
          this.notification.success(
            'Plantilla de tickets guardada',
            'El correo de tickets se actualizo correctamente.',
          );
          setTimeout(() => {
            if (this.status === 'saved') this.status = 'idle';
            this.stateChange.emit();
            this.cdr.detectChanges();
          }, 3000);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.status = 'error';
          this.saveError = this.extractError(err);
          this.stateChange.emit();
          this.notification.error('Error al guardar', this.saveError);
          this.cdr.detectChanges();
        },
      });
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
    const raw = this.absolutizarUploads(this.mail.cuerpo);
    if (raw !== this.lastRawCuerpo) {
      this.lastRawCuerpo = raw;
      this.lastCleanCuerpo = limpiarHTML(raw);
    }
    let html = this.lastCleanCuerpo;
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
      '<body style="margin:0;padding:24px 0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;overflow-wrap:break-word;word-break:break-word;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;"><tr><td align="center" style="padding:24px 12px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="padding:24px 28px;">' +
      body.replace(/\r?\n/g, '<br/>') +
      '</td></tr></table></td></tr></table>' +
      '</body></html>'
    );
  }

  private renderPreview(frame: HTMLIFrameElement, doc: string): void {
    const cd = frame.contentDocument;
    if (!cd) {
      frame.srcdoc = doc;
      return;
    }
    cd.open();
    cd.write(doc);
    cd.close();
    this.syncFrameHeight(frame);
  }

  private syncFrameHeight(frame: HTMLIFrameElement): void {
    try {
      const h = frame.contentWindow?.document.body?.scrollHeight;
      if (typeof h === 'number' && h > 0) frame.style.height = h + 'px';
    } catch {
      /* cross-origin no aplica: srcdoc y about:blank son del mismo documento */
    }
  }

  frameLoad(): void {
    const frame = this.mailFrame?.nativeElement;
    if (frame) this.syncFrameHeight(frame);
  }

  private extractError(err: any): string {
    const body = err?.error;
    if (Array.isArray(body?.message)) return body.message.join('. ');
    if (typeof body?.message === 'string') return body.message;
    return 'Error al guardar. Intenta de nuevo.';
  }
}
