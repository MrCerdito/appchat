import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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

type ConfigTab = 'jornada' | 'whatsapp' | 'mensajes' | 'inactividad';

@Component({
  selector: 'app-admin-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-configuracion.html',
  styleUrl: './admin-configuracion.scss',
})
export class AdminConfiguracionComponent implements OnInit {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  config: ConfiguracionData | null = null;
  loading = true;
  saving = false;
  saved = false;
  error = '';
  tab: ConfigTab = 'jornada';
  diaSeleccionado: number | null = null;

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

  constructor(
    private readonly svc: ConfiguracionFrontendService,
    private readonly notification: NotificationService,
    private readonly sound: SoundService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sound.loadSoundConfig();
    this.svc.getGlobal().subscribe({
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

    this.applySoundConfig();
    this.svc.guardarGlobal(this.config).subscribe({
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
    };
  }
}
