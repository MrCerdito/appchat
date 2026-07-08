import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComunicadosService, Colegio } from '../../../../core/services/comunicados.service';
import { Comunicado, Destinatario } from '../../../../core/models/comunicado.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

type View = 'inbox' | 'sent' | 'drafts' | 'compose';

@Component({
  selector: 'app-comunicados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comunicados.html',
  styleUrl: './comunicados.scss',
})
export class ComunicadosComponent implements OnInit {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
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
  destinatarios: Destinatario[] = [];
  emailInput = '';
  nombreInput = '';
  showColegiosPicker = false;
  colegioSearch = '';

  // Editor
  boldActive = false;
  italicActive = false;
  underlineActive = false;

  @ViewChild('editor') editorRef!: ElementRef;

  constructor(
    private service: ComunicadosService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
    this.service.getColegios().subscribe(c => {
      this.colegios = c;
      this.cdr.detectChanges();
    });
  }

  loadAll(): void {
    this.loading = true;
    this.service.getAll().subscribe({
      next: (c) => { this.comunicados = c; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  loadStats(id: string): void {
    this.statsLoading = true;
    this.showStats = false;
    this.service.getStats(id).subscribe({
      next: (s) => {
        this.stats = s;
        this.showStats = true;
        this.statsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.statsLoading = false;
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
    if (comunicado) {
      this.editingId = comunicado.id;
      this.asunto = comunicado.asunto;
      this.cuerpo = comunicado.cuerpo;
      this.destinatarios = comunicado.destinatarios.map(d => ({
        email: d.email,
        nombre: d.nombre,
      }));
    } else {
      this.editingId = null;
      this.asunto = '';
      this.cuerpo = '';
      this.destinatarios = [];
    }
    setTimeout(() => {
      if (this.editorRef) {
        this.editorRef.nativeElement.innerHTML = this.cuerpo;
      }
    }, 50);
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

  format(command: string, value?: string): void {
    document.execCommand(command, false, value);
    this.editorRef.nativeElement.focus();
    this.updateFormatState();
  }

  updateFormatState(): void {
    this.boldActive      = document.queryCommandState('bold');
    this.italicActive    = document.queryCommandState('italic');
    this.underlineActive = document.queryCommandState('underline');
    this.cdr.detectChanges();
  }

  onEditorInput(): void {
    this.cuerpo = this.editorRef.nativeElement.innerHTML;
    this.updateFormatState();
  }

  saveDraft(): void {
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    this.saving = true;
    this.error = '';
    const body = this.editorRef?.nativeElement.innerHTML ?? this.cuerpo;

    const obs = this.editingId
      ? this.service.update(this.editingId, this.asunto, body, this.destinatarios)
      : this.service.saveDraft(this.asunto, body, this.destinatarios);

    obs.subscribe({
      next: (c) => {
        this.editingId = c.id;
        this.saving = false;
        this.loadAll();
        this.showSuccessMsg('Borrador guardado');
      },
      error: () => {
        this.saving = false;
        this.error = 'Error al guardar';
        this.cdr.detectChanges();
      },
    });
  }

  sendNow(): void {
    if (!this.asunto.trim()) { this.error = 'El asunto es obligatorio'; return; }
    if (!this.destinatarios.length) { this.error = 'Agrega al menos un destinatario'; return; }
    this.sending = true;
    this.error = '';
    const body = this.editorRef?.nativeElement.innerHTML ?? this.cuerpo;
    const totalDest = this.destinatarios.length;

    const save$ = this.editingId
      ? this.service.update(this.editingId, this.asunto, body, this.destinatarios)
      : this.service.saveDraft(this.asunto, body, this.destinatarios);

    save$.subscribe({
      next: (c) => {
        this.service.send(c.id).subscribe({
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
            this.cdr.detectChanges();
          },
        });
      },
      error: () => {
        this.sending = false;
        this.error = 'Error al guardar el comunicado';
        this.cdr.detectChanges();
      },
    });
  }

  deleteComunicado(id: string): void {
    if (!confirm('¿Eliminar este comunicado?')) return;
    this.service.remove(id).subscribe({
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
    this.cdr.detectChanges();
    setTimeout(() => { this.success = ''; this.cdr.detectChanges(); }, 3500);
  }

  get statsFailedCount(): number {
  if (!this.stats?.detalle) return 0;
  return this.stats.detalle.filter((d: any) => d.sendStatus === 'failed').length;
}
}