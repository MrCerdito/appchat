import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminService, Metrics } from '../../../../core/services/admin.service';
import { SessionService, RankingAsesor } from '../../../../core/services/session.service';
import { SocketService } from '../../../../core/services/socket.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

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
  metrics : Metrics | null   = null;
  ranking : RankingAsesor[]  = [];
  loading = true;
  error   = false;
  Math    = Math;

  comentarios     : any[] = [];
  comentPage      = 1;
  comentPages     = 1;
  comentTotal     = 0;
  selectedAdvisor = '';

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
}