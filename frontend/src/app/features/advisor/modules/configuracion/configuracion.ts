import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
})
export class ConfiguracionComponent implements OnInit {
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

  quickReplies: Array<{ name: string; content: string }> = [];
  editingReplyIdx: number | null = null;
  activeTextarea: HTMLTextAreaElement | null = null;
  showLinkModal = false;
  linkName = '';
  linkUrl = '';

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

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getEfectiva().subscribe({
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

    this.svc.getGlobal().subscribe({
      next: (globalConfig) => {
        this.quickReplies = this.normalizeQuickReplies(globalConfig.whatsappQuickReplies);
        this.cdr.detectChanges();
      },
    });
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

        this.svc.guardarGlobal({ whatsappQuickReplies: this.quickReplies }).subscribe({
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
    this.svc.getGlobal().subscribe({
      next: (globalConfig) => {
        this.quickReplies = this.normalizeQuickReplies(globalConfig.whatsappQuickReplies);
        this.cdr.detectChanges();
      },
    });
  }

  private normalizeQuickReplies(value: any[]): Array<{ name: string; content: string }> {
    if (!Array.isArray(value) || !value.length) {
      return [
        { name: 'Saludo', content: 'Hola, con gusto reviso tu caso.' },
        { name: 'Espera', content: 'Dame un momento mientras valido la informacion.' },
        { name: 'Despedida', content: 'Quedo atento si necesitas algo mas.' },
      ];
    }
    if (typeof value[0] === 'string') {
      return value
        .map((text: string) => ({ name: text.trim().slice(0, 60), content: text.trim() }))
        .filter(r => r.content)
        .slice(0, 20);
    }
    return value
      .filter((r: any) => r?.name && r?.content)
      .map((r: any) => ({ name: String(r.name).slice(0, 60), content: String(r.content).slice(0, 500) }))
      .slice(0, 20);
  }

  addQuickReply(): void {
    if (this.quickReplies.length >= 20) return;
    this.quickReplies.push({ name: '', content: '' });
    this.editingReplyIdx = this.quickReplies.length - 1;
  }

  removeQuickReply(idx: number): void {
    this.quickReplies.splice(idx, 1);
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
