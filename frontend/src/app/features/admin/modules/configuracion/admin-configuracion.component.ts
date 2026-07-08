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
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.svc.getGlobal().subscribe({
      next: (config) => {
        this.config = this.normalize(config);
        this.loading = false;
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

    this.svc.guardarGlobal(this.config).subscribe({
      next: (config) => {
        this.config = this.normalize(config);
        this.saving = false;
        this.saved = true;
        setTimeout(() => {
          this.saved = false;
          this.cdr.detectChanges();
        }, 3000);
        this.cdr.detectChanges();
      },
      error: () => {
        this.saving = false;
        this.error = 'Error al guardar. Intenta de nuevo.';
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
    };
  }
}
