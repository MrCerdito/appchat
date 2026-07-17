import { ChangeDetectorRef, Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConfiguracionData,
  ConfiguracionFrontendService,
  HorarioSlot,
} from '../../../../core/services/configuracion.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SoundService } from '../../../../core/services/sound.service';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { WaConnectionStatus } from '../../../../core/models/whatsapp.models';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

type ConfigTab = 'jornada' | 'whatsapp' | 'mensajes' | 'inactividad' | 'respuestas' | 'ia';

@Component({
  selector: 'app-admin-configuracion',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  templateUrl: './admin-configuracion.html',
  styleUrl: './admin-configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConfiguracionComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  config: ConfiguracionData | null = null;
  loading = true;
  saving = false;
  saved = false;
  error = '';
  tab: ConfigTab = 'jornada';
  diaSeleccionado: number | null = null;

  quickReplies: Array<{ name: string; content: string }> = [];
  editingReplyIdx: number | null = null;
  activeTextarea: HTMLTextAreaElement | null = null;
  showLinkModal = false;
  linkName = '';
  linkUrl = '';

  // ── IA Prompt ──────────────────────────────────────────────────────────────
  aiPromptNombre = 'asistente virtual de atención al cliente';
  aiPromptEspecialidad = 'colegios';
  aiPromptInstrucciones = '';
  aiPromptFrasesTransferencia: string[] = ['asesor', 'humano', 'persona', 'agente'];
  aiPromptFeedback = '';
  aiPromptPersonalizado = '';
  aiPromptUseCustom = false;
  newTransferPhrase = '';
  selectedRole: string = 'estudiante';
  newRestrictedTopic = '';
  iaSectionOpen = { identidad: true, instrucciones: true, roles: true, transferencia: false, feedback: false, avanzado: false };

  readonly aiRoles = [
    { key: 'administrador', label: 'Administrador', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { key: 'docente', label: 'Docente', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
    { key: 'estudiante', label: 'Estudiante', icon: 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 6 3 12 0v-5' },
    { key: 'padre', label: 'Padre/Madre', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  ];

  aiRolesConfig: Record<string, { descripcion: string; temasRestringidos: string[]; mensajeRestringido: string }> = {
    administrador: { descripcion: 'Tienes acceso completo a toda la información del sistema.', temasRestringidos: [], mensajeRestringido: '' },
    docente: { descripcion: 'Tienes acceso a información académica y administrativa.', temasRestringidos: [], mensajeRestringido: '' },
    estudiante: { descripcion: 'Tienes acceso a información académica y personal.', temasRestringidos: [], mensajeRestringido: '' },
    padre: { descripcion: 'Tienes acceso a información académica y de pagos de tu hijo.', temasRestringidos: [], mensajeRestringido: '' },
  };

  readonly placeholderBienvenida =
    'Hola, soy {{asesor}}, en que puedo ayudarte?';
  readonly placeholderWhatsappAsignacion =
    'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.';
  readonly placeholderWhatsappCola =
    'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.';
  readonly placeholderWhatsappFuera =
    'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.';
  readonly placeholderWhatsappLlamada =
    'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.';

  readonly sonidoWhatsappOptions = [
    { value: 'whatsapp1', label: 'WhatsApp 1' },
    { value: 'whatsapp2', label: 'WhatsApp 2' },
    { value: 'whatsapp3', label: 'WhatsApp 3' },
    { value: 'whatsapp4', label: 'WhatsApp 4' },
    { value: 'whatsapp5', label: 'WhatsApp 5' },
    { value: 'whatsapp6', label: 'WhatsApp 6' },
    { value: 'fuerte', label: 'Fuerte' },
    { value: 'alerta', label: 'Alerta' },
    { value: 'timbre', label: 'Timbre' },
    { value: 'campana', label: 'Campana' },
  ];

  readonly sonidoAsesorOptions = [
    { value: 'asesor1', label: 'Asesor 1' },
    { value: 'asesor2', label: 'Asesor 2' },
    { value: 'asesor3', label: 'Asesor 3' },
    { value: 'asesor4', label: 'Asesor 4' },
    { value: 'asesor5', label: 'Asesor 5' },
    { value: 'fuerte', label: 'Fuerte' },
    { value: 'alerta', label: 'Alerta' },
    { value: 'timbre', label: 'Timbre' },
    { value: 'campana', label: 'Campana' },
  ];

  readonly sonidoClienteOptions = [
    { value: 'cliente1', label: 'Cliente 1' },
    { value: 'cliente2', label: 'Cliente 2' },
    { value: 'cliente3', label: 'Cliente 3' },
    { value: 'cliente4', label: 'Cliente 4' },
    { value: 'cliente5', label: 'Cliente 5' },
    { value: 'fuerte', label: 'Fuerte' },
    { value: 'alerta', label: 'Alerta' },
    { value: 'timbre', label: 'Timbre' },
    { value: 'campana', label: 'Campana' },
  ];

  readonly sonidoAsignacionOptions = [
    { value: 'asignacion1', label: 'Asignación 1' },
    { value: 'asignacion2', label: 'Asignación 2' },
    { value: 'asignacion3', label: 'Asignación 3' },
    { value: 'asignacion4', label: 'Asignación 4' },
    { value: 'fuerte', label: 'Fuerte' },
    { value: 'alerta', label: 'Alerta' },
    { value: 'timbre', label: 'Timbre' },
    { value: 'campana', label: 'Campana' },
  ];

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
    private readonly sound: SoundService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sound.loadSoundConfig();
    this.svc.getGlobal().pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.config = this.normalize(config);
        this.loading = false;
        this.applySoundConfig();
        if (this.config.horarios.length) {
          this.diaSeleccionado = this.config.horarios[0].dia;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'No se pudo cargar la configuracion.';
        this.cdr.detectChanges();
      },
    });
  }

  guardar(): void {
    if (!this.config) return;
    this.saving = true;
    this.error = '';

    this.config.whatsappQuickReplies = this.quickReplies;
    this.saveAiPromptConfig();
    this.applySoundConfig();
    this.svc.guardarGlobal(this.config).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.config = this.normalize(config);
        this.saving = false;
        this.saved = true;
        this.applySoundConfig();
        this.notification.success('Configuración guardada', 'Los cambios se aplicaron correctamente.');
        setTimeout(() => {
          this.saved = false;
          this.cdr.detectChanges();
        }, 3000);
        this.cdr.detectChanges();
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

  tieneHorario(dia: number): boolean {
    return !!this.config?.horarios?.find(h => h.dia === dia);
  }

  getHorario(dia: number): HorarioSlot {
    return this.config?.horarios?.find(h => h.dia === dia)
      ?? { dia, inicio: '08:00', fin: '17:00' };
  }

  seleccionarDia(dia: number): void {
    if (!this.config) return;

    if (!this.tieneHorario(dia)) {
      this.config.horarios = [
        ...(this.config.horarios ?? []),
        { dia, inicio: '08:00', fin: '17:00' },
      ].sort((a, b) => a.dia - b.dia);
      this.diaSeleccionado = dia;
    } else if (this.diaSeleccionado === dia) {
      this.diaSeleccionado = null;
    } else {
      this.diaSeleccionado = dia;
    }
  }

  quitarDia(dia: number): void {
    if (!this.config) return;
    this.config.horarios = this.config.horarios.filter(h => h.dia !== dia);
    this.diaSeleccionado = null;
  }

  setInicio(dia: number, valor: string): void {
    const slot = this.config?.horarios?.find(h => h.dia === dia);
    if (slot) slot.inicio = valor;
  }

  setFin(dia: number, valor: string): void {
    const slot = this.config?.horarios?.find(h => h.dia === dia);
    if (slot) slot.fin = valor;
  }

  horaAPct(hora: string | undefined): number {
    if (!hora) return 0;
    const [h, m] = hora.split(':').map(Number);
    return Math.min(100, Math.max(0, ((h * 60 + m - 420) / 720) * 100));
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

  previewWhatsappAssignment(): string {
    return (this.config?.whatsappAssignmentMsg || this.placeholderWhatsappAsignacion)
      .replace(/\{\{\s*(asesor|advisor)\s*\}\}/gi, 'Laura');
  }

  previewWhatsappOutOfHours(): string {
    return (this.config?.whatsappOutOfHoursMsg || this.placeholderWhatsappFuera)
      .replace(/\{\{\s*proximaApertura\s*\}\}/gi, 'manana a las 08:00')
      .replace(/\{\{\s*horaApertura\s*\}\}/gi, '08:00');
  }

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

  private applySoundConfig(): void {
    if (!this.config) return;
    this.sound.setSoundConfig(
      this.config.sonidoActivado,
      this.config.sonidoWhatsapp || 'whatsapp1',
      this.config.sonidoAsesor || 'asesor1',
      this.config.sonidoCliente || 'cliente1',
      this.config.sonidoAsignacion || 'asignacion1',
    );
  }

  testSound(category: string, type: string): void {
    this.sound.playTestSound(category, type);
  }

  private normalize(config: ConfiguracionData): ConfiguracionData {
    this.loadAiPromptConfig(config.aiPromptConfig);
    return {
      ...config,
      horarios: config.horarios ?? [],
      almuerzos: config.almuerzos ?? [],
      whatsappAssignmentMsg:
        config.whatsappAssignmentMsg || this.placeholderWhatsappAsignacion,
      whatsappQueueMsg: config.whatsappQueueMsg || this.placeholderWhatsappCola,
      whatsappOutOfHoursMsg:
        config.whatsappOutOfHoursMsg || this.placeholderWhatsappFuera,
      whatsappCallUnavailableMsg:
        config.whatsappCallUnavailableMsg || this.placeholderWhatsappLlamada,
      sonidoActivado: config.sonidoActivado ?? true,
      sonidoWhatsapp: config.sonidoWhatsapp ?? 'whatsapp1',
      sonidoAsesor: config.sonidoAsesor ?? 'asesor1',
      sonidoCliente: config.sonidoCliente ?? 'cliente1',
      sonidoAsignacion: config.sonidoAsignacion ?? 'asignacion1',
      whatsappQuickReplies: this.normalizeQuickReplies(config.whatsappQuickReplies),
    };
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
    if (!this.config || this.quickReplies.length >= 20) return;
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

  initQuickRepliesFromConfig(): void {
    if (this.config) {
      this.quickReplies = this.normalizeQuickReplies(this.config.whatsappQuickReplies);
    }
  }

  // ── IA Prompt methods ──────────────────────────────────────────────────────
  private loadAiPromptConfig(aiCfg: Record<string, any> | null | undefined): void {
    if (aiCfg && typeof aiCfg === 'object') {
      this.aiPromptNombre = aiCfg['nombreAsistente'] || 'asistente virtual de atención al cliente';
      this.aiPromptEspecialidad = aiCfg['especialidad'] || 'colegios';
      this.aiPromptInstrucciones = aiCfg['instruccionesGenerales'] || '';
      this.aiPromptFrasesTransferencia = Array.isArray(aiCfg['frasesTransferencia']) && aiCfg['frasesTransferencia'].length
        ? aiCfg['frasesTransferencia']
        : ['asesor', 'humano', 'persona', 'agente'];
      this.aiPromptFeedback = aiCfg['feedbackPositivo'] || '';
      this.aiPromptPersonalizado = aiCfg['promptPersonalizado'] || '';
      this.aiPromptUseCustom = !!aiCfg['promptPersonalizado'];
      if (aiCfg['roles'] && typeof aiCfg['roles'] === 'object') {
        for (const [key, val] of Object.entries(aiCfg['roles'] as Record<string, any>)) {
          if (this.aiRolesConfig[key]) {
            this.aiRolesConfig[key] = {
              descripcion: val['descripcion'] || this.aiRolesConfig[key].descripcion,
              temasRestringidos: Array.isArray(val['temasRestringidos']) ? val['temasRestringidos'] : this.aiRolesConfig[key].temasRestringidos,
              mensajeRestringido: val['mensajeRestringido'] || this.aiRolesConfig[key].mensajeRestringido,
            };
          }
        }
      }
    } else {
      this.resetAiPromptDefaults();
    }
  }

  private resetAiPromptDefaults(): void {
    this.aiPromptNombre = 'asistente virtual de atención al cliente';
    this.aiPromptEspecialidad = 'colegios';
    this.aiPromptInstrucciones = '';
    this.aiPromptFrasesTransferencia = ['asesor', 'humano', 'persona', 'agente'];
    this.aiPromptFeedback = '';
    this.aiPromptPersonalizado = '';
    this.aiPromptUseCustom = false;
    this.aiRolesConfig = {
      administrador: { descripcion: 'Tienes acceso completo a toda la información del sistema.', temasRestringidos: [], mensajeRestringido: '' },
      docente: { descripcion: 'Tienes acceso a información académica y administrativa.', temasRestringidos: [], mensajeRestringido: '' },
      estudiante: { descripcion: 'Tienes acceso a información académica y personal.', temasRestringidos: [], mensajeRestringido: '' },
      padre: { descripcion: 'Tienes acceso a información académica y de pagos de tu hijo.', temasRestringidos: [], mensajeRestringido: '' },
    };
  }

  saveAiPromptConfig(): void {
    if (!this.config) return;
    if (this.aiPromptUseCustom) {
      this.config.aiPromptConfig = {
        promptPersonalizado: this.aiPromptPersonalizado || null,
      };
    } else {
      this.config.aiPromptConfig = {
        nombreAsistente: this.aiPromptNombre,
        especialidad: this.aiPromptEspecialidad,
        instruccionesGenerales: this.aiPromptInstrucciones,
        roles: this.aiRolesConfig,
        frasesTransferencia: this.aiPromptFrasesTransferencia,
        feedbackPositivo: this.aiPromptFeedback,
        promptPersonalizado: null,
      };
    }
  }

  toggleIaSection(key: keyof typeof this.iaSectionOpen): void {
    this.iaSectionOpen[key] = !this.iaSectionOpen[key];
  }

  selectRole(key: string): void {
    this.selectedRole = key;
  }

  getRoleConfig(key: string) {
    return this.aiRolesConfig[key];
  }

  addRestrictedTopic(): void {
    const topic = this.newRestrictedTopic.trim().toLowerCase();
    const role = this.aiRolesConfig[this.selectedRole];
    if (topic && role && !role.temasRestringidos.includes(topic) && role.temasRestringidos.length < 20) {
      role.temasRestringidos.push(topic);
      this.newRestrictedTopic = '';
    }
  }

  removeRestrictedTopic(topic: string): void {
    const role = this.aiRolesConfig[this.selectedRole];
    if (role) {
      role.temasRestringidos = role.temasRestringidos.filter(t => t !== topic);
    }
  }

  addTransferPhrase(): void {
    const phrase = this.newTransferPhrase.trim().toLowerCase();
    if (phrase && !this.aiPromptFrasesTransferencia.includes(phrase) && this.aiPromptFrasesTransferencia.length < 20) {
      this.aiPromptFrasesTransferencia.push(phrase);
      this.newTransferPhrase = '';
    }
  }

  removeTransferPhrase(phrase: string): void {
    this.aiPromptFrasesTransferencia = this.aiPromptFrasesTransferencia.filter(p => p !== phrase);
  }

  resetAiPrompt(): void {
    this.resetAiPromptDefaults();
    if (this.config) {
      this.config.aiPromptConfig = null;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
