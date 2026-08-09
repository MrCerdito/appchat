import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaReportData, WaReportSeries } from '../../../../../../core/models/whatsapp.models';
import { formatDuration } from '../../../../../../shared/utils/duration';

@Component({
  selector: 'app-operaciones-reportes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './operaciones-reportes.html',
  styleUrl: './operaciones-reportes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesReportesComponent implements OnInit, OnDestroy {
  protected readonly Math = Math;
  protected readonly Date = Date;

  granularidad: 'day' | 'month' | 'year' = 'day';
  desde: string = '';
  hasta: string = '';
  reporte: WaReportData | null = null;
  cargando = false;
  exportando = false;
  error = '';
  ultimaActualizacion: Date | null = null;

  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.setGranularidad('day');
    this.subs.push(
      interval(30_000).subscribe(() => this.actualizar()),
    );
  }

  actualizar(): void {
    if (this.cargando) return;
    this.cargar();
  }

  horaActualizacion(): string {
    if (!this.ultimaActualizacion) return '—';
    return this.ultimaActualizacion.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  setGranularidad(g: 'day' | 'month' | 'year'): void {
    this.granularidad = g;
    const { from, to } = this.rangoPorGranularidad(g);
    this.desde = from;
    this.hasta = to;
    this.cargar();
  }

  cambiarDesde(): void {
    if (this.desde > this.hasta) this.hasta = this.desde;
    this.cargar();
  }

  cambiarHasta(): void {
    if (this.hasta < this.desde) this.desde = this.hasta;
    this.cargar();
  }

  private rangoPorGranularidad(g: 'day' | 'month' | 'year'): { from: string; to: string } {
    const hoy = new Date();
    const fmt = (d: Date): string => {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${m}-${day}`;
    };
    if (g === 'year') {
      return {
        from: `${hoy.getFullYear()}-01-01`,
        to: fmt(hoy),
      };
    }
    if (g === 'month') {
      return {
        from: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
        to: fmt(hoy),
      };
    }
    return { from: fmt(hoy), to: fmt(hoy) };
  }

  private cargar(): void {
    if (this.cargando) return;
    this.cargando = true;
    this.error = '';
    this.whatsappChat.loadReportData(this.desde, this.hasta, this.granularidad).subscribe({
      next: (data) => {
        this.reporte = data;
        this.cargando = false;
        this.ultimaActualizacion = new Date();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('HTTP Error:', err);
        this.cargando = false;
        this.error = 'No se pudo cargar el reporte. Intenta de nuevo.';
        this.cdr.markForCheck();
      },
    });
  }

  exportarExcel(): void {
    this.exportando = true;
    this.whatsappChat.loadReport(this.desde, this.hasta).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-whatsapp_${this.desde}_a_${this.hasta}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.exportando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('HTTP Error:', err);
        this.exportando = false;
        this.error = 'No se pudo generar el archivo Excel.';
        this.cdr.markForCheck();
      },
    });
  }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  serieMax(series: WaReportSeries[] | undefined): number {
    if (!series || series.length === 0) return 1;
    return Math.max(...series.map((s) => Math.max(s.recibidos, s.asignados, s.cerrados)), 1);
  }

  periodoLabel(periodo: string): string {
    if (this.granularidad === 'year') {
      const [y, m] = periodo.split('-');
      const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${meses[Number(m) - 1]} ${y}`;
    }
    if (this.granularidad === 'month') {
      const [y, m] = periodo.split('-');
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return `${meses[Number(m) - 1]} ${y}`;
    }
    const [y, m, d] = periodo.split('-');
    return `${d}/${m}/${y}`;
  }

  categoriaClase(categoria: string): string {
    const map: Record<string, string> = {
      cola: 'cola',
      gestion: 'gestion',
      espera_respuesta: 'espera',
      sla_vencido: 'vencido',
      esperando_cliente: 'cliente',
      soporte: 'soporte',
      resuelto: 'resuelto',
      cerrado: 'cerrado',
      grupo: 'grupo',
    };
    return map[categoria] ?? '';
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  dur(minutes: number): string {
    return formatDuration(minutes);
  }

  trackBySerie(_: number, s: WaReportSeries): string { return s.periodo; }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
