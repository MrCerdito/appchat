import { ChangeDetectorRef, Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
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
import { trackByIndex } from '../../../../shared/utils/track-by';
import { Colegio, SessionService } from '../../../../core/services/session.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { SmtpConfigComponent } from './components/smtp-config/smtp-config.component';
import { ColegiosConfigComponent } from './components/colegios-config/colegios-config.component';

type ConfigGrupo = 'chat' | 'whatsapp' | 'general';
type ConfigTab =
  | 'bienvenida'
  | 'inactividad'
  | 'reconexion'
  | 'correoTickets'
  | 'whatsapp'
  | 'jornada'
  | 'sonidos'
  | 'ia'
  | 'colegios';

@Component({
  selector: 'app-admin-configuracion',
  standalone: true,
  imports: [FormsModule, SlicePipe, DecimalPipe, SmtpConfigComponent, ColegiosConfigComponent],
  templateUrl: './admin-configuracion.html',
  styleUrl: './admin-configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConfiguracionComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  config: ConfiguracionData | null = null;
  loading = true;
  saving = false;
  saved = false;
  error = '';
  grupo: ConfigGrupo = 'chat';
  private _tab: ConfigTab = 'bienvenida';

  get tab(): ConfigTab {
    return this._tab;
  }

  set tab(value: ConfigTab) {
    this._tab = value;
    this.layoutService.setSidebarForcedCollapsed(value === 'correoTickets' || value === 'colegios');
  }

  diaSeleccionado: number | null = null;

  readonly grupos: Array<{ key: ConfigGrupo; label: string; tabInicial: ConfigTab }> = [
    { key: 'chat', label: 'Chat en línea', tabInicial: 'bienvenida' },
    { key: 'whatsapp', label: 'WhatsApp', tabInicial: 'whatsapp' },
    { key: 'general', label: 'General', tabInicial: 'jornada' },
  ];

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
  aiPalabrasProhibidas: string[] = ['hijueputa', 'gonorrea', 'malparido', 'marica', 'pendejo', 'idiota', 'estupido', 'imbecil', 'puta', 'mierda'];
  aiMensajeGroseria = 'Por favor, mantengamos un trato respetuoso. No puedo ayudarte si usas lenguaje ofensivo. ¿En qué más puedo ayudarte?';
  aiLimiteGroserias = 3;
  aiMensajeSesionTerminada = 'Esta conversación ha sido finalizada por el uso continuado de lenguaje ofensivo. Si necesitas ayuda, inicia una nueva conversación manteniendo un trato respetuoso.';
  aiMensajeSinInformacion = 'No tengo información registrada sobre eso por el momento. ¿Necesitas un agente para una mejor ayuda?';
  aiSugerirAsesorAutomatico = true;
  newForbiddenWord = '';
  iaSectionOpen = { identidad: true, instrucciones: true, roles: true, transferencia: false, conducta: false, feedback: false, avanzado: false };

  // ── Colegios ─────────────────────────────────────────────────────────────
  colegios: Colegio[] = [];
  colegiosLoading = false;
  colegioSearch = '';
  colegioEditando: Colegio | null = null;
  colegioFormVisible = false;
  colegioForm = { nombre: '', link: '', email: '' };
  colegioSaving = false;
  colegioDeletingId: string | null = null;
  colegioSelectedIds: Set<string> = new Set();
  colegioDeletingBulk = false;
  colegioPage = 1;
  colegioPageSize = 10;
  pageSizeOptions = [10, 25, 50, 100];
  advisorsList: { id: string; name: string }[] = [];

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
    'Hola, soy {{agente}}, en que puedo ayudarte?';
  readonly placeholderWhatsappAsignacion =
    'Hola, soy {{agente}}. Ya fui asignado a tu conversacion y revisare tu caso.';
  readonly placeholderWhatsappCola =
    'Te encuentras en cola. En breves momentos un agente se comunicara contigo.';
  readonly placeholderWhatsappFuera =
    'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.';
  readonly placeholderWhatsappLlamada =
    'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.';

  readonly placeholderTicketEmailAsunto = 'Tu caso {{codigo}} fue registrado';
  readonly placeholderTicketEmailCuerpo =
    'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de ReportaCasos';

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
    { value: 'asesor1', label: 'Agente 1' },
    { value: 'asesor2', label: 'Agente 2' },
    { value: 'asesor3', label: 'Agente 3' },
    { value: 'asesor4', label: 'Agente 4' },
    { value: 'asesor5', label: 'Agente 5' },
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
    private readonly sessionService: SessionService,
    private readonly layoutService: LayoutService,
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
    this.sessionService.findAdvisors().pipe(takeUntil(this.destroy$)).subscribe({
      next: (advisors) => {
        this.advisorsList = advisors.map(a => ({ id: a.id, name: a.name }));
        this.cdr.detectChanges();
      },
    });
  }

  guardar(): void {
    if (!this.config || this.saving) return;

    if (this.errorHorarioVisible) {
      this.error = 'Corrige los horarios donde el cierre no es mayor que la apertura antes de guardar.';
      this.notification.error('Horarios inválidos', 'El cierre debe ser posterior a la apertura.');
      this.cdr.detectChanges();
      return;
    }

    this.saving = true;
    this.error = '';

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

  setGrupo(g: ConfigGrupo): void {
    this.grupo = g;
    this.tab = this.grupos.find(x => x.key === g)?.tabInicial ?? 'bienvenida';
    if (g === 'general' && this.tab === 'colegios') {
      this.loadColegios();
    }
  }

  irA(g: ConfigGrupo, t: ConfigTab): void {
    this.grupo = g;
    this.tab = t;
    if (t === 'colegios') {
      this.loadColegios();
    }
  }

  toggleAdminSidebar(): void {
    this.layoutService.requestSidebarToggle();
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

  // ── Validación y vista previa de la jornada ────────────────────────────────

  horarioValido(slot: HorarioSlot): boolean {
    if (!slot?.inicio || !slot?.fin) return false;
    return this.toMin(slot.inicio) < this.toMin(slot.fin);
  }

  get horariosInvalidos(): number[] {
    return (this.config?.horarios ?? [])
      .filter(h => !this.horarioValido(h))
      .map(h => h.dia);
  }

  get errorHorarioVisible(): boolean {
    return this.horariosInvalidos.length > 0;
  }

  previewProxima(): { texto: string; hora: string } {
    const horarios = this.config?.horarios ?? [];
    if (!horarios.length) return { texto: '', hora: '' };

    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const diaHoy = ahora.getDay();

    for (let offset = 0; offset <= 7; offset++) {
      const dia = (diaHoy + offset) % 7;
      const slotsDia = horarios
        .filter(s => s.dia === dia)
        .sort((a, b) => this.toMin(a.inicio) - this.toMin(b.inicio));

      for (const slot of slotsDia) {
        if (offset === 0 && this.toMin(slot.inicio) <= minutosAhora) continue;
        const prefijo = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${this.getDiaNombre(dia)}`;
        return { texto: `${prefijo} a las ${slot.inicio}`, hora: slot.inicio };
      }
    }
    return { texto: '', hora: '' };
  }

  private toMin(hora: string): number {
    const [h = 0, m = 0] = hora.split(':').map(Number);
    return h * 60 + m;
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
      .replace(/\{\{\s*(asesor|advisor|agente)\s*\}\}/gi, 'Laura');
  }

  previewWhatsappOutOfHours(): string {
    return (this.config?.whatsappOutOfHoursMsg || this.placeholderWhatsappFuera)
      .replace(/\{\{\s*proximaApertura\s*\}\}/gi, 'manana a las 08:00')
      .replace(/\{\{\s*horaApertura\s*\}\}/gi, '08:00');
  }

  // ── Correo SMTP: estado centralizado en SmtpConfigComponent ─────────────
  onMailConfigChange(updated: ConfiguracionData): void {
    if (!this.config) return;
    this.config = { ...this.config, ...updated };
  }

  // ── IA Prompt methods ──────────────────────────────────────────────────────
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
      asesorReconexionSeg: config.asesorReconexionSeg ?? 120,
      asesorReconexionMsg: config.asesorReconexionMsg || 'El agente se desconectó. Esperando reconexión...',
      whatsappQuickReplies: Array.isArray(config.whatsappQuickReplies) ? config.whatsappQuickReplies : [],
      whatsappMaxActiveChatsPerAdvisor: config.whatsappMaxActiveChatsPerAdvisor ?? 3,
      ticketEmailActivo: config.ticketEmailActivo ?? true,
      ticketEmailAsunto: config.ticketEmailAsunto || this.placeholderTicketEmailAsunto,
      ticketEmailCuerpo: config.ticketEmailCuerpo || this.placeholderTicketEmailCuerpo,
      ticketEmailDesign: Array.isArray(config.ticketEmailDesign) ? config.ticketEmailDesign : null,
      ticketEmailSenderName: config.ticketEmailSenderName || 'Soporte',
      ticketEmailIncludeInfo: config.ticketEmailIncludeInfo ?? true,
      ticketEmailSendCopy: config.ticketEmailSendCopy ?? false,
      ticketEmailAttachments: config.ticketEmailAttachments ?? false,
      smtpHost: config.smtpHost || '',
      smtpPort: config.smtpPort || 465,
      smtpSecure: config.smtpSecure ?? true,
      smtpUser: config.smtpUser || '',
      smtpPass: config.smtpPass || '',
      mailFrom: config.mailFrom || '',
    };
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

      this.aiPalabrasProhibidas = Array.isArray(aiCfg['palabrasProhibidas']) && aiCfg['palabrasProhibidas'].length
        ? aiCfg['palabrasProhibidas']
        : ['hijueputa', 'gonorrea', 'malparido', 'marica', 'pendejo', 'idiota', 'estupido', 'imbecil', 'puta', 'mierda'];
      this.aiMensajeGroseria = aiCfg['mensajeGroseria'] || 'Por favor, mantengamos un trato respetuoso. No puedo ayudarte si usas lenguaje ofensivo. ¿En qué más puedo ayudarte?';
      this.aiLimiteGroserias = Number(aiCfg['limiteGroserias']) || 3;
      this.aiMensajeSesionTerminada = aiCfg['mensajeSesionTerminada'] || 'Esta conversación ha sido finalizada por el uso continuado de lenguaje ofensivo. Si necesitas ayuda, inicia una nueva conversación manteniendo un trato respetuoso.';
      this.aiMensajeSinInformacion = aiCfg['mensajeSinInformacion'] || 'No tengo información registrada sobre eso por el momento. ¿Necesitas un agente para una mejor ayuda?';
      this.aiSugerirAsesorAutomatico = aiCfg['sugerirAsesorAutomatico'] !== false;

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
    this.aiPalabrasProhibidas = ['hijueputa', 'gonorrea', 'malparido', 'marica', 'pendejo', 'idiota', 'estupido', 'imbecil', 'puta', 'mierda'];
    this.aiMensajeGroseria = 'Por favor, mantengamos un trato respetuoso. No puedo ayudarte si usas lenguaje ofensivo. ¿En qué más puedo ayudarte?';
    this.aiLimiteGroserias = 3;
    this.aiMensajeSesionTerminada = 'Esta conversación ha sido finalizada por el uso continuado de lenguaje ofensivo. Si necesitas ayuda, inicia una nueva conversación manteniendo un trato respetuoso.';
    this.aiMensajeSinInformacion = 'No tengo información registrada sobre eso por el momento. ¿Necesitas un agente para una mejor ayuda?';
    this.aiSugerirAsesorAutomatico = true;
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
        palabrasProhibidas: this.aiPalabrasProhibidas,
        mensajeGroseria: this.aiMensajeGroseria,
        limiteGroserias: this.aiLimiteGroserias,
        mensajeSesionTerminada: this.aiMensajeSesionTerminada,
        mensajeSinInformacion: this.aiMensajeSinInformacion,
        sugerirAsesorAutomatico: this.aiSugerirAsesorAutomatico,
        promptPersonalizado: null,
      };
    }
  }

  addForbiddenWord(): void {
    const w = this.newForbiddenWord.trim().toLowerCase();
    if (w && !this.aiPalabrasProhibidas.includes(w)) {
      this.aiPalabrasProhibidas.push(w);
      this.newForbiddenWord = '';
    }
  }

  removeForbiddenWord(w: string): void {
    this.aiPalabrasProhibidas = this.aiPalabrasProhibidas.filter(p => p !== w);
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

  // ── Colegios CRUD ──────────────────────────────────────────────────────────

  loadColegios(): void {
    this.colegioPage = 1;
    this.colegiosLoading = true;
    this.sessionService.getColegios().subscribe({
      next: (c) => {
        this.colegios = c.map(co => ({ ...co, nombre: this.sanitizeText(co.nombre), link: this.sanitizeText(co.link) }));
        this.colegiosLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.colegiosLoading = false; this.cdr.detectChanges(); },
    });
  }

  get colegiosFiltrados(): Colegio[] {
    const q = this.colegioSearch.trim().toLowerCase();
    if (!q) return this.colegios;
    return this.colegios.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }

  get paginatedColegios(): Colegio[] {
    const start = (this.colegioPage - 1) * this.colegioPageSize;
    return this.colegiosFiltrados.slice(start, start + this.colegioPageSize);
  }

  get totalColegioPages(): number {
    return Math.ceil(this.colegiosFiltrados.length / this.colegioPageSize);
  }

  colegioPageRange(): number[] {
    const total = this.totalColegioPages;
    const current = this.colegioPage;
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

  setColegioPage(page: number): void {
    if (page < 1 || page > this.totalColegioPages) return;
    this.colegioPage = page;
    this.cdr.detectChanges();
  }

  onColegioPageSizeChange(size: number): void {
    this.colegioPageSize = size;
    this.colegioPage = 1;
    this.cdr.detectChanges();
  }

  sanitizeText(str: string): string {
    if (!str) return '';
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.textContent || '';
  }

  openColegioForm(colegio?: Colegio): void {
    if (colegio) {
      this.colegioEditando = colegio;
      this.colegioForm = { nombre: colegio.nombre, link: colegio.link, email: colegio.email ?? '' };
    } else {
      this.colegioEditando = null;
      this.colegioForm = { nombre: '', link: '', email: '' };
    }
    this.colegioFormVisible = true;
    this.cdr.detectChanges();
  }

  closeColegioForm(): void {
    this.colegioFormVisible = false;
    this.colegioEditando = null;
    this.colegioForm = { nombre: '', link: '', email: '' };
    this.cdr.detectChanges();
  }

  saveColegio(): void {
    if (!this.colegioForm.nombre.trim() || !this.colegioForm.link.trim()) return;
    this.colegioSaving = true;

    const payload = {
      nombre: this.colegioForm.nombre.trim(),
      link: this.colegioForm.link.trim(),
      email: this.colegioForm.email.trim() || undefined,
    };

    const obs = this.colegioEditando
      ? this.sessionService.updateColegio(this.colegioEditando.id, payload)
      : this.sessionService.createColegio(payload);

    obs.subscribe({
      next: () => {
        this.colegioSaving = false;
        this.closeColegioForm();
        this.loadColegios();
        this.notification.success(
          this.colegioEditando ? 'Colegio actualizado' : 'Colegio creado',
          'Los cambios se guardaron correctamente.',
        );
      },
      error: (err) => {
        this.colegioSaving = false;
        const msg = err.error?.message || 'Error al guardar el colegio.';
        this.notification.error('Error', Array.isArray(msg) ? msg.join('. ') : msg);
        this.cdr.detectChanges();
      },
    });
  }

  confirmDeleteColegio(colegio: Colegio): void {
    this.colegioDeletingId = colegio.id;
    this.cdr.detectChanges();
  }

  cancelDeleteColegio(): void {
    this.colegioDeletingId = null;
    this.cdr.detectChanges();
  }

  toggleColegioSelection(id: string): void {
    if (this.colegioSelectedIds.has(id)) {
      this.colegioSelectedIds.delete(id);
    } else {
      this.colegioSelectedIds.add(id);
    }
    this.cdr.detectChanges();
  }

  toggleAllColegios(): void {
    const currentIds = this.paginatedColegios.map(c => c.id);
    const allSelected = currentIds.every(id => this.colegioSelectedIds.has(id));
    if (allSelected) {
      for (const id of currentIds) this.colegioSelectedIds.delete(id);
    } else {
      for (const id of currentIds) this.colegioSelectedIds.add(id);
    }
    this.cdr.detectChanges();
  }

  deleteColegiosSeleccionados(): void {
    const ids = Array.from(this.colegioSelectedIds);
    if (!ids.length) return;
    this.colegioDeletingBulk = true;
    this.sessionService.deleteColegiosBulk(ids).subscribe({
      next: (res) => {
        this.colegioDeletingBulk = false;
        this.colegioSelectedIds.clear();
        this.loadColegios();
        this.notification.success('Eliminados', `${res.deleted} colegio${res.deleted === 1 ? '' : 's'} eliminado${res.deleted === 1 ? '' : 's'}.`);
      },
      error: (err) => {
        this.colegioDeletingBulk = false;
        this.notification.error('Error', err.error?.message || 'Error al eliminar colegios.');
        this.cdr.detectChanges();
      },
    });
  }

  deleteColegio(id: string): void {
    this.sessionService.deleteColegio(id).subscribe({
      next: () => {
        this.colegioDeletingId = null;
        this.loadColegios();
        this.notification.success('Colegio eliminado', 'El colegio fue eliminado correctamente.');
      },
      error: (err) => {
        this.colegioDeletingId = null;
        const msg = err.error?.message || 'Error al eliminar el colegio.';
        this.notification.error('Error', Array.isArray(msg) ? msg.join('. ') : msg);
        this.cdr.detectChanges();
      },
    });
  }

  exportarColegiosCsv(): void {
    this.sessionService.exportColegios().subscribe({
      next: (res: any) => {
        const csv = res.csv;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'colegios.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.notification.error('Error', 'No se pudo exportar los colegios'),
    });
  }

  importarColegiosCsv(event: Event): void {
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
      const nIdx = cols.indexOf('nombre');
      const lIdx = cols.indexOf('link');
      const eIdx = cols.indexOf('email');

      if (nIdx === -1 || lIdx === -1) {
        this.notification.error('Error', 'El CSV debe tener columnas "nombre" y "link"');
        input.value = '';
        return;
      }

      const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max) : s;
      const colegios: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = this.parseCsvLine(lines[i]);
        const nombre = trunc(vals[nIdx]?.trim() || '', 200);
        const link = trunc(vals[lIdx]?.trim() || '', 500);
        const email = eIdx !== -1 ? vals[eIdx]?.trim() || undefined : undefined;
        if (nombre && link) {
          colegios.push({
            nombre,
            link,
            email: email ? trunc(email, 200) : undefined,
          });
        }
      }

      if (!colegios.length) {
        this.notification.error('Error', 'No se encontraron datos válidos en el CSV');
        input.value = '';
        return;
      }

      this.sessionService.importColegios(colegios).subscribe({
        next: (res: any) => {
          const msg = `${res.imported} colegio${res.imported === 1 ? '' : 's'} importado${res.imported === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} omitido${res.skipped === 1 ? '' : 's'} por duplicado)` : ''}`;
          this.notification.success('Importación completa', msg);
          input.value = '';
          this.loadColegios();
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

  ngOnDestroy(): void {
    this.layoutService.setSidebarForcedCollapsed(false);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
