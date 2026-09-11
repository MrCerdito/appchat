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

import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ComunicadosService, Colegio, FiltroPerfilComunicado, SmtpCuota, SendLanzamiento, BounceResult } from '../../../../core/services/comunicados.service';
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
  'Tu caso fue registrado\n\nHola Laura Gomez,\n\nRecibimos tu solicitud y quedo registrada. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat.\n\nQuedamos atentos,\nEquipo de Soporte';

@Component({
  selector: 'app-comunicados',
  standalone: true,
  imports: [FormsModule, MailEditorComponent, SendConfirmModalComponent],
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

  // Lote SMTP del día y progreso del envío en vivo
  smtpCuota: SmtpCuota | null = null;
  quotaLoading = false;
  sendLanzamiento: SendLanzamiento | null = null;
  sendTotal = 0;
  sendProcesados = 0;
  sendRestantes = 0;
  sendPct = 0;
  sendErrores: { email: string; nombre: string; error: string }[] = [];
  showSendErrors = false;
  private sendPollTimer: any = null;

  // Modals
  showSendConfirm = false;
  showRecipientsModal = false;

  // Configurador de plantillas
  tplActive = false;
  tplSaving = false;
  tplEditingId: string | null = null;
  tplName = '';
  tplAsunto = '';
  tplCuerpo = '';
  tplDesign: unknown[] | null = null;

  // Compose
  editingId: string | null = null;
  selectedTemplateId: string | null = null;
  asunto = '';
  cuerpo = '';
  design: unknown[] | null = null;
  destinatarios: Destinatario[] = [];
  showColegiosPicker = false;
  colegioSearch = '';

  // Correo manual (independiente de la planilla)
  manualEmail = '';
  manualEmailError = '';

  // Filtros avanzados
  showFiltersPanel = false;
  filterTipoColegio: '' | 'Sian365' | 'ControlAcademic' = '';
  filterCalendario: '' | 'A' | 'B' = '';
  filterCiudad = '';
  filtrosPerfil: FiltroPerfilComunicado[] = [];
  filterPerfil: Set<string> = new Set();

  // Seleccion masiva
  selectedColegioIds: Set<string> = new Set();
  selectAllMode = false;
  menuColegioId: string | null = null;

  // Paginacion colegios
  colegioPage = 1;
  colegioPageSize = 5;
  readonly COLEGIO_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

  @ViewChild('composeFrame') private readonly composeFrame?: ElementRef<HTMLIFrameElement>;
  @ViewChild('detailFrame') private readonly detailFrame?: ElementRef<HTMLIFrameElement>;
  @ViewChild('templateFrame') private readonly templateFrame?: ElementRef<HTMLIFrameElement>;
  private lastPreviewDoc = '';
  private lastDetailDoc = '';
  private lastTplDoc = '';
  private lastTplRawCuerpo = '';
  private lastTplCleanCuerpo = '';
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
      next: (res) => {
        this.colegios = res.colegios;
        this.filtrosPerfil = res.filtrosPerfil;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.stopSendPolling();
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

  enterTemplates(): void {
    this.view = 'templates';
    this.selected = null;
    this.showStats = false;
    this.stats = null;
    this.error = '';
    this.success = '';
    if (!this.tplActive) {
      if (this.templates.length > 0) {
        this.editTemplate(this.templates[0]);
      } else {
        this.openNewTemplate();
      }
    }
    this.cdr.detectChanges();
  }

  openNewTemplate(): void {
    this.tplActive = true;
    this.tplEditingId = null;
    this.tplName = '';
    this.tplAsunto = '';
    this.tplCuerpo = CUERPO_FALLBACK;
    this.tplDesign = null;
    this.lastTplDoc = '';
    this.lastTplRawCuerpo = '';
    this.error = '';
    this.cdr.detectChanges();
  }

  editTemplate(t: ComunicadoTemplate): void {
    this.tplActive = true;
    this.tplEditingId = t.id;
    this.tplName = t.name;
    this.tplAsunto = t.asunto;
    this.tplCuerpo = t.cuerpo;
    this.tplDesign = Array.isArray(t.design) ? t.design : null;
    this.lastTplDoc = '';
    this.lastTplRawCuerpo = '';
    this.error = '';
    this.cdr.detectChanges();
  }

  saveTemplateConfig(): void {
    const name = this.tplName.trim();
    if (!name) {
      this.error = 'El nombre de la plantilla es obligatorio';
      this.cdr.detectChanges();
      return;
    }
    if (!this.tplAsunto.trim()) {
      this.error = 'El asunto es obligatorio';
      this.cdr.detectChanges();
      return;
    }
    this.tplSaving = true;
    this.error = '';
    const isNew = !this.tplEditingId;
    const id = this.tplEditingId;
    const obs = id
      ? this.service.updateTemplate(id, name, this.tplAsunto, this.tplCuerpo, this.tplDesign)
      : this.service.saveTemplate(name, this.tplAsunto, this.tplCuerpo, this.tplDesign);
    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: (t) => {
        this.tplSaving = false;
        this.tplEditingId = t.id;
        this.tplName = t.name;
        this.loadTemplates();
        this.showSuccessMsg(isNew ? 'Plantilla creada' : 'Plantilla actualizada');
      },
      error: (err) => {
        this.tplSaving = false;
        this.error = err.error?.message || 'Error al guardar la plantilla';
        this.notification.error('Error al guardar la plantilla', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  deleteCurrentTemplate(): void {
    const t = this.templates.find((x) => x.id === this.tplEditingId);
    if (t) this.deleteTemplate(t);
  }

  deleteTemplate(t: ComunicadoTemplate): void {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    this.service.deleteTemplate(t.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.templates = this.templates.filter((x) => x.id !== t.id);
        if (this.tplEditingId === t.id) {
          this.tplActive = false;
          this.tplEditingId = null;
          this.tplName = '';
          this.tplAsunto = '';
          this.tplCuerpo = '';
          this.tplDesign = null;
          this.lastTplDoc = '';
          this.lastTplRawCuerpo = '';
          if (this.templates.length > 0) {
            this.editTemplate(this.templates[0]);
          } else {
            this.openNewTemplate();
          }
        }
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
    return this.comunicados.filter(c => c.status === 'sent' || c.status === 'failed' || c.status === 'sending');
  }

  get superaLote(): boolean {
    const q = this.smtpCuota;
    if (!q?.configurado) return false;
    return this.destinatarios.length > 0 && this.destinatarios.length > q.restante;
  }

  get sendProgreso(): { total: number; procesados: number; restantes: number; pct: number } {
    return {
      total: this.sendTotal,
      procesados: this.sendProcesados,
      restantes: this.sendRestantes,
      pct: this.sendPct,
    };
  }

  get filteredColegios(): Colegio[] {
    let result = this.colegios;
    if (this.filterCalendario) {
      result = result.filter(c => c.calendario === this.filterCalendario);
    }
    if (this.filterTipoColegio) {
      result = result.filter(c => c.tipoColegio === this.filterTipoColegio);
    }
    if (this.filterCiudad) {
      result = result.filter(c => (c as any).ciudad === this.filterCiudad);
    }
    if (this.filterPerfil.size > 0) {
      result = result.filter(c => {
        const pf = c.perfilFiltros ?? {};
        for (const campoId of this.filterPerfil) {
          if (pf[campoId] !== 'true') return false;
        }
        return true;
      });
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

  get colegioCiudades(): string[] {
    const set = new Set<string>();
    this.colegios.forEach(c => {
      const v = (c as any).ciudad;
      if (v && typeof v === 'string' && v.trim()) set.add(v.trim());
    });
    return [...set].sort();
  }

  get paginatedColegios(): Colegio[] {
    const start = (this.colegioPage - 1) * this.colegioPageSize;
    return this.filteredColegios.slice(start, start + this.colegioPageSize);
  }

  get colegioTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredColegios.length / this.colegioPageSize));
  }

  get colegioPageNumbers(): number[] {
    const total = this.colegioTotalPages;
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  get paginatedEnd(): number {
    return Math.min(this.colegioPage * this.colegioPageSize, this.filteredColegios.length);
  }

  get activeFilterChips(): { label: string; key: string }[] {
    const chips: { label: string; key: string }[] = [];
    if (this.filterCalendario) chips.push({ label: `Cal. ${this.filterCalendario}`, key: 'calendario' });
    if (this.filterTipoColegio) chips.push({ label: this.filterTipoColegio === 'Sian365' ? 'Sian365' : 'Control Academic', key: 'tipo' });
    if (this.filterCiudad) chips.push({ label: this.filterCiudad, key: 'ciudad' });
    this.filtrosPerfil.forEach(f => {
      if (this.filterPerfil.has(f.id)) chips.push({ label: f.nombre, key: `perfil:${f.id}` });
    });
    return chips;
  }

  get activeFilterCount(): number {
    return (this.filterCalendario ? 1 : 0) + (this.filterTipoColegio ? 1 : 0) + (this.filterCiudad ? 1 : 0) + this.filterPerfil.size;
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
    const seleccionados = this.colegios.filter(c =>
      this.selectedColegioIds.has(c.id),
    );
    const sinCorreo = seleccionados.filter(c => !c.email);
    seleccionados.filter(c => c.email).forEach(c => this.addColegio(c));
    this.selectedColegioIds.clear();
    this.selectAllMode = false;
    this.notificarColegiosSinCorreo(sinCorreo);
  }

  private notificarColegiosSinCorreo(sinCorreo: Colegio[]): void {
    if (sinCorreo.length === 0) return;
    const max = 5;
    const lista = sinCorreo
      .slice(0, max)
      .map(c => c.nombre)
      .join('; ');
    const restantes = sinCorreo.length - Math.min(sinCorreo.length, max);
    const extra = restantes > 0 ? ` y ${restantes} más` : '';
    const msg =
      `Los siguientes colegios no cuentan con un correo, por lo tanto no se ` +
      `agregaron a los destinatarios: ${lista}${extra}.`;
    this.notification.warning('Colegios sin correo', msg);
  }

  clearColegioSelection(): void {
    this.selectedColegioIds.clear();
    this.selectAllMode = false;
  }

  isColegioSelected(id: string): boolean {
    return this.selectedColegioIds.has(id);
  }

  isColegioAdded(colegio: Colegio): boolean {
    return this.correosDeColegio(colegio).some((email) =>
      this.destinatarios.some(
        (d) => d.email.toLowerCase() === email.toLowerCase(),
      ),
    );
  }

  removeFilterChip(key: string): void {
    if (key === 'calendario') this.filterCalendario = '';
    if (key === 'tipo') this.filterTipoColegio = '';
    if (key === 'ciudad') this.filterCiudad = '';
    if (key.startsWith('perfil:')) this.filterPerfil.delete(key.slice(7));
    this.colegioPage = 1;
  }

  clearAllFilters(): void {
    this.filterCalendario = '';
    this.filterTipoColegio = '';
    this.filterCiudad = '';
    this.colegioSearch = '';
    this.filterPerfil.clear();
    this.colegioPage = 1;
  }

  togglePerfilFilter(campoId: string): void {
    if (this.filterPerfil.has(campoId)) {
      this.filterPerfil.delete(campoId);
    } else {
      this.filterPerfil.add(campoId);
    }
    this.colegioPage = 1;
  }

  isPerfilFilterActive(campoId: string): boolean {
    return this.filterPerfil.has(campoId);
  }

  perfilFiltrosPorCategoria(): {
    categoriaId: string;
    categoriaNombre: string;
    filtros: FiltroPerfilComunicado[];
  }[] {
    const grupos: {
      categoriaId: string;
      categoriaNombre: string;
      filtros: FiltroPerfilComunicado[];
    }[] = [];
    const index = new Map<string, number>();
    for (const f of this.filtrosPerfil) {
      const catId = f.categoriaId?.trim() ? f.categoriaId : 'sin-categoria';
      const catNombre = f.categoriaNombre?.trim()
        ? f.categoriaNombre
        : 'Sin categoría';
      let i = index.get(catId);
      if (i === undefined) {
        i = grupos.length;
        index.set(catId, i);
        grupos.push({ categoriaId: catId, categoriaNombre: catNombre, filtros: [] });
      }
      grupos[i].filtros.push(f);
    }
    return grupos.sort((a, b) =>
      a.categoriaNombre.localeCompare(b.categoriaNombre, 'es'),
    );
  }

  onCiudadChange(value: string): void {
    this.filterCiudad = value;
    this.colegioPage = 1;
  }

  setFilter(name: 'proyecto' | 'calendario' | 'ciudad', value: string): void {
    if (name === 'proyecto') {
      this.filterTipoColegio = value as '' | 'Sian365' | 'ControlAcademic';
    } else if (name === 'calendario') {
      this.filterCalendario = value as '' | 'A' | 'B';
    } else {
      this.filterCiudad = value;
    }
    this.colegioPage = 1;
  }

  onColegioPageChange(page: number): void {
    this.colegioPage = page;
    this.selectedColegioIds.clear();
  }

  onColegioPageSizeChange(): void {
    this.colegioPage = 1;
  }

  addAllFilteredColegios(): void {
    const sinCorreo = this.filteredColegios.filter(c => !c.email);
    this.filteredColegios.filter(c => c.email).forEach(c => this.addColegio(c));
    this.notificarColegiosSinCorreo(sinCorreo);
  }

  exportColegios(): void {
    const list = this.filteredColegios;
    const enc = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const header = ['Nombre', 'Correo', 'Proyecto', 'Calendario', 'Ciudad'];
    const rows = list.map((c) => [
      enc(c.nombre),
      enc(c.email),
      enc(c.tipoColegio === 'Sian365' ? 'Sian365' : c.tipoColegio === 'ControlAcademic' ? 'Control Academic' : ''),
      enc(c.calendario ? `Cal. ${c.calendario}` : ''),
      enc((c as any).ciudad ?? ''),
    ].join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'destinatarios.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    this.notification.success('Exportación', `${list.length} colegio(s) exportado(s)`);
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
    this.selectedTemplateId = null;
    this.filterCalendario = '';
    this.filterTipoColegio = '';
    this.filterCiudad = '';
    this.filterPerfil.clear();
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

  addManualEmail(): void {
    const email = this.manualEmail.trim().toLowerCase();
    if (!email) {
      this.manualEmailError = 'Escribe un correo para agregarlo.';
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      this.manualEmailError = `"${this.manualEmail.trim()}" no parece un correo válido.`;
      return;
    }
    if (this.destinatarios.some(d => d.email.toLowerCase() === email)) {
      this.manualEmailError = `El correo ${email} ya está en los destinatarios.`;
      return;
    }
    this.destinatarios.push({ email, nombre: email, colegio: '', tipo: '' });
    this.manualEmail = '';
    this.manualEmailError = '';
    this.notification.success('Correo agregado', `${email} se agregó a los destinatarios.`);
  }

  addColegio(colegio: Colegio): void {
    for (const email of this.correosDeColegio(colegio)) {
      if (
        this.destinatarios.some(
          (d) => d.email.toLowerCase() === email.toLowerCase(),
        )
      ) {
        continue;
      }
      this.destinatarios.push({
        email,
        nombre: colegio.nombre,
        colegio: colegio.nombre,
        tipo: this.colegioTipoLabel(colegio),
      });
    }
  }

  private correosDeColegio(colegio: Colegio): string[] {
    if (!colegio.email) return [];
    const vistos = new Set<string>();
    const correos: string[] = [];
    for (const raw of String(colegio.email).split(/[|,;]+/)) {
      const email = raw.trim();
      if (!email) continue;
      const clave = email.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      correos.push(email);
    }
    return correos;
  }

  onTemplateSelect(id: string | null): void {
    if (!id) return;
    const t = this.templates.find(x => x.id === id);
    if (!t) return;
    this.asunto = t.asunto;
    this.cuerpo = t.cuerpo;
    this.design = Array.isArray(t.design) ? t.design : null;
    this.editingId = null;
    this.lastPreviewDoc = '';
    this.error = '';
    this.cdr.detectChanges();
  }

  removeDestinatario(email: string): void {
    this.destinatarios = this.destinatarios.filter(d => d.email !== email);
  }

  toggleColegioMenu(id: string): void {
    this.menuColegioId = this.menuColegioId === id ? null : id;
  }

  buscarColegio(link?: string): void {
    if (!link) return;
    window.open(link, '_blank');
  }

  colegioCiudad(c: Colegio): string {
    return (c as any).ciudad ?? '';
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

  onTplCuerpoChange(v: string): void {
    this.tplCuerpo = v;
    this.cdr.detectChanges();
  }

  onTplDesignChange(v: unknown[] | null): void {
    this.tplDesign = v;
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
    if (this.view === 'templates' && this.tplActive) {
      const frame = this.templateFrame?.nativeElement;
      if (frame) {
        const doc = this.templatePreviewDoc();
        if (doc !== this.lastTplDoc) {
          this.lastTplDoc = doc;
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
    const tFrame = this.templateFrame?.nativeElement;
    if (tFrame && this.view === 'templates' && this.tplActive) {
      const doc = this.templatePreviewDoc();
      this.lastTplDoc = doc;
      this.renderPreview(tFrame, doc);
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

  templatePreviewAsunto(): string {
    return (this.tplAsunto || '')
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*colegio\s*\}\}/g, 'Colegio San Jose')
      .replace(/\{\{\s*email\s*\}\}/g, 'rectoria@colegio.edu.co')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026')
      .replace(/\{\{\s*firma\s*\}\}/g, 'Equipo de Soporte');
  }

  templatePreviewCuerpo(): string {
    const raw = this.absolutizarUploads(this.tplCuerpo);
    if (raw !== this.lastTplRawCuerpo) {
      this.lastTplRawCuerpo = raw;
      this.lastTplCleanCuerpo = limpiarHTML(raw);
    }
    return this.lastTplCleanCuerpo
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura Gomez')
      .replace(/\{\{\s*colegio\s*\}\}/g, 'Colegio San Jose')
      .replace(/\{\{\s*email\s*\}\}/g, 'rectoria@colegio.edu.co')
      .replace(/\{\{\s*fecha\s*\}\}/g, '14/08/2026')
      .replace(/\{\{\s*firma\s*\}\}/g, 'Equipo de Soporte');
  }

  templatePreviewDoc(): string {
    const body = this.templatePreviewCuerpo();
    if (/<html[\s>]/i.test(body)) return body;
    return this.wrapEmail(body);
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

  openSendConfirmModal(): void {
    if (this.sending) return;
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    if (!this.destinatarios.length) { this.error = 'Agrega al menos un destinatario'; return; }
    this.error = '';
    this.quotaLoading = true;
    this.cdr.detectChanges();

    this.service.getSmtpCuota().pipe(takeUntil(this.destroy$)).subscribe({
      next: (q) => {
        this.smtpCuota = q;
        this.quotaLoading = false;
        this.cdr.detectChanges();
        if (!q.configurado) {
          this.error = 'Configura el correo SMTP (servidor, usuario, contraseña de aplicación y remitente) en Configuración antes de enviar.';
          this.notification.error('SMTP no configurado', 'Configura el correo SMTP antes de enviar.');
          this.cdr.detectChanges();
          return;
        }
        this.showSendConfirm = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.quotaLoading = false;
        this.notification.error('Error', 'No se pudo consultar el lote SMTP.');
        this.cdr.detectChanges();
      },
    });
  }

  closeSendConfirm(): void {
    if (this.sending) return;
    this.showSendConfirm = false;
    this.smtpCuota = null;
  }

  sendNow(): void {
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    if (!this.destinatarios.length) { this.error = 'Agrega al menos un destinatario'; return; }
    this.sending = true;
    this.error = '';
    this.sendErrores = [];
    this.sendLanzamiento = null;
    this.sendTotal = this.destinatarios.length;
    this.sendProcesados = 0;
    this.sendRestantes = this.destinatarios.length;
    this.sendPct = 0;
    this.cdr.detectChanges();

    const save$ = this.editingId
      ? this.service.update(this.editingId, this.asunto, this.cuerpo, this.destinatarios, this.design)
      : this.service.saveDraft(this.asunto, this.cuerpo, this.destinatarios, this.design);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => {
        this.service.send(c.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: (la) => {
            this.sendLanzamiento = la;
            this.sendTotal = la.total;
            this.sendRestantes = la.total;
            this.startSendPolling(la.id);
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.sending = false;
            this.showSendConfirm = false;
            this.error = err.error?.message || 'No se pudo iniciar el envío';
            this.notification.error('No se pudo enviar', this.error);
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.sending = false;
        this.showSendConfirm = false;
        this.error = err.error?.message || 'Error al guardar el comunicado';
        this.notification.error('Error al guardar', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  private startSendPolling(id: string): void {
    this.stopSendPolling();
    this.sendPollTimer = setInterval(() => {
      this.service.getOne(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (c) => {
          if (this.sendPollTimer === null) return;
          const procesados = c.destinatarios.filter(
            (d) => d.sendStatus === 'ok' || d.sendStatus === 'failed',
          ).length;
          this.sendProcesados = procesados;
          this.sendRestantes = Math.max(0, c.destinatarios.length - procesados);
          this.sendPct = c.destinatarios.length
            ? Math.round((procesados / c.destinatarios.length) * 100)
            : 0;
          this.cdr.detectChanges();

          if (c.status !== 'sending') {
            this.stopSendPolling();
            this.finalizeSend(c);
          }
        },
        error: () => { /* transitorio: seguir intentando */ },
      });
    }, 700);
  }

  private stopSendPolling(): void {
    if (this.sendPollTimer != null) {
      clearInterval(this.sendPollTimer);
      this.sendPollTimer = null;
    }
  }

  private finalizeSend(c: Comunicado): void {
    if (!this.sending) return;
    this.sending = false;
    this.showSendConfirm = false;
    this.showSendErrors = false;

    const fallidos = c.destinatarios.filter((d) => d.sendStatus === 'failed');
    this.sendErrores = fallidos.map((d) => ({
      email: d.email,
      nombre: d.nombre,
      error: d.sendError || 'No entregado (sin detalle del servidor).',
    }));
    const ok = c.destinatarios.length - fallidos.length;

    this.view = 'sent';
    this.editingId = null;
    this.smtpCuota = null;
    this.loadAll();

    if (fallidos.length === 0) {
      this.showSuccessMsg(`Comunicado enviado a ${c.destinatarios.length} destinatario(s)`);
    } else {
      this.showSendErrors = true;
      this.notification.warning(
        'Envío con errores',
        `Entregado a ${ok} de ${c.destinatarios.length} · ${fallidos.length} rechazado(s).`,
      );
    }
    this.cdr.detectChanges();
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

  get statsBouncedCount(): number {
    if (!this.stats?.detalle) return 0;
    return this.stats.detalle.filter((d: any) => d.sendStatus === 'bounced').length;
  }

  // ─── Revisión de rebotes (NDR) ───
  checkingBounces = false;

  revisarRebotes(): void {
    if (!this.selected || this.checkingBounces) return;
    this.checkingBounces = true;
    this.cdr.detectChanges();
    this.service.checkBounces().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: BounceResult) => {
        this.checkingBounces = false;
        if (!res.ok) {
          this.notification.warning('Revisión de rebotes', res.error || 'No se pudo completar.');
          this.cdr.detectChanges();
          return;
        }
        if (res.actualizados > 0) {
          this.notification.success(
            'Rebotes detectados',
            `${res.actualizados} destinatario(s) marcado(s) como rebotado.`,
          );
        } else if (res.rebotados > 0) {
          this.notification.warning(
            'Revisión de rebotes',
            `Se hallaron ${res.rebotados} aviso(s), pero ninguno coincidía con envíos pendientes.`,
          );
        } else {
          this.notification.success('Revisión de rebotes', 'No se encontraron rebotes nuevos.');
        }
        void Promise.all([
          this.loadStatsSafe(this.selected?.id),
          this.loadOneSafe(this.selected?.id),
        ]);
        this.cdr.detectChanges();
      },
      error: () => {
        this.checkingBounces = false;
        this.notification.error('Revisión de rebotes', 'No se pudo consultar la bandeja de correo.');
        this.cdr.detectChanges();
      },
    });
  }

  private loadStatsSafe(id: string | undefined | null): Promise<void> {
    if (!id) return Promise.resolve();
    return new Promise((resolve) => {
      this.service.getStats(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (s) => { this.stats = s; resolve(); },
        error: () => resolve(),
      });
    });
  }

  private loadOneSafe(id: string | undefined | null): Promise<void> {
    if (!id) return Promise.resolve();
    return new Promise((resolve) => {
      this.service.getOne(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (c) => { this.selected = c; resolve(); },
        error: () => resolve(),
      });
    });
  }
}
