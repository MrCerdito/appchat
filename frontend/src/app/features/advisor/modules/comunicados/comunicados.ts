import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  DoCheck,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ComunicadosService, Colegio } from '../../../../core/services/comunicados.service';
import { Comunicado, Destinatario } from '../../../../core/models/comunicado.model';
import { NotificationService } from '../../../../core/services/notification.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { fmtDateFull, fmtDateTimeFull } from '../../../../shared/utils/date';
import { MailEditorComponent, COMUNICADO_MAIL_VARIABLES, limpiarHTML } from '../../../../features/admin/modules/configuracion/components/mail-editor/mail-editor.component';
import { environment } from '../../../../../environments/environment';

type View = 'inbox' | 'sent' | 'drafts' | 'compose';

const CUERPO_FALLBACK =
  'Hola {{nombre}},\n\nQueremos informarte sobre la siguiente comunicacion oficial.\n\nSaludos cordiales,\n{{firma}}';

@Component({
  selector: 'app-comunicados',
  standalone: true,
  imports: [FormsModule, SlicePipe, MailEditorComponent],
  templateUrl: './comunicados.html',
  styleUrl: './comunicados.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComunicadosComponent implements OnInit, AfterViewInit, DoCheck, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly fmtDateFull = fmtDateFull;
  protected readonly fmtDateTimeFull = fmtDateTimeFull;
  protected readonly mailVariables = COMUNICADO_MAIL_VARIABLES;
  view: View = 'inbox';
  comunicados: Comunicado[] = [];
  colegios: Colegio[] = [];
  selected: Comunicado | null = null;
  loading = false;
  saving = false;
  sending = false;
  success = '';
  stats: any = null;
  showStats = false;
  statsLoading = false;
  error = '';

  // Compose
  editingId: string | null = null;
  asunto = '';
  cuerpo = '';
  design: unknown[] | null = null;
  destinatarios: Destinatario[] = [];
  emailInput = '';
  nombreInput = '';
  showColegiosPicker = false;
  colegioSearch = '';

  @ViewChild('composeFrame') private readonly composeFrame?: ElementRef<HTMLIFrameElement>;
  private lastPreviewDoc = '';
  private lastRawCuerpo = '';
  private lastCleanCuerpo = '';
  private readonly apiBase: string;

  private destroy$ = new Subject<void>();

  constructor(
    private service: ComunicadosService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
    private layout: LayoutService,
  ) {
    try {
      this.apiBase = new URL(environment.apiUrl).origin;
    } catch {
      this.apiBase =
        typeof window !== 'undefined' ? window.location.origin : '';
    }
  }

  ngOnInit(): void {
    this.layout.setSidebarForcedCollapsed(true);
    this.loadAll();
    this.service.getColegios().pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => {
        this.colegios = c;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.layout.setSidebarForcedCollapsed(false);
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.service.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => { this.comunicados = c; this.loading = false; this.cdr.detectChanges(); },
      error: () => {
      this.loading = false;
      this.notification.error('Error', 'No se pudieron cargar los comunicados.');
      this.cdr.detectChanges();
    },
    });
  }

  loadStats(id: string): void {
    this.statsLoading = true;
    this.showStats = false;
    this.service.getStats(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => {
        this.stats = s;
        this.showStats = true;
        this.statsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.statsLoading = false;
        this.notification.error('Error', 'No se pudieron cargar las estadísticas.');
        this.cdr.detectChanges();
      },
    });
  }

  get filtered(): Comunicado[] {
    if (this.view === 'drafts') return this.comunicados.filter(c => c.status === 'draft');
    if (this.view === 'sent')   return this.comunicados.filter(c => c.status === 'sent' || c.status === 'failed');
    return this.comunicados.filter(c => c.status !== 'draft');
  }

  get filteredColegios(): Colegio[] {
    if (!this.colegioSearch) return this.colegios;
    return this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(this.colegioSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(this.colegioSearch.toLowerCase())
    );
  }

  get draftCount(): number {
    return this.comunicados.filter(c => c.status === 'draft').length;
  }

  get failedCount(): number {
    return this.comunicados.filter(c => c.status === 'failed').length;
  }

  selectComunicado(c: Comunicado): void {
    this.selected = c;
    this.showStats = false;
    this.stats = null;
  }

  openCompose(comunicado?: Comunicado): void {
    this.view = 'compose';
    this.selected = null;
    this.showStats = false;
    this.stats = null;
    this.error = '';
    this.success = '';
    this.lastPreviewDoc = '';
    if (comunicado) {
      this.editingId = comunicado.id;
      this.asunto = comunicado.asunto;
      this.cuerpo = comunicado.cuerpo;
      this.design = Array.isArray(comunicado.design) ? comunicado.design : null;
      this.destinatarios = comunicado.destinatarios.map(d => ({
        email: d.email,
        nombre: d.nombre,
      }));
    } else {
      this.editingId = null;
      this.asunto = '';
      this.cuerpo = CUERPO_FALLBACK;
      this.design = null;
      this.destinatarios = [];
    }
  }

  addEmailManual(): void {
    const email = this.emailInput.trim();
    const nombre = this.nombreInput.trim() || email;
    if (!email || !email.includes('@')) return;
    if (this.destinatarios.some(d => d.email === email)) return;
    this.destinatarios.push({ email, nombre });
    this.emailInput = '';
    this.nombreInput = '';
  }

  addColegio(colegio: Colegio): void {
    if (!colegio.email) return;
    if (this.destinatarios.some(d => d.email === colegio.email)) return;
    this.destinatarios.push({ email: colegio.email, nombre: colegio.nombre });
  }

  addAllColegios(): void {
    this.colegios.filter(c => c.email).forEach(c => {
      if (!this.destinatarios.some(d => d.email === c.email)) {
        this.destinatarios.push({ email: c.email!, nombre: c.nombre });
      }
    });
  }

  removeDestinatario(email: string): void {
    this.destinatarios = this.destinatarios.filter(d => d.email !== email);
  }

  onCuerpoChange(v: string): void {
    this.cuerpo = v;
  }

  onDesignChange(v: unknown[] | null): void {
    this.design = v;
  }

  ngDoCheck(): void {
    if (this.view !== 'compose') return;
    const frame = this.composeFrame?.nativeElement;
    if (!frame) return;
    const doc = this.previewDoc();
    if (doc === this.lastPreviewDoc) return;
    this.lastPreviewDoc = doc;
    this.renderPreview(frame, doc);
  }

  ngAfterViewInit(): void {
    const frame = this.composeFrame?.nativeElement;
    if (!frame) return;
    const doc = this.previewDoc();
    this.lastPreviewDoc = doc;
    this.renderPreview(frame, doc);
  }

  previewAsunto(): string {
    return (this.asunto || '')
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*colegio\s*\}\}/g, 'Colegio San Jose')
      .replace(/\{\{\s*email\s*\}\}/g, 'rectoria@colegio.edu.co')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026')
      .replace(/\{\{\s*firma\s*\}\}/g, 'Equipo de Soporte');
  }

  previewCuerpo(): string {
    const raw = this.absolutizarUploads(this.cuerpo);
    if (raw !== this.lastRawCuerpo) {
      this.lastRawCuerpo = raw;
      this.lastCleanCuerpo = limpiarHTML(raw);
    }
    return this.lastCleanCuerpo
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*colegio\s*\}\}/g, 'Colegio San Jose')
      .replace(/\{\{\s*email\s*\}\}/g, 'rectoria@colegio.edu.co')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026')
      .replace(/\{\{\s*firma\s*\}\}/g, 'Equipo de Soporte');
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
    const frame = this.composeFrame?.nativeElement;
    if (frame) this.syncFrameHeight(frame);
  }

  saveDraft(): void {
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    this.saving = true;
    this.error = '';

    const obs = this.editingId
      ? this.service.update(this.editingId, this.asunto, this.cuerpo, this.destinatarios, this.design)
      : this.service.saveDraft(this.asunto, this.cuerpo, this.destinatarios, this.design);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => {
        this.editingId = c.id;
        this.saving = false;
        this.loadAll();
        this.showSuccessMsg('Borrador guardado');
      },
      error: (err) => {
        this.saving = false;
        this.error = err.error?.message || 'Error al guardar';
        this.notification.error('Error al guardar', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  sendNow(): void {
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    if (!this.destinatarios.length) { this.error = 'Agrega al menos un destinatario'; return; }
    this.sending = true;
    this.error = '';
    const totalDest = this.destinatarios.length;

    const save$ = this.editingId
      ? this.service.update(this.editingId, this.asunto, this.cuerpo, this.destinatarios, this.design)
      : this.service.saveDraft(this.asunto, this.cuerpo, this.destinatarios, this.design);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => {
        this.service.send(c.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.sending = false;
            this.view = 'sent';
            this.editingId = null;
            this.loadAll();
            this.showSuccessMsg(`Comunicado enviado a ${totalDest} destinatario(s)`);
          },
          error: () => {
            this.sending = false;
            this.view = 'sent';
            this.editingId = null;
            this.loadAll();
            this.error = 'Ningún correo pudo ser entregado';
            this.notification.error('Error al enviar', 'Ningún correo pudo ser entregado.');
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.sending = false;
        this.error = err.error?.message || 'Error al guardar el comunicado';
        this.notification.error('Error al guardar', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  deleteComunicado(id: string): void {
    if (!confirm('¿Eliminar este comunicado?')) return;
    this.service.remove(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.selected = null;
        this.showStats = false;
        this.stats = null;
        this.loadAll();
        this.showSuccessMsg('Comunicado eliminado');
      },
    });
  }

  private showSuccessMsg(msg: string): void {
    this.success = msg;
    this.notification.success('Éxito', msg);
    this.cdr.detectChanges();
    setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3500);
  }

  get statsFailedCount(): number {
  if (!this.stats?.detalle) return 0;
  return this.stats.detalle.filter((d: any) => d.sendStatus === 'failed').length;
}
}