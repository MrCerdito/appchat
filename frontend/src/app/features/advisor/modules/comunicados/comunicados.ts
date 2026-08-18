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
import { Comunicado, ComunicadoTemplate, Destinatario } from '../../../../core/models/comunicado.model';
import { NotificationService } from '../../../../core/services/notification.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { fmtDateFull, fmtDateTimeFull } from '../../../../shared/utils/date';
import { MailEditorComponent, COMUNICADO_MAIL_VARIABLES, limpiarHTML } from '../../../../features/admin/modules/configuracion/components/mail-editor/mail-editor.component';
import { SendConfirmModalComponent } from './components/send-confirm-modal/send-confirm-modal.component';
import { environment } from '../../../../../environments/environment';

type View = 'sent' | 'drafts' | 'templates' | 'compose';

const CUERPO_FALLBACK =
  'Hola {{nombre}},\n\nQueremos informarte sobre la siguiente comunicacion oficial.\n\nSaludos cordiales,\n{{firma}}';

@Component({
  selector: 'app-comunicados',
  standalone: true,
  imports: [FormsModule, SlicePipe, MailEditorComponent, SendConfirmModalComponent],
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
  view: View = 'sent';
  comunicados: Comunicado[] = [];
  templates: ComunicadoTemplate[] = [];
  templatesLoading = false;
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

  // Modals
  showSaveTemplateModal = false;
  showSendConfirm = false;
  showRecipientsModal = false;
  templateNameDraft = '';

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

  // Filtros avanzados
  showFiltersPanel = false;
  filterTipoColegio: '' | 'Sian365' | 'ControlAcademic' = '';
  filterCalendario: '' | 'A' | 'B' = '';

  // Seleccion masiva
  selectedColegioIds: Set<string> = new Set();
  selectAllMode = false;

  // Paginacion colegios
  colegioPage = 1;
  readonly COLEGIO_PAGE_SIZE = 20;

  @ViewChild('composeFrame') private readonly composeFrame?: ElementRef<HTMLIFrameElement>;
  @ViewChild('detailFrame') private readonly detailFrame?: ElementRef<HTMLIFrameElement>;
  private lastPreviewDoc = '';
  private lastDetailDoc = '';
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
    this.loadTemplates();
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

  loadTemplates(): void {
    this.templatesLoading = true;
    this.service.getTemplates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (t) => {
        this.templates = t;
        this.templatesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.templatesLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  saveAsTemplate(): void {
    if (!this.asunto.trim()) {
      this.error = 'El asunto es obligatorio para guardar la plantilla';
      this.cdr.detectChanges();
      return;
    }
    this.templateNameDraft = this.asunto.trim().slice(0, 80);
    this.showSaveTemplateModal = true;
    this.cdr.detectChanges();
  }

  cancelSaveTemplate(): void {
    this.showSaveTemplateModal = false;
    this.templateNameDraft = '';
    this.cdr.detectChanges();
  }

  confirmSaveTemplate(): void {
    const trimmed = this.templateNameDraft.trim();
    if (!trimmed) {
      this.notification.warning('Nombre requerido', 'El nombre de la plantilla es obligatorio');
      return;
    }

    this.showSaveTemplateModal = false;
    this.cdr.detectChanges();

    this.service.saveTemplate(trimmed, this.asunto, this.cuerpo, this.design)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadTemplates();
          this.showSuccessMsg('Plantilla guardada');
        },
        error: (err) => {
          this.error = err.error?.message || 'Error al guardar la plantilla';
          this.notification.error('Error al guardar la plantilla', this.error);
          this.cdr.detectChanges();
        },
      });
  }

  applyTemplate(t: ComunicadoTemplate): void {
    this.view = 'compose';
    this.selected = null;
    this.showStats = false;
    this.stats = null;
    this.error = '';
    this.success = '';
    this.lastPreviewDoc = '';
    this.editingId = null;
    this.asunto = t.asunto;
    this.cuerpo = t.cuerpo;
    this.design = Array.isArray(t.design) ? t.design : null;
    this.cdr.detectChanges();
  }

  deleteTemplate(t: ComunicadoTemplate): void {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    this.service.deleteTemplate(t.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.templates = this.templates.filter((x) => x.id !== t.id);
        this.cdr.detectChanges();
        this.showSuccessMsg('Plantilla eliminada');
      },
      error: (err) => {
        this.notification.error('Error', err.error?.message || 'No se pudo eliminar la plantilla');
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
    return this.comunicados.filter(c => c.status === 'sent' || c.status === 'failed');
  }

  get filteredColegios(): Colegio[] {
    let result = this.colegios;
    if (this.filterCalendario) {
      result = result.filter(c => c.calendario === this.filterCalendario);
    }
    if (this.filterTipoColegio) {
      result = result.filter(c => c.tipoColegio === this.filterTipoColegio);
    }
    if (this.colegioSearch) {
      const q = this.colegioSearch.toLowerCase();
      result = result.filter(c =>
        c.nombre.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }
    return result;
  }

  get paginatedColegios(): Colegio[] {
    const start = (this.colegioPage - 1) * this.COLEGIO_PAGE_SIZE;
    return this.filteredColegios.slice(start, start + this.COLEGIO_PAGE_SIZE);
  }

  get colegioTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredColegios.length / this.COLEGIO_PAGE_SIZE));
  }

  get colegioPageNumbers(): number[] {
    const total = this.colegioTotalPages;
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  get paginatedEnd(): number {
    return Math.min(this.colegioPage * this.COLEGIO_PAGE_SIZE, this.filteredColegios.length);
  }

  get activeFilterChips(): { label: string; key: string }[] {
    const chips: { label: string; key: string }[] = [];
    if (this.filterCalendario) chips.push({ label: `Cal. ${this.filterCalendario}`, key: 'calendario' });
    if (this.filterTipoColegio) chips.push({ label: this.filterTipoColegio === 'Sian365' ? 'Sian365' : 'Control Academic', key: 'tipo' });
    return chips;
  }

  get activeFilterCount(): number {
    return (this.filterCalendario ? 1 : 0) + (this.filterTipoColegio ? 1 : 0);
  }

  get allFilteredSelected(): boolean {
    const filtered = this.filteredColegios.filter(c => c.email);
    return filtered.length > 0 && filtered.every(c => this.selectedColegioIds.has(c.id));
  }

  toggleColegioSelection(id: string): void {
    if (this.selectedColegioIds.has(id)) {
      this.selectedColegioIds.delete(id);
    } else {
      this.selectedColegioIds.add(id);
    }
    this.selectAllMode = false;
  }

  toggleSelectAllColegios(): void {
    if (this.allFilteredSelected) {
      this.filteredColegios.forEach(c => this.selectedColegioIds.delete(c.id));
    } else {
      this.filteredColegios.forEach(c => this.selectedColegioIds.add(c.id));
    }
    this.selectAllMode = this.allFilteredSelected;
  }

  addSelectedColegios(): void {
    this.colegios
      .filter(c => this.selectedColegioIds.has(c.id) && c.email)
      .forEach(c => this.addColegio(c));
    this.selectedColegioIds.clear();
    this.selectAllMode = false;
  }

  clearColegioSelection(): void {
    this.selectedColegioIds.clear();
    this.selectAllMode = false;
  }

  isColegioSelected(id: string): boolean {
    return this.selectedColegioIds.has(id);
  }

  isColegioAdded(colegio: Colegio): boolean {
    return !!colegio.email && this.destinatarios.some(d => d.email === colegio.email);
  }

  removeFilterChip(key: string): void {
    if (key === 'calendario') this.filterCalendario = '';
    if (key === 'tipo') this.filterTipoColegio = '';
    this.colegioPage = 1;
  }

  clearAllFilters(): void {
    this.filterCalendario = '';
    this.filterTipoColegio = '';
    this.colegioSearch = '';
    this.colegioPage = 1;
  }

  onColegioPageChange(page: number): void {
    this.colegioPage = page;
    this.selectedColegioIds.clear();
  }

  addAllFilteredColegios(): void {
    this.filteredColegios.filter(c => c.email).forEach(c => this.addColegio(c));
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
    this.lastDetailDoc = '';
    setTimeout(() => {
      const dFrame = this.detailFrame?.nativeElement;
      if (dFrame) {
        const doc = this.detailPreviewDoc();
        this.lastDetailDoc = doc;
        this.renderPreview(dFrame, doc);
      }
    }, 0);
  }

  openCompose(comunicado?: Comunicado): void {
    this.view = 'compose';
    this.selected = null;
    this.showStats = false;
    this.stats = null;
    this.error = '';
    this.success = '';
    this.lastPreviewDoc = '';
    this.filterCalendario = '';
    this.filterTipoColegio = '';
    this.colegioSearch = '';
    this.selectedColegioIds.clear();
    this.colegioPage = 1;
    this.showColegiosPicker = false;
    this.showFiltersPanel = false;
    if (comunicado) {
      this.editingId = comunicado.id;
      this.asunto = comunicado.asunto;
      this.cuerpo = comunicado.cuerpo;
      this.design = Array.isArray(comunicado.design) ? comunicado.design : null;
      this.destinatarios = comunicado.destinatarios.map(d => ({
        email: d.email,
        nombre: d.nombre,
        colegio: d.colegio,
        tipo: d.tipo,
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
    this.destinatarios.push({
      email: colegio.email,
      nombre: colegio.nombre,
      colegio: colegio.nombre,
      tipo: this.colegioTipoLabel(colegio),
    });
  }

  removeDestinatario(email: string): void {
    this.destinatarios = this.destinatarios.filter(d => d.email !== email);
  }

  openRecipientsModal(): void {
    this.recipientPage = 1;
    this.recipientSearch = '';
    this.showRecipientsModal = true;
  }

  onCuerpoChange(v: string): void {
    this.cuerpo = v;
    this.cdr.detectChanges();
  }

  onDesignChange(v: unknown[] | null): void {
    this.design = v;
    this.cdr.detectChanges();
  }

  ngDoCheck(): void {
    if (this.view === 'compose') {
      const frame = this.composeFrame?.nativeElement;
      if (frame) {
        const doc = this.previewDoc();
        if (doc !== this.lastPreviewDoc) {
          this.lastPreviewDoc = doc;
          this.renderPreview(frame, doc);
        }
      }
    }
    if (this.selected && this.detailFrame?.nativeElement) {
      const doc = this.detailPreviewDoc();
      if (doc !== this.lastDetailDoc) {
        this.lastDetailDoc = doc;
        this.renderPreview(this.detailFrame.nativeElement, doc);
      }
    }
  }

  ngAfterViewInit(): void {
    const frame = this.composeFrame?.nativeElement;
    if (frame) {
      const doc = this.previewDoc();
      this.lastPreviewDoc = doc;
      this.renderPreview(frame, doc);
    }
    const dFrame = this.detailFrame?.nativeElement;
    if (dFrame && this.selected) {
      const doc = this.detailPreviewDoc();
      this.lastDetailDoc = doc;
      this.renderPreview(dFrame, doc);
    }
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
    return this.wrapEmail(body);
  }

  detailPreviewDoc(): string {
    if (!this.selected) return '';
    const raw = this.absolutizarUploads(this.selected.cuerpo);
    const body = limpiarHTML(raw);
    if (/<html[\s>]/i.test(body)) return body;
    return this.wrapEmail(body);
  }

  private wrapEmail(body: string): string {
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
    if (!cd) { frame.srcdoc = doc; return; }
    cd.open(); cd.write(doc); cd.close();
    this.syncFrameHeight(frame);
  }

  detailFrameLoad(): void {
    const frame = this.detailFrame?.nativeElement;
    if (frame) this.syncFrameHeight(frame);
  }

  private syncFrameHeight(frame: HTMLIFrameElement): void {
    try {
      const h = frame.contentWindow?.document.body?.scrollHeight;
      if (typeof h === 'number' && h > 0) frame.style.height = h + 'px';
    } catch { /* cross-origin no aplica */ }
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
    this.showSendConfirm = false;
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

  colegioTipoLabel(c: Colegio): string {
    if (c.calendario === 'A') return 'Calendario A';
    if (c.calendario === 'B') return 'Calendario B';
    if (c.tipoColegio) return c.tipoColegio;
    return '';
  }

  // ─── Compose recipients pagination ───
  recipientPage = 1;
  recipientSearch = '';
  readonly RECIPIENT_PAGE_SIZE = 10;

  get filteredRecipientDestinatarios(): Destinatario[] {
    let list = this.destinatarios;
    if (this.recipientSearch) {
      const q = this.recipientSearch.toLowerCase();
      list = list.filter(d =>
        d.nombre.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.colegio && d.colegio.toLowerCase().includes(q)) ||
        (d.tipo && d.tipo.toLowerCase().includes(q))
      );
    }
    return list;
  }

  get recipientTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRecipientDestinatarios.length / this.RECIPIENT_PAGE_SIZE));
  }

  get paginatedDestinatarios(): Destinatario[] {
    const start = (this.recipientPage - 1) * this.RECIPIENT_PAGE_SIZE;
    return this.filteredRecipientDestinatarios.slice(start, start + this.RECIPIENT_PAGE_SIZE);
  }

  recipientPageChange(page: number): void {
    this.recipientPage = page;
  }

  // ─── Detail recipients modal ───
  showDetailRecipientsModal = false;
  detailRecipientPage = 1;
  detailRecipientSearch = '';
  readonly DETAIL_PAGE_SIZE = 10;

  get filteredDetailDestinatarios(): Destinatario[] {
    if (!this.selected) return [];
    let list = this.selected.destinatarios;
    if (this.detailRecipientSearch) {
      const q = this.detailRecipientSearch.toLowerCase();
      list = list.filter(d =>
        d.nombre.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.colegio && d.colegio.toLowerCase().includes(q)) ||
        (d.tipo && d.tipo.toLowerCase().includes(q))
      );
    }
    return list;
  }

  get detailRecipientTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredDetailDestinatarios.length / this.DETAIL_PAGE_SIZE));
  }

  get paginatedDetailDestinatarios(): Destinatario[] {
    const start = (this.detailRecipientPage - 1) * this.DETAIL_PAGE_SIZE;
    return this.filteredDetailDestinatarios.slice(start, start + this.DETAIL_PAGE_SIZE);
  }

  detailRecipientPageChange(page: number): void {
    this.detailRecipientPage = page;
  }

  openDetailRecipientsModal(): void {
    this.detailRecipientPage = 1;
    this.detailRecipientSearch = '';
    this.showDetailRecipientsModal = true;
  }

  get statsFailedCount(): number {
    if (!this.stats?.detalle) return 0;
    return this.stats.detalle.filter((d: any) => d.sendStatus === 'failed').length;
  }
}
