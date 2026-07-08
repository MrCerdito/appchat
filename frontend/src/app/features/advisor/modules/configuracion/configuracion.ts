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
  tab: 'bienvenida' | 'asesor' | 'cliente' | 'almuerzo' = 'bienvenida';
  diaSeleccionado: number | null = null;

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
  }

    private advisorFields: (keyof ConfiguracionData)[] = [
    'mensajeBienvenida', 'asesorInactividadSeg', 'asesorInactividadMsg',
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
        this.saving = false;
        this.saved = true;
        this.notification.success('Configuración guardada', 'Tus cambios se aplicaron correctamente.');
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
}
