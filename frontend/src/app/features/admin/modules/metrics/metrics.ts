import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminService, Metrics } from '../../../../core/services/admin.service';
import { SessionService, RankingAsesor, AiStats } from '../../../../core/services/session.service';
import { SocketService } from '../../../../core/services/socket.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { fmtDateMedium } from '../../../../shared/utils/date';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './metrics.html',
  styleUrl: './metrics.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly fmtDateMedium = fmtDateMedium;
  metrics : Metrics | null   = null;
  aiStats : AiStats  | null  = null;
  ranking : RankingAsesor[]  = [];
  loading = true;
  error   = false;
  Math    = Math;

  comentarios     : any[] = [];
  comentPage      = 1;
  comentPages     = 1;
  comentTotal     = 0;
  selectedAdvisor = '';

  // ── Filtros de fecha ──
  desde = '';
  hasta = '';
  exporting = false;

  private destroy$ = new Subject<void>();

  constructor(
    private adminService  : AdminService,
    private sessionService: SessionService,
    private socket        : SocketService,
    private cdr           : ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.fetchMetrics();
    this.loadComentarios();
    this.fetchAiStats();

    // Escucha eventos del socket para refrescar métricas en tiempo real
    // sin necesidad de polling
    this.socket.on('metrics_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchMetrics();
      });

    this.socket.on('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchMetrics();
      });

    this.socket.on('advisor_status_changed')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchMetrics();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFechasCambiadas(): void {
    if (this.desde && this.hasta && this.desde > this.hasta) {
      this.hasta = this.desde;
    }
    if (this.hasta && this.desde && this.hasta < this.desde) {
      this.desde = this.hasta;
    }
    this.fetchAiStats();
  }

  exportarExcel(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.sessionService.exportReport(this.desde || undefined, this.hasta || undefined).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-metricas_${this.desde || 'todo'}_a_${this.hasta || 'hoy'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.exporting = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('HTTP Error:', err);
        this.exporting = false;
        this.cdr.detectChanges();
      },
    });
  }

  private fetchMetrics(): void {
    this.adminService.getMetrics().subscribe({
      next: (m) => {
        this.metrics = m;
        this.loading = false;
        this.error   = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.loading) {
          this.error   = true;
          this.loading = false;
          this.cdr.detectChanges();
        }
      },
    });

    this.sessionService.getRankingAsesores().subscribe({
      next: (r) => {
        this.ranking = r;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  private fetchAiStats(): void {
    this.sessionService.getAiStats(this.desde || undefined, this.hasta || undefined).subscribe({
      next: (s) => {
        this.aiStats = s;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  loadComentarios(page = 1): void {
    this.comentPage = page;
    this.adminService.getAllComentarios(page, 8, this.selectedAdvisor || undefined).subscribe({
      next: (res) => {
        this.comentarios = res.data;
        this.comentPage  = res.page;
        this.comentPages = res.pages;
        this.comentTotal = res.total;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  onAdvisorFilter(): void {
    this.loadComentarios(1);
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = {
      online : 'Disponible',
      busy   : 'Ocupado',
      offline: 'Inactivo',
    };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  getStatusClass(status?: string): string {
    return status ?? 'offline';
  }

  getStars(avg: number): string[] {
    return [1, 2, 3, 4, 5].map(i => {
      if (i <= Math.floor(avg)) return 'full';
      if (i === Math.ceil(avg) && avg % 1 >= 0.5) return 'half';
      return 'empty';
    });
  }

  getResolucionColor(tasa: number): string {
    if (tasa >= 75) return '#16a34a';
    if (tasa >= 50) return '#b45309';
    return '#dc2626';
  }

  fmtPct(valor: number | undefined): string {
    return `${valor ?? 0}%`;
  }

  fmtS(num: number | undefined): string {
    return new Intl.NumberFormat('es-CO').format(num ?? 0);
  }

  paginas(): number[] {
    const max = 10;
    const start = Math.max(1, this.comentPage - Math.floor(max / 2));
    const end = Math.min(this.comentPages, start + max - 1);
    const out: number[] = [];
    for (let p = start; p <= end; p++) out.push(p);
    return out;
  }
}