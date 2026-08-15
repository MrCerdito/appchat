import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { environment } from '../../../../../../../environments/environment';
import { ConfiguracionFrontendService } from '../../../../../../core/services/configuracion.service';

export type MailAlign = 'left' | 'center' | 'right' | 'justify';

export interface MailBlockBase {
  id: string;
}

export interface MailTextBlock extends MailBlockBase {
  type: 'text';
  html: string;
  align?: MailAlign;
  color?: string;
  bg?: string;
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
}

export interface MailHeadingBlock extends MailBlockBase {
  type: 'heading';
  html: string;
  align?: MailAlign;
  color?: string;
  bg?: string;
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
}

export interface MailImageBlock extends MailBlockBase {
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  radius?: number;
  align?: MailAlign;
  link?: string;
  padding?: number;
}

export interface MailButtonBlock extends MailBlockBase {
  type: 'button';
  text: string;
  href: string;
  bg?: string;
  color?: string;
  radius?: number;
  fontSize?: number;
  padding?: number;
  align?: MailAlign;
  width?: number;
  height?: number;
}

export interface MailDividerBlock extends MailBlockBase {
  type: 'divider';
  color?: string;
  thickness?: number;
  padding?: number;
}

export interface MailSpacerBlock extends MailBlockBase {
  type: 'spacer';
  height: number;
}

export interface MailTokenBlock extends MailBlockBase {
  type: 'token';
  token: string;
  align?: MailAlign;
}

export interface MailHtmlBlock extends MailBlockBase {
  type: 'html';
  html: string;
}

export interface MailColumn {
  width: number;
  blocks: MailBlock[];
}

export interface MailColumnsBlock extends MailBlockBase {
  type: 'columns';
  cols: [MailColumn, MailColumn];
  gap?: number;
  padding?: number;
}

export type MailBlock =
  | MailTextBlock
  | MailHeadingBlock
  | MailImageBlock
  | MailButtonBlock
  | MailDividerBlock
  | MailSpacerBlock
  | MailTokenBlock
  | MailHtmlBlock
  | MailColumnsBlock;

export interface MailResizeEvent {
  event: MouseEvent;
  block: MailBlock;
  kind: 'width' | 'height' | 'thickness' | 'columns';
}

export interface MailTextChangeEvent {
  block: MailBlock;
  html: string;
}

export interface MailMoveEvent {
  block: MailBlock;
  dir: -1 | 1;
}

export interface MailAlignChangeEvent {
  block: MailBlock;
  align: MailAlign;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const ESC_RE = /&/g;

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(ESC_RE, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const readInt = (v: string | null | undefined, d: number): number => {
  if (!v) return d;
  const n = parseInt(v, 10);
  return isNaN(n) ? d : n;
};

const readAlign = (v: string | null | undefined): MailAlign => {
  if (v === 'left' || v === 'center' || v === 'right' || v === 'justify') return v;
  return 'left';
};

@Component({
  selector: 'mail-block-view',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './mail-block-view.html',
  styleUrl: './mail-block-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MailBlockViewComponent implements OnDestroy {
  @Input() block!: MailBlock;
  @Input() selectedId: string | null = null;
  @Input() level = 0;
  @Input() variables: Array<{ name: string; desc: string }> = [];

  @Output() selectBlock = new EventEmitter<MailBlock>();
  @Output() removeBlock = new EventEmitter<MailBlock>();
  @Output() moveBlock = new EventEmitter<MailMoveEvent>();
  @Output() textChange = new EventEmitter<MailTextChangeEvent>();
  @Output() alignChange = new EventEmitter<MailAlignChangeEvent>();
  @Output() resizeStart = new EventEmitter<MailResizeEvent>();
  @Output() dropBlocks = new EventEmitter<CdkDragDrop<MailBlock[]>>();

  variablesOpen = false;
  varMenuStyle: { top: number; left: number } | null = null;

  private varMenuRaf = 0;
  private listCleanRaf = 0;
  private readonly varMenuListenersBound = {
    mousedown: (ev: MouseEvent) => this.onVarDocMouseDown(ev),
    scroll: () => this.varReposition(),
    resize: () => this.varReposition(),
  };

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.varMenuCleanup();
  }

  // HTML ya confirmado por el bloque: el binding [innerHTML] usa este valor,
  // que solo se actualiza en blur, para que escribir en contenteditable no
  // resetee el cursor. El modelo (block.html) se actualiza en vivo en input.
  private committed = new Map<string, string>();

  get innerHtml(): string {
    const b = this.block as MailTextBlock | MailHeadingBlock | MailHtmlBlock;
    return this.committed.get(this.block.id) ?? b.html;
  }

  get label(): string {
    const map: Record<string, string> = {
      text: 'Texto',
      heading: 'Titulo',
      image: 'Imagen',
      button: 'Boton',
      divider: 'Separador',
      spacer: 'Espacio',
      token: 'Variable',
      html: 'HTML libre',
      columns: '2 columnas',
    };
    return map[this.block.type] || 'Bloque';
  }

  get blockAlign(): MailAlign {
    const b = this.block as MailTextBlock | MailHeadingBlock;
    return b.align || 'left';
  }

  setAlign(align: MailAlign): void {
    this.alignChange.emit({ block: this.block, align });
  }

  onTextInput(event: Event): void {
    this.textChange.emit({
      block: this.block,
      html: (event.target as HTMLElement).innerHTML,
    });
    const el = event.target as HTMLElement;
    if (el.querySelector('ul, ol')) this.scheduleListClean(el);
  }

  onTextBlur(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.querySelector('ul, ol')) this.limpiarListas(el);
    const html = el.innerHTML;
    this.committed.set(this.block.id, html);
    this.textChange.emit({ block: this.block, html });
  }

  onFormat(cmd: string, event: Event): void {
    event.preventDefault();
    const el = this.editable();
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false);
    if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
      this.limpiarListas(el);
      this.scheduleListClean(el);
    }
    this.commit(el.innerHTML);
  }

  onLink(event: Event): void {
    event.preventDefault();
    const el = this.editable();
    if (!el) return;
    const url = window.prompt('URL del enlace:', 'https://');
    if (url === null) return;
    el.focus();
    document.execCommand('createLink', false, url);
    this.commit(el.innerHTML);
  }

  onClearFormat(event: Event): void {
    event.preventDefault();
    const el = this.editable();
    if (!el) return;
    el.focus();
    document.execCommand('removeFormat', false);
    this.commit(el.innerHTML);
  }

  private editable(): HTMLElement | null {
    return document.querySelector(
      `[data-block-id="${this.block.id}"] .mb__editable`,
    ) as HTMLElement | null;
  }

  private commit(html: string): void {
    this.committed.set(this.block.id, html);
    this.textChange.emit({ block: this.block, html });
  }

  private scheduleListClean(el: HTMLElement): void {
    if (this.listCleanRaf) return;
    this.listCleanRaf = requestAnimationFrame(() => {
      this.listCleanRaf = 0;
      const current = this.editable();
      if (current && current.querySelector('ul, ol')) {
        this.limpiarListas(current);
        this.commit(current.innerHTML);
      }
    });
  }

  private limpiarListas(el: HTMLElement): void {
    el.querySelectorAll('ul, ol').forEach((ul) => {
      Array.from(ul.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && (n as Text).data.trim() === '>') {
          ul.removeChild(n);
        }
      });
      ul.querySelectorAll('li').forEach((li) => {
        li.querySelectorAll('div').forEach((div) => {
          while (div.firstChild) li.insertBefore(div.firstChild, div);
          li.removeChild(div);
        });
        Array.from(li.childNodes).forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE && (n as Text).data.trim() === '>') {
            li.removeChild(n);
          }
        });
        const first = li.firstChild;
        if (first?.nodeType === Node.TEXT_NODE) {
          (first as Text).data = (first as Text).data.replace(/^\s*>\s*/, '');
        }
        const last = li.lastChild;
        if (last?.nodeType === Node.TEXT_NODE) {
          (last as Text).data = (last as Text).data.replace(/\s*>\s*$/, '');
        }
      });
      ul.querySelectorAll('li').forEach((li) => {
        if (!li.textContent?.trim() && !li.querySelector('img, br, a, ul, ol, table')) {
          li.remove();
        }
      });
    });
  }

  toggleVariables(event: Event): void {
    event.preventDefault();
    this.variablesOpen = !this.variablesOpen;
    this.cdr.detectChanges();
    if (this.variablesOpen) {
      this.varMenuSetup();
      this.varReposition();
    } else {
      this.varMenuCleanup();
    }
  }

  insertVariable(name: string): void {
    const el = this.editable();
    if (el) {
      el.focus();
      const sel = window.getSelection();
      let hasCaret = false;
      if (sel && sel.rangeCount > 0) {
        hasCaret = el.contains(sel.getRangeAt(0).startContainer);
      }
      if (!hasCaret) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand('insertText', false, `{{${name}}}`);
      this.commit(el.innerHTML);
    }
    this.variablesOpen = false;
    this.varMenuCleanup();
    this.cdr.detectChanges();
  }

  private varMenuSetup(): void {
    document.addEventListener('mousedown', this.varMenuListenersBound.mousedown, true);
    document.addEventListener('scroll', this.varMenuListenersBound.scroll, true);
    window.addEventListener('resize', this.varMenuListenersBound.resize);
  }

  private varMenuCleanup(): void {
    document.removeEventListener('mousedown', this.varMenuListenersBound.mousedown, true);
    document.removeEventListener('scroll', this.varMenuListenersBound.scroll, true);
    window.removeEventListener('resize', this.varMenuListenersBound.resize);
    if (this.varMenuRaf) {
      cancelAnimationFrame(this.varMenuRaf);
      this.varMenuRaf = 0;
    }
  }

  private onVarDocMouseDown(ev: MouseEvent): void {
    const target = ev.target as Node | null;
    const host = document.querySelector(`[data-block-id="${this.block.id}"]`);
    const menu = document.querySelector('.mb__vmenu');
    if (target && (host?.contains(target) || menu?.contains(target))) return;
    this.variablesOpen = false;
    this.varMenuCleanup();
    this.cdr.detectChanges();
  }

  private varReposition(): void {
    if (this.varMenuRaf) return;
    this.varMenuRaf = requestAnimationFrame(() => {
      this.varMenuRaf = 0;
      this.positionVarMenu();
    });
  }

  private positionVarMenu(): void {
    const host = document.querySelector(`[data-block-id="${this.block.id}"]`) as HTMLElement | null;
    if (!host) return;
    const menu = document.querySelector('.mb__vmenu') as HTMLElement | null;
    const w = menu?.offsetWidth ?? 300;
    const h = menu?.offsetHeight ?? 420;
    const gap = 16;
    const margin = 10;
    const rect = host.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = Math.max(margin, Math.min(rect.right + gap, vw - w - margin));
    const top = Math.min(Math.max(margin, rect.top), Math.max(margin, vh - h - margin));

    this.varMenuStyle = { top, left };
  }
}

@Component({
  selector: 'app-mail-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MailBlockViewComponent],
  templateUrl: './mail-editor.component.html',
  styleUrl: './mail-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MailEditorComponent implements OnChanges, OnInit, OnDestroy {
  @Input() cuerpo = '';
  @Input() design: unknown[] | null = null;

  @Output() cuerpoChange = new EventEmitter<string>();
  @Output() designChange = new EventEmitter<unknown[] | null>();

  readonly variables = [
    { name: 'codigo', desc: 'Codigo del ticket (ej. TKT-2026-0001)' },
    { name: 'titulo', desc: 'Titulo del caso' },
    { name: 'descripcion', desc: 'Descripcion del caso' },
    { name: 'prioridad', desc: 'Prioridad (baja, media, alta, critica)' },
    { name: 'fecha', desc: 'Fecha y hora del registro' },
    { name: 'nombre', desc: 'Nombre del cliente' },
    { name: 'informacion', desc: 'Informacion del cliente (identificacion, rol, colegio, telefono, correo)' },
    { name: 'conversacion', desc: 'Conversacion tal como se guarda en el ticket' },
    { name: 'firma', desc: 'Firma del correo (Equipo de Soporte)' },
  ];

  readonly aligns: Array<{ value: MailAlign; label: string }> = [
    { value: 'left', label: 'Izquierda' },
    { value: 'center', label: 'Centro' },
    { value: 'right', label: 'Derecha' },
    { value: 'justify', label: 'Justificado' },
  ];

  readonly fonts: Array<{ value: string; label: string }> = [
    { value: '', label: 'Predeterminada (Arial)' },
    { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
    { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
    { value: "'Trebuchet MS', Helvetica, sans-serif", label: 'Trebuchet MS' },
    { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
    { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
    { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  ];

  blocks: MailBlock[] = [];
  mode: 'visual' | 'html' = 'visual';
  htmlDraft = '';
  selectedId: string | null = null;
  uploading = false;
  uploadError = '';
  popoverStyle: { top: number; left: number } | null = null;

  private readonly apiBase: string;
  private lastEmitted = '';
  private designJSON: string | null = null;
  private resizeState: { id: string; kind: string; startX: number; value: number } | null = null;
  private posRaf = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    try {
      this.apiBase = new URL(environment.apiUrl).origin;
    } catch {
      this.apiBase = typeof window !== 'undefined' ? window.location.origin : '';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['design'] && Array.isArray(this.design)) {
      const json = JSON.stringify(this.design);
      if (this.designJSON !== json) {
        this.designJSON = json;
        this.blocks = this.cloneBlocks(this.design as MailBlock[]);
        this.selectedId = null;
        this.cdr.detectChanges();
      }
      return;
    }
    if (changes['cuerpo']) {
      const next = this.cuerpo || '';
      if (next === this.lastEmitted || this.mode === 'html') return;
      const parsed = this.parseCorreo(next);
      this.blocks = parsed ? parsed : this.plainToTextBlock(next);
      this.selectedId = null;
      this.cdr.detectChanges();
    }
  }

  ngOnInit(): void {
    document.addEventListener('scroll', this.onDocScroll, true);
    window.addEventListener('resize', this.onWinResize);
    document.addEventListener('mousedown', this.onDocMouseDown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    document.removeEventListener('scroll', this.onDocScroll, true);
    window.removeEventListener('resize', this.onWinResize);
    document.removeEventListener('mousedown', this.onDocMouseDown, true);
    if (this.posRaf) cancelAnimationFrame(this.posRaf);
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  get selectedBlock(): MailBlock | null {
    return this.selectedId ? this.findBlock(this.blocks, this.selectedId) : null;
  }

  blockLabel(type: string): string {
    const map: Record<string, string> = {
      text: 'Texto',
      heading: 'Titulo',
      image: 'Imagen',
      button: 'Boton',
      divider: 'Separador',
      spacer: 'Espacio',
      token: 'Variable',
      html: 'HTML libre',
      columns: '2 columnas',
    };
    return map[type] || 'Bloque';
  }

  hexColor(v: string | undefined, fallback: string): string {
    if (!v || /^#[0-9a-fA-F]{6}$/.test(v)) return v || fallback;
    return fallback;
  }

  setMode(mode: 'visual' | 'html'): void {
    if (this.mode === mode) return;
    if (mode === 'html') {
      this.htmlDraft = this.compilarCorreo();
      this.mode = 'html';
    } else {
      const draft = this.htmlDraft || this.cuerpo || '';
      const parsed = this.parseCorreo(draft);
      if (parsed) {
        this.blocks = parsed;
      } else if (!this.blocks?.length) {
        this.blocks = this.plainToTextBlock(draft);
      }
      this.mode = 'visual';
      this.selectedId = null;
      this.emitCambios();
    }
    this.cdr.detectChanges();
  }

  onHtmlInput(event: Event): void {
    this.htmlDraft = (event.target as HTMLTextAreaElement).value;
    if (this.htmlDraft === this.lastEmitted) return;
    this.lastEmitted = this.htmlDraft;
    this.cuerpoChange.emit(this.htmlDraft);
    this.designChange.emit(null);
  }

  addFromSelect(value: string): void {
    if (!value) return;
    if (value === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) this.uploadAndAdd(file);
      };
      input.click();
      return;
    }
    const block = this.newBlock(value);
    this.blocks.push(block);
    this.selectedId = block.id;
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  onImagePick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.uploadAndAdd(file);
  }

  private uploadAndAdd(file: File): void {
    this.uploading = true;
    this.uploadError = '';
    this.svc.uploadMailImage(file).subscribe({
      next: (res) => {
        this.uploading = false;
        const block: MailImageBlock = {
          id: uid(),
          type: 'image',
          src: res.url,
          width: 480,
          radius: 8,
          align: 'center',
        };
        this.blocks.push(block);
        this.selectedId = block.id;
        this.emitCambios();
        this.cdr.detectChanges();
        this.schedulePos();
      },
      error: () => {
        this.uploading = false;
        this.uploadError = 'No se pudo subir la imagen. Verifica el formato (jpg, png, webp, gif, avif) y el tamano (max 5MB).';
        this.cdr.detectChanges();
      },
    });
  }

  addToken(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const token = select.value;
    select.value = '';
    if (!token) return;
    this.addTokenBlock(token);
  }

  private addTokenBlock(token: string): void {
    const block: MailTokenBlock = { id: uid(), type: 'token', token, align: 'left' };
    this.blocks.push(block);
    this.selectedId = block.id;
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  cargarPlantillaEjemplo(): void {
    this.blocks = this.defaultBlocks();
    this.selectedId = null;
    this.popoverStyle = null;
    this.emitCambios();
    this.cdr.detectChanges();
  }

  selectBlock(block: MailBlock): void {
    this.selectedId = block.id;
    this.cdr.detectChanges();
    this.positionPopover();
  }

  deselect(): void {
    this.selectedId = null;
    this.popoverStyle = null;
    this.cdr.detectChanges();
  }

  private readonly onDocMouseDown = (ev: MouseEvent): void => {
    if (!this.selectedId) return;
    const target = ev.target as Node | null;
    if (!target) return;
    const block = document.querySelector(`[data-block-id="${this.selectedId}"]`);
    const pp = document.querySelector('.mled__pp');
    if (block?.contains(target) || pp?.contains(target)) return;
    this.deselect();
  };

  private readonly onDocScroll = (): void => this.schedulePos();

  private readonly onWinResize = (): void => this.schedulePos();

  private schedulePos(): void {
    if (!this.selectedId || this.posRaf) return;
    this.posRaf = requestAnimationFrame(() => {
      this.posRaf = 0;
      this.positionPopover();
    });
  }

  private positionPopover(): void {
    if (!this.selectedId) {
      this.popoverStyle = null;
      return;
    }
    const el = document.querySelector(`[data-block-id="${this.selectedId}"]`) as HTMLElement | null;
    if (!el) {
      this.popoverStyle = { top: 90, left: 20 };
      return;
    }
    const pp = document.querySelector('.mled__pp') as HTMLElement | null;
    const w = pp?.offsetWidth ?? 340;
    const h = pp?.offsetHeight ?? 600;
    const gap = 16;
    const margin = 10;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left - gap - w;
    if (left < margin) {
      left = Math.max(margin, Math.min(rect.right + gap, vw - w - margin));
    }
    const top = Math.min(Math.max(margin, rect.top), Math.max(margin, vh - h - margin));

    this.popoverStyle = { top, left };
  }

  removeBlock(block: MailBlock): void {
    const list = this.findList(this.blocks, block.id);
    if (!list) return;
    const i = list.findIndex(b => b.id === block.id);
    if (i === -1) return;
    list.splice(i, 1);
    if (this.selectedId === block.id) {
      this.selectedId = null;
      this.popoverStyle = null;
    }
    this.emitCambios();
    this.cdr.detectChanges();
  }

  moveBlock(e: MailMoveEvent): void {
    const list = this.findList(this.blocks, e.block.id);
    if (!list) return;
    const i = list.findIndex(b => b.id === e.block.id);
    const j = i + e.dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  textChange(e: MailTextChangeEvent): void {
    (e.block as MailTextBlock | MailHeadingBlock | MailHtmlBlock).html = e.html;
    this.emitCambios();
    this.schedulePos();
  }

  onAlignChange(e: MailAlignChangeEvent): void {
    const b = e.block as MailTextBlock | MailHeadingBlock;
    b.align = e.align;
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  onDrop(event: CdkDragDrop<MailBlock[]>, list: MailBlock[]): void {
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  onInnerDrop(event: CdkDragDrop<MailBlock[]>): void {
    const list = event.container.data;
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.emitCambios();
    this.cdr.detectChanges();
    this.schedulePos();
  }

  onResizeStart(e: MailResizeEvent): void {
    e.event.preventDefault();
    e.event.stopPropagation();
    const value = this.resizeStartValue(e.block, e.kind);
    this.resizeState = { id: e.block.id, kind: e.kind, startX: e.event.clientX, value };
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  private readonly onResizeMove = (ev: MouseEvent): void => {
    if (!this.resizeState) return;
    const block = this.findBlock(this.blocks, this.resizeState.id);
    if (!block) return;
    const dx = ev.clientX - this.resizeState.startX;
    const k = this.resizeState.kind;
    if (k === 'width') {
      (block as MailImageBlock | MailButtonBlock).width = this.clamp(this.resizeState.value + dx, 40, 640);
    } else if (k === 'height') {
      (block as MailImageBlock | MailButtonBlock).height = this.clamp(this.resizeState.value + dx, 20, 800);
    } else if (k === 'thickness') {
      if (block.type === 'spacer') {
        (block as MailSpacerBlock).height = this.clamp(this.resizeState.value + dx, 4, 320);
      } else if (block.type === 'divider') {
        (block as MailDividerBlock).thickness = this.clamp(this.resizeState.value + dx, 1, 20);
      }
    } else if (k === 'columns') {
      const b = block as MailColumnsBlock;
      const w1 = this.clamp(this.resizeState.value + dx, 20, 80);
      b.cols[0].width = w1;
      b.cols[1].width = 100 - w1;
    }
    this.cdr.detectChanges();
    this.scheduleEmit();
  };

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emitCambios();
    }, 120);
  }

  private readonly onResizeEnd = (): void => {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    if (this.resizeState) {
      this.resizeState = null;
      this.emitCambios();
    }
  };

  panelChanged(): void {
    this.emitCambios();
    this.cdr.detectChanges();
  }

  previewHtml(): string {
    const html = this.compilarCorreo();
    return this.reemplazarTokens(this.absolutizar(html));
  }

  private resizeStartValue(block: MailBlock, kind: string): number {
    if (kind === 'width') return (block as MailImageBlock | MailButtonBlock).width || 300;
    if (kind === 'height') return (block as MailImageBlock | MailButtonBlock).height || 200;
    if (kind === 'thickness') {
      if (block.type === 'spacer') return (block as MailSpacerBlock).height;
      return (block as MailDividerBlock).thickness ?? 1;
    }
    if (kind === 'columns') return (block as MailColumnsBlock).cols[0].width;
    return 0;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(v)));
  }

  private emitCambios(): void {
    const html = this.compilarCorreo();
    if (html === this.lastEmitted) return;
    this.lastEmitted = html;
    const design = this.cloneBlocks(this.blocks);
    this.designJSON = JSON.stringify(design);
    this.cuerpoChange.emit(html);
    this.designChange.emit(design);
  }

  private newBlock(type: string): MailBlock {
    switch (type) {
      case 'heading':
        return { id: uid(), type: 'heading', html: 'Titulo del correo', align: 'left', color: '#111827', fontSize: 22, padding: 14 };
      case 'text':
        return { id: uid(), type: 'text', html: 'Escribe aqui el contenido del correo...', align: 'left', color: '#1e293b', fontSize: 15, padding: 18 };
      case 'button':
        return { id: uid(), type: 'button', text: 'Responder', href: '#', bg: '#2563eb', color: '#ffffff', radius: 8, fontSize: 15, align: 'center', width: 180, padding: 14 };
      case 'columns': {
        return {
          id: uid(),
          type: 'columns',
          cols: [
            { width: 50, blocks: [{ id: uid(), type: 'text', html: 'Contenido de la columna izquierda...', align: 'left', color: '#1e293b', fontSize: 14, padding: 8 }] },
            { width: 50, blocks: [{ id: uid(), type: 'text', html: 'Contenido de la columna derecha...', align: 'left', color: '#1e293b', fontSize: 14, padding: 8 }] },
          ],
          gap: 16,
          padding: 14,
        };
      }
      case 'divider':
        return { id: uid(), type: 'divider', color: '#e2e8f0', thickness: 1, padding: 14 };
      case 'spacer':
        return { id: uid(), type: 'spacer', height: 24 };
      case 'token':
        return { id: uid(), type: 'token', token: 'codigo', align: 'left' };
      case 'html':
        return { id: uid(), type: 'html', html: '<div style="padding:8px 24px;">HTML libre aqui</div>' };
      default:
        return { id: uid(), type: 'text', html: 'Escribe aqui el contenido del correo...', align: 'left', color: '#1e293b', fontSize: 15, padding: 18 };
    }
  }

  private defaultBlocks(): MailBlock[] {
    return [
      { id: uid(), type: 'heading', html: 'Tu caso {{codigo}} fue registrado', align: 'center', color: '#ffffff', bg: '#4338ca', fontSize: 22, padding: 26 },
      { id: uid(), type: 'text', html: 'Hola {{nombre}},<br/><br/>Recibimos tu solicitud y quedo registrada con el codigo <strong>{{codigo}}</strong>. Este numero te servira para consultar el estado de tu caso cuando quieras.', align: 'left', fontSize: 15, padding: 18 },
      { id: uid(), type: 'token', token: 'informacion', align: 'center' },
      { id: uid(), type: 'token', token: 'conversacion', align: 'center' },
      { id: uid(), type: 'divider', color: '#e2e8f0', thickness: 1, padding: 12 },
      { id: uid(), type: 'text', html: 'Si necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.', align: 'left', fontSize: 14, padding: 18 },
      { id: uid(), type: 'text', html: '{{firma}}', align: 'left', fontSize: 14, color: '#475569', padding: 10 },
      { id: uid(), type: 'spacer', height: 12 },
    ];
  }

  private compilarCorreo(): string {
    const body = this.emailificar(this.blocks.map(b => this.bloqueHtml(b)).join('\n'));
    return (
      '<!DOCTYPE html>\n' +
      '<html lang="es">\n' +
      '<head>\n' +
      '<meta charset="utf-8"/>\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n' +
      '</head>\n' +
      '<body style="margin:0;padding:0;background-color:#eef1f6;overflow-wrap:break-word;word-break:break-word;">\n' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f6;padding:32px 12px;">\n' +
      '<tr>\n' +
      '<td align="center" style="padding:0;">\n' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#ffffff;border-radius:12px;overflow:hidden;">\n' +
      '<tr>\n' +
      '<td align="left" valign="top" style="padding:0;">\n' +
      body +
      '\n</td>\n</tr>\n</table>\n' +
      '</td>\n</tr>\n</table>\n' +
      '</body>\n</html>'
    );
  }

  private emailificar(html: string): string {
    return html
      .replace(/<p(?![^>]*\bstyle=)/g, '<p style="margin:0 0 12px;padding:0;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">')
      .replace(/<(h[1-6])(?![^>]*\bstyle=)/g, '<$1 style="margin:0 0 12px;padding:0;line-height:1.4;font-family:Arial,Helvetica,sans-serif;">')
      .replace(/<ul(?![^>]*\bstyle=)/g, '<ul style="margin:0 0 12px;padding:0 0 0 20px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">')
      .replace(/<ol(?![^>]*\bstyle=)/g, '<ol style="margin:0 0 12px;padding:0 0 0 20px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">')
      .replace(/<li(?![^>]*\bstyle=)/g, '<li style="margin:0 0 6px;padding:0;line-height:1.6;">')
      .replace(/<img(?![^>]*\bstyle=)/g, '<img style="border:0;display:inline-block;max-width:100%;height:auto;">')
      .replace(/<a(?![^>]*\bstyle=)/g, '<a style="color:#2563eb;text-decoration:underline;">')
      .replace(/<li([^>]*)>\s*>/gi, '<li$1>')
      .replace(/>\s*<\/li>/gi, '</li>')
      .replace(/<\/p>\s*<br\/?>\s*/gi, '</p>')
      .replace(/<br\/?>\s*<\/p>/gi, '</p>');
  }

  private bloqueHtml(b: MailBlock): string {
    switch (b.type) {
      case 'text': {
        const align = b.align || 'left';
        const color = b.color || '#1e293b';
        const bg = b.bg || 'transparent';
        const size = b.fontSize || 15;
        const pad = b.padding ?? 14;
        const fam = b.fontFamily || 'Arial,Helvetica,sans-serif';
        return `<div data-sb="text" data-sb-id="${b.id}" style="padding:${pad}px 24px;text-align:${align};background:${bg};color:${color};font-size:${size}px;line-height:1.6;font-family:${fam};">${b.html}</div>`;
      }
      case 'heading': {
        const align = b.align || 'left';
        const color = b.color || '#111827';
        const bg = b.bg || 'transparent';
        const size = b.fontSize || 22;
        const pad = b.padding ?? 14;
        const fam = b.fontFamily || 'Arial,Helvetica,sans-serif';
        return `<div data-sb="heading" data-sb-id="${b.id}" style="padding:${pad}px 24px;text-align:${align};background:${bg};color:${color};font-size:${size}px;line-height:1.4;font-weight:700;font-family:${fam};">${b.html}</div>`;
      }
      case 'image': {
        const align = b.align || 'center';
        const pad = b.padding ?? 14;
        const w = b.width ? `width="${Math.round(b.width)}"` : '';
        const h = b.height ? `height="${Math.round(b.height)}"` : '';
        const radius = b.radius ?? 8;
        const size = b.height
          ? `width:${b.width ? Math.round(b.width) + 'px' : 'auto'};height:${Math.round(b.height)}px;`
          : `max-width:100%;height:auto;`;
        const img = `<img src="${escHtml(b.src)}" alt="${escHtml(b.alt || '')}" ${w} ${h} style="${size}border:0;display:inline-block;border-radius:${radius}px;"/>`;
        const inner = b.link ? `<a href="${escHtml(b.link)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
        return `<div data-sb="image" data-sb-id="${b.id}" style="padding:${pad}px 24px;text-align:${align};">${inner}</div>`;
      }
      case 'button': {
        const align = b.align || 'center';
        const pad = b.padding ?? 14;
        const bg = b.bg || '#2563eb';
        const color = b.color || '#ffffff';
        const radius = b.radius ?? 8;
        const size = b.fontSize || 15;
        const width = b.width ? `width:${Math.round(b.width)}px;max-width:100%;box-sizing:border-box;` : '';
        const height = b.height
          ? `height:${Math.round(b.height)}px;line-height:${Math.round(b.height)}px;padding:0 24px;box-sizing:border-box;`
          : 'padding:12px 24px;';
        return `<div data-sb="button" data-sb-id="${b.id}" style="padding:${pad}px 24px;text-align:${align};"><a href="${escHtml(b.href || '#')}" target="_blank" style="display:inline-block;background:${bg};color:${color};text-decoration:none;border-radius:${radius}px;font-size:${size}px;font-weight:600;${width}${height}">${escHtml(b.text)}</a></div>`;
      }
      case 'divider': {
        const color = b.color || '#e2e8f0';
        const t = b.thickness ?? 1;
        const pad = b.padding ?? 14;
        return `<div data-sb="divider" data-sb-id="${b.id}" style="padding:${pad}px 24px;"><div style="border-top:${t}px solid ${color};"></div></div>`;
      }
      case 'spacer': {
        const h = b.height || 16;
        return `<div data-sb="spacer" data-sb-id="${b.id}" style="display:block;width:100%;height:${h}px;line-height:${h}px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>`;
      }
      case 'token': {
        const align = b.align || 'left';
        return `<div data-sb="token" data-sb-id="${b.id}" style="padding:4px 24px;text-align:${align};"><span style="display:inline-block;background:#eef2ff;border:1px dashed #6366f1;color:#4338ca;border-radius:6px;padding:3px 8px;font-family:Consolas,Monaco,monospace;font-size:13px;">{{${escHtml(b.token)}}}</span></div>`;
      }
      case 'html': {
        return `<div data-sb="html" data-sb-id="${b.id}" style="padding:0;">${b.html}</div>`;
      }
      case 'columns': {
        const pad = b.padding ?? 14;
        const gap = b.gap ?? 16;
        const left = b.cols[0].blocks.map(x => this.bloqueHtml(x)).join('\n');
        const right = b.cols[1].blocks.map(x => this.bloqueHtml(x)).join('\n');
        return (
          `<div data-sb="columns" data-sb-id="${b.id}" style="padding:${pad}px 24px;">` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">` +
          `<tr>` +
          `<td width="${b.cols[0].width}%" valign="top" style="vertical-align:top;padding-right:${gap}px;">${left}</td>` +
          `<td width="${b.cols[1].width}%" valign="top" style="vertical-align:top;">${right}</td>` +
          `</tr>` +
          `</table>` +
          `</div>`
        );
      }
    }
  }

  private parseCorreo(html: string): MailBlock[] | null {
    if (!html || !html.includes('data-sb')) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const els = this.collectTopLevel(doc.body);
    if (!els || !els.length) return null;
    return els.map(el => this.elToBlock(el));
  }

  private collectTopLevel(container: HTMLElement): HTMLElement[] | null {
    const children = Array.from(container.children) as HTMLElement[];
    if (!children.length) return null;
    const allBlock = children.every(c => c.hasAttribute('data-sb'));
    if (allBlock) return children;
    if (children.length === 1) return this.collectTopLevel(children[0]);
    return null;
  }

  private elToBlock(el: HTMLElement): MailBlock {
    const id = el.getAttribute('data-sb-id') || uid();
    const type = el.getAttribute('data-sb') || 'html';
    const st = el.style;
    const align = readAlign(st.textAlign);
    const color = st.color || '';
    const bg = st.backgroundColor || '';
    const fontSize = readInt(st.fontSize, 15);
    const padding = readInt(st.paddingTop, 14);
    const fontFamily = st.fontFamily ? st.fontFamily.replace(/['"]/g, '').trim() : '';

    switch (type) {
      case 'text':
        return { id, type: 'text', html: el.innerHTML, align, color, bg, fontSize, fontFamily: fontFamily || undefined, padding };
      case 'heading':
        return { id, type: 'heading', html: el.innerHTML, align, color, bg, fontSize, fontFamily: fontFamily || undefined, padding };
      case 'image': {
        const img = el.querySelector('img');
        const a = el.querySelector('a');
        return {
          id,
          type: 'image',
          src: img?.getAttribute('src') || '',
          alt: img?.getAttribute('alt') || '',
          width: img?.getAttribute('width') ? readInt(img.getAttribute('width'), 0) : undefined,
          height: img?.getAttribute('height') ? readInt(img.getAttribute('height'), 0) : undefined,
          radius: st.borderRadius ? readInt(st.borderRadius, 8) : undefined,
          align,
          link: a?.getAttribute('href') || undefined,
          padding,
        };
      }
      case 'button': {
        const a = el.querySelector('a');
        return {
          id,
          type: 'button',
          text: a?.textContent || '',
          href: a?.getAttribute('href') || '#',
          bg: a ? a.style.backgroundColor || '#2563eb' : '#2563eb',
          color: a ? a.style.color || '#ffffff' : '#ffffff',
          radius: a ? (a.style.borderRadius ? readInt(a.style.borderRadius, 8) : 8) : 8,
          fontSize: a ? readInt(a.style.fontSize, 15) : 15,
          width: a ? (a.style.width ? readInt(a.style.width, 0) : undefined) : undefined,
          height: a ? (a.style.height ? readInt(a.style.height, 0) : undefined) : undefined,
          align,
          padding,
        };
      }
      case 'divider': {
        const line = el.querySelector('div');
        return {
          id,
          type: 'divider',
          color: line ? line.style.borderTopColor || '#e2e8f0' : '#e2e8f0',
          thickness: line ? readInt(line.style.borderTopWidth, 1) : 1,
          padding,
        };
      }
      case 'spacer': {
        const h = readInt(st.height, 16);
        return { id, type: 'spacer', height: h };
      }
      case 'token': {
        const span = el.querySelector('span');
        const token = (span?.textContent || '').replace(/\{\{|\}\}/g, '').trim() || 'codigo';
        return { id, type: 'token', token, align };
      }
      case 'columns': {
        const table = Array.from(el.children).find(c => c.tagName === 'TABLE') as HTMLElement | undefined;
        const tds = table
          ? Array.from(table.querySelectorAll(':scope > tbody > tr > td')) as HTMLElement[]
          : [];
        const c1 = tds[0];
        const c2 = tds[1];
        const w1 = c1?.getAttribute('width') ? readInt(c1.getAttribute('width'), 50) : 50;
        const w2 = c2?.getAttribute('width') ? readInt(c2.getAttribute('width'), 50) : 50;
        const b1 = c1 ? this.collectTopLevel(c1) : null;
        const b2 = c2 ? this.collectTopLevel(c2) : null;
        return {
          id,
          type: 'columns',
          cols: [
            { width: w1, blocks: b1 ? b1.map(x => this.elToBlock(x)) : [] },
            { width: w2, blocks: b2 ? b2.map(x => this.elToBlock(x)) : [] },
          ],
          gap: c1?.style.paddingRight ? readInt(c1.style.paddingRight, 16) : 16,
          padding,
        };
      }
      default:
        return { id, type: 'html', html: el.innerHTML };
    }
  }

  private plainToTextBlock(text: string): MailBlock[] {
    const html = text
      .split(/\r?\n/)
      .map(l => (l ? `<div>${escHtml(l)}</div>` : '<div><br/></div>'))
      .join('');
    return [{ id: uid(), type: 'text', html, fontSize: 15 }];
  }

  private absolutizar(html: string): string {
    if (!this.apiBase) return html;
    return html.replace(/("|\()\/(uploads\/[^")]+)/g, `$1${this.apiBase}/$2`);
  }

  private reemplazarTokens(html: string): string {
    const infoHtml =
      '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Identificacion</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">1098701234</td></tr>' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Rol</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Estudiante</td></tr>' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Colegio</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Colegio San Jose</td></tr>' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Tipo de solicitud</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Soporte tecnico</td></tr>' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;border-bottom:1px solid #e2e8f0;">Telefono</td><td style="padding:7px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">3001234567</td></tr>' +
      '<tr><td style="padding:7px 12px;color:#475569;font-weight:bold;">Correo</td><td style="padding:7px 12px;color:#1e293b;">cliente@ejemplo.com</td></tr>' +
      '</table>';
    const convHtml =
      '<div>' +
      '<div style="margin:10px 0;padding:10px 12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;"><div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong>Laura Gomez</strong> &middot; 14/08/2026 09:32</div><div style="font-size:14px;color:#1e293b;">Hola, necesito ayuda con mi matricula porque no aparece registrada.</div></div>' +
      '<div style="margin:10px 0;padding:10px 12px;background:#e0e7ff;border:1px solid #a5b4fc;border-radius:8px;"><div style="margin-bottom:4px;font-size:13px;color:#64748b;"><strong>Asesor</strong> &middot; 14/08/2026 09:34</div><div style="font-size:14px;color:#1e293b;">Hola Laura, con gusto reviso tu caso y quedo pendiente de validar la informacion.</div></div>' +
      '</div>';
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

  private findBlock(blocks: MailBlock[], id: string): MailBlock | null {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.type === 'columns') {
        for (const col of b.cols) {
          const found = this.findBlock(col.blocks, id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  private findList(blocks: MailBlock[], id: string): MailBlock[] | null {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].id === id) return blocks;
      if (blocks[i].type === 'columns') {
        for (const col of (blocks[i] as MailColumnsBlock).cols) {
          const r = this.findList(col.blocks, id);
          if (r) return r;
        }
      }
    }
    return null;
  }

  private cloneBlocks(b: MailBlock[]): MailBlock[] {
    return JSON.parse(JSON.stringify(b));
  }
}
