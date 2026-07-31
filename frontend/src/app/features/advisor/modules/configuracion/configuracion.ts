import { ChangeDetectorRef, Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfiguracionData,
  ConfiguracionFrontendService,
  HorarioAlmuerzo,
} from '../../../../core/services/configuracion.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  config: ConfiguracionData | null = null;
  loading = true;
  saving = false;
  saved = false;
  error = '';
  almuerzoActivo = false;
  almuerzoRestante = '';
  tab: 'bienvenida' | 'asesor' | 'cliente' | 'almuerzo' | 'respuestas' = 'bienvenida';
  diaSeleccionado: number | null = null;

  quickReplies: Array<{ id: string; name: string; content: string }> = [];
  editingReplyIdx: number | null = null;
  activeTextarea: HTMLTextAreaElement | null = null;
  showLinkModal = false;
  linkName = '';
  linkUrl = '';
  qrSearch = '';
  qrPage = 1;
  qrPageSize = 10;
  qrSelectedIds: Set<string> = new Set();
  qrDeletingBulk = false;
  pageSizeOptions = [10, 25, 50, 100];

  readonly placeholderBienvenida = 'Hola, soy {{asesor}}, en que puedo ayudarte?';

  readonly dias = [
    { value: 0, label: 'Domingo', short: 'Dom' },
    { value: 1, label: 'Lunes', short: 'Lun' },
    { value: 2, label: 'Martes', short: 'Mar' },
    { value: 3, label: 'Miercoles', short: 'Mie' },
    { value: 4, label: 'Jueves', short: 'Jue' },
    { value: 5, label: 'Viernes', short: 'Vie' },
    { value: 6, label: 'Sabado', short: 'Sab' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getEfectiva().pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.config = { ...config, almuerzos: config.almuerzos ?? [] };
        this.loading = false;
        if (this.config.almuerzos.length) {
          this.diaSeleccionado = this.config.almuerzos[0].dia;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });

    this.svc.getQuickRepliesConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: (quickReplies) => {
        this.quickReplies = this.normalizeQuickReplies(quickReplies);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

    private advisorFields: (keyof ConfiguracionData)[] = [
    'mensajeBienvenida', 'horarioFueraMsg', 'asesorInactividadSeg', 'asesorInactividadMsg',
    'clienteInactividadSeg', 'clienteInactividadMsg', 'clienteInactividadIters',
    'clienteCierreMsg', 'almuerzos',
  ];

  private extractError(err: any): string {
    const body = err.error;
    if (Array.isArray(body?.message)) {
      return body.message.join('. ');
    }
    if (typeof body?.message === 'string') {
      return body.message;
    }
    return 'Error al guardar. Intenta de nuevo.';
  }

  guardar(): void {
    if (!this.config) return;
    this.saving = true;
    this.error = '';

    const payload = {} as Partial<ConfiguracionData>;
    for (const field of this.advisorFields) {
      (payload as any)[field] = this.config[field];
    }

    this.svc.guardar(payload).subscribe({
      next: (config) => {
        this.config = { ...config, almuerzos: config.almuerzos ?? [] };

        this.svc.guardarQuickReplies({ whatsappQuickReplies: this.quickReplies }).subscribe({
          next: () => {
            this.saving = false;
            this.saved = true;
            this.notification.success('Configuración guardada', 'Tus cambios se aplicaron correctamente.');
            setTimeout(() => { this.saved = false; this.cdr.detectChanges(); }, 3000);
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.saving = false;
            this.error = this.extractError(err);
            this.notification.error('Error al guardar respuestas rápidas', this.error);
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.error = this.extractError(err);
        this.notification.error('Error al guardar', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  getDiaNombre(dia: number): string {
    return this.dias.find(d => d.value === dia)?.label ?? '';
  }

  tieneAlmuerzo(dia: number): boolean {
    return !!this.config?.almuerzos?.find(a => a.dia === dia);
  }

  getAlmuerzo(dia: number): HorarioAlmuerzo {
    return this.config?.almuerzos?.find(a => a.dia === dia)
      ?? { dia, inicio: '12:00', fin: '13:00' };
  }

  seleccionarDia(dia: number): void {
    if (!this.config) return;

    if (!this.tieneAlmuerzo(dia)) {
      this.config.almuerzos = [
        ...(this.config.almuerzos ?? []),
        { dia, inicio: '12:00', fin: '13:00' },
      ].sort((a, b) => a.dia - b.dia);
      this.diaSeleccionado = dia;
    } else if (this.diaSeleccionado === dia) {
      this.diaSeleccionado = null;
    } else {
      this.diaSeleccionado = dia;
    }
  }

  quitarAlmuerzo(dia: number): void {
    if (!this.config) return;
    this.config.almuerzos = this.config.almuerzos.filter(a => a.dia !== dia);
    this.diaSeleccionado = null;
  }

  setAlmuerzoInicio(dia: number, valor: string): void {
    const slot = this.config?.almuerzos?.find(a => a.dia === dia);
    if (slot) slot.inicio = valor;
  }

  setAlmuerzoFin(dia: number, valor: string): void {
    const slot = this.config?.almuerzos?.find(a => a.dia === dia);
    if (slot) slot.fin = valor;
  }

  horaAPct(hora: string | undefined): number {
    if (!hora) return 0;
    const [h, m] = hora.split(':').map(Number);
    const totalMins = h * 60 + m;
    const startMins = 7 * 60;
    const rangeMins = 12 * 60;
    return Math.min(100, Math.max(0, ((totalMins - startMins) / rangeMins) * 100));
  }

  segsToMins(segs: number): number {
    return Math.round((segs || 0) / 60);
  }

  minsToSegs(mins: number): number {
    return Math.max(1, Number(mins) || 1) * 60;
  }

  setAsesorMins(mins: number): void {
    if (this.config) this.config.asesorInactividadSeg = this.minsToSegs(mins);
  }

  setClienteMins(mins: number): void {
    if (this.config) this.config.clienteInactividadSeg = this.minsToSegs(mins);
  }

  getIters(): number[] {
    return Array.from(
      { length: this.config?.clienteInactividadIters ?? 0 },
      (_, i) => i,
    );
  }

  initQuickRepliesFromConfig(): void {
    this.refreshQuickReplies();
  }

  private refreshQuickReplies(): void {
    this.svc.getQuickRepliesConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: (quickReplies) => {
        this.quickReplies = this.normalizeQuickReplies(quickReplies);
        this.qrSelectedIds.clear();
        this.qrPage = 1;
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges(),
    });
  }

  exportarQuickRepliesCsv(): void {
    this.svc.exportQuickRepliesCsv().pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'respuestas-rapidas.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.notification.error('Error', 'No se pudo exportar las respuestas rápidas'),
    });
  }

  importarQuickRepliesCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      let csv: string;
      try {
        csv = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        csv = new TextDecoder('windows-1252').decode(buf);
      }
      csv = csv.replace(/^\uFEFF/, '');
      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        this.notification.error('Error', 'El CSV está vacío');
        input.value = '';
        return;
      }

      const header = lines[0].toLowerCase();
      const cols = header.split(';').map((c: string) => c.trim().replace(/"/g, ''));
      const nIdx = cols.indexOf('name');
      const cIdx = cols.indexOf('content');

      if (nIdx === -1 || cIdx === -1) {
        this.notification.error('Error', 'El CSV debe tener columnas "name" y "content"');
        input.value = '';
        return;
      }

      const items: { name: string; content: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = this.parseCsvLine(lines[i]);
        const name = vals[nIdx]?.trim().slice(0, 60);
        const content = vals[cIdx]?.trim().slice(0, 500);
        if (name && content) {
          items.push({ name, content });
        }
      }

      if (!items.length) {
        this.notification.error('Error', 'No se encontraron datos válidos en el CSV');
        input.value = '';
        return;
      }

      this.svc.importBulkQuickReplies(items).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          const msg = `${res.imported} respuesta${res.imported === 1 ? '' : 's'} importada${res.imported === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} omitida${res.skipped === 1 ? '' : 's'} por duplicado)` : ''}`;
          this.notification.success('Importación completa', msg);
          input.value = '';
          this.refreshQuickReplies();
        },
        error: (err) => {
          this.notification.error('Error', err.error?.message || 'No se pudo importar');
          input.value = '';
        },
      });
    };
    reader.readAsArrayBuffer(file);
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ';' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  get quickRepliesFiltrados(): Array<{ id: string; name: string; content: string }> {
    const q = this.qrSearch.trim().toLowerCase();
    if (!q) return this.quickReplies;
    return this.quickReplies.filter(r =>
      r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
    );
  }

  get paginatedQuickReplies(): Array<{ id: string; name: string; content: string }> {
    const start = (this.qrPage - 1) * this.qrPageSize;
    return this.quickRepliesFiltrados.slice(start, start + this.qrPageSize);
  }

  get totalQrPages(): number {
    return Math.ceil(this.quickRepliesFiltrados.length / this.qrPageSize);
  }

  qrPageRange(): number[] {
    const total = this.totalQrPages;
    const current = this.qrPage;
    const range: number[] = [];
    let start = Math.max(1, current - 2);
    let end = Math.min(total, current + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(total, start + 4);
      else start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }

  setQrPage(page: number): void {
    if (page < 1 || page > this.totalQrPages) return;
    this.qrPage = page;
    this.cdr.detectChanges();
  }

  onQrPageSizeChange(size: number): void {
    this.qrPageSize = size;
    this.qrPage = 1;
    this.cdr.detectChanges();
  }

  toggleQrSelection(id: string): void {
    if (this.qrSelectedIds.has(id)) {
      this.qrSelectedIds.delete(id);
    } else {
      this.qrSelectedIds.add(id);
    }
    this.cdr.detectChanges();
  }

  toggleAllQr(): void {
    const currentIds = this.paginatedQuickReplies.map(r => r.id);
    const allSelected = currentIds.every(id => this.qrSelectedIds.has(id));
    if (allSelected) {
      for (const id of currentIds) this.qrSelectedIds.delete(id);
    } else {
      for (const id of currentIds) this.qrSelectedIds.add(id);
    }
    this.cdr.detectChanges();
  }

  selectAllQr(): void {
    for (const r of this.quickRepliesFiltrados) {
      this.qrSelectedIds.add(r.id);
    }
    this.cdr.detectChanges();
  }

  deleteQrSeleccionadas(): void {
    const ids = Array.from(this.qrSelectedIds);
    if (!ids.length) return;
    this.qrDeletingBulk = true;
    this.svc.deleteBulkQuickReplies(ids).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.qrDeletingBulk = false;
        this.qrSelectedIds.clear();
        this.refreshQuickReplies();
        this.notification.success('Eliminadas', `${res.deleted} respuesta${res.deleted === 1 ? '' : 's'} eliminada${res.deleted === 1 ? '' : 's'}.`);
      },
      error: (err) => {
        this.qrDeletingBulk = false;
        this.notification.error('Error', err.error?.message || 'Error al eliminar respuestas.');
        this.cdr.detectChanges();
      },
    });
  }

  private normalizeQuickReplies(value: any[]): Array<{ id: string; name: string; content: string }> {
    if (!Array.isArray(value) || !value.length) {
      return [
        { id: 'qr_1', name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
        { id: 'qr_2', name: 'Espera', content: 'Dame un momento mientras valido la informacion.' },
        { id: 'qr_3', name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
      ];
    }
    let nextId = 1;
    for (const r of value) {
      if (r.id && /^qr_\d+$/.test(String(r.id))) {
        const num = parseInt(String(r.id).slice(3), 10);
        if (num >= nextId) nextId = num + 1;
      }
    }
    if (typeof value[0] === 'string') {
      return value
        .map((text: string) => {
          const clean = text.trim();
          if (!clean) return null;
          return { id: `qr_${nextId++}`, name: clean.slice(0, 60), content: clean };
        })
        .filter(Boolean) as any;
    }
    return value
      .filter((r: any) => r?.name && r?.content)
      .map((r: any) => ({
        id: r.id || `qr_${nextId++}`,
        name: String(r.name).slice(0, 60),
        content: String(r.content).slice(0, 500),
      }));
  }

  addQuickReply(): void {
    let nextId = 1;
    for (const r of this.quickReplies) {
      if (r.id && /^qr_\d+$/.test(String(r.id))) {
        const num = parseInt(String(r.id).slice(3), 10);
        if (num >= nextId) nextId = num + 1;
      }
    }
    this.quickReplies.push({ id: `qr_${nextId}`, name: '', content: '' });
    this.editingReplyIdx = this.quickReplies.length - 1;
  }

  removeQuickReply(idx: number): void {
    const removed = this.quickReplies[idx];
    this.quickReplies.splice(idx, 1);
    if (removed) this.qrSelectedIds.delete(removed.id);
    if (this.editingReplyIdx === idx) this.editingReplyIdx = null;
    else if (this.editingReplyIdx !== null && this.editingReplyIdx > idx) this.editingReplyIdx--;
  }

  moveQuickReply(idx: number, dir: -1 | 1): void {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= this.quickReplies.length) return;
    const temp = this.quickReplies[idx];
    this.quickReplies[idx] = this.quickReplies[newIdx];
    this.quickReplies[newIdx] = temp;
    if (this.editingReplyIdx === idx) this.editingReplyIdx = newIdx;
    else if (this.editingReplyIdx === newIdx) this.editingReplyIdx = idx;
  }

  startEditReply(idx: number): void {
    this.editingReplyIdx = this.editingReplyIdx === idx ? null : idx;
    if (this.editingReplyIdx !== null) {
      setTimeout(() => {
        const el = document.querySelector(`.qr-item:nth-child(${idx + 1}) .qr-item-editor textarea`) as HTMLTextAreaElement | null;
        if (el) this.activeTextarea = el;
      });
    }
  }

  onTextareaClick(textarea: HTMLTextAreaElement): void {
    this.activeTextarea = textarea;
  }

  formatPreview(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
  }

  insertBold(): void {
    const textarea = this.activeTextarea;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const reply = this.quickReplies[this.editingReplyIdx!];
    if (!reply) return;

    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const wrapped = selected ? `**${selected}**` : '**texto**';
    textarea.value = before + wrapped + after;
    reply.content = textarea.value;

    const newCursorPos = start + wrapped.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(selected ? newCursorPos : start + 2, selected ? newCursorPos : start + 7);
    });
  }

  openLinkModal(): void {
    this.linkName = '';
    this.linkUrl = '';
    this.showLinkModal = true;
  }

  closeLinkModal(): void {
    this.showLinkModal = false;
  }

  insertLink(): void {
    if (!this.linkName.trim() || !this.linkUrl.trim()) return;
    const textarea = this.activeTextarea;
    if (!textarea) return;
    const reply = this.quickReplies[this.editingReplyIdx!];
    if (!reply) return;

    const start = textarea.selectionStart;
    const link = `[${this.linkName.trim()}](${this.linkUrl.trim()})`;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(textarea.selectionEnd);
    textarea.value = before + link + after;
    reply.content = textarea.value;

    this.showLinkModal = false;
    this.linkName = '';
    this.linkUrl = '';
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + link.length, start + link.length);
    });
  }

}
