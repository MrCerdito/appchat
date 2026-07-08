import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SessionService, AdvisorMetrics, RankingAsesor } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SocketService } from '../../../../core/services/socket.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-advisor-metrics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics.html',
  styleUrl: './metrics.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvisorMetricsComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  metrics: AdvisorMetrics | null = null;
  ranking: RankingAsesor[]       = [];
  loading  = true;
  error    = false;
  Math     = Math;
  lastUpdated: Date | null = null;
  
  comentarios: any[]  = [];
  comentPage  = 1;
  comentPages = 1;
  comentTotal = 0;

  private destroy$ = new Subject<void>();
  private userId: string | null = null;

  constructor(
    private sessionService: SessionService,
    private authService: AuthService,
    private socket: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    if (!user?.id) return;
    this.userId = user.id;

    this.fetchMetrics();
    this.loadComentarios();

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
    if (!this.userId) return;
    this.sessionService.getMetricsByAdvisor(this.userId).subscribe({
      next: (m) => {
        this.metrics     = m;
        this.loading     = false;
        this.lastUpdated = new Date();
        this.cdr.detectChanges();
      },
      error: () => {
        this.error   = true;
        this.loading = false;
        this.cdr.detectChanges();
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
    if (!this.userId) return;
    this.sessionService.getComentariosByAdvisor(this.userId, page, 5).subscribe(res => {
      this.comentarios = res.data;
      this.comentPage  = res.page;
      this.comentPages = res.pages;
      this.comentTotal = res.total;
      this.cdr.detectChanges();
    });
  }

  getStatusLabel(status?: string): string {
    const map: Record<string, string> = { online: 'Disponible', busy: 'Ocupado', offline: 'Inactivo' };
    return map[status ?? 'offline'] ?? 'Inactivo';
  }

  getResolucionColor(tasa: number): string {
    if (tasa >= 75) return '#16a34a';
    if (tasa >= 50) return '#b45309';
    return '#dc2626';
  }

  getStars(avg: number): string[] {
    return [1, 2, 3, 4, 5].map(i => {
      if (i <= Math.floor(avg)) return 'full';
      if (i === Math.ceil(avg) && avg % 1 >= 0.5) return 'half';
      return 'empty';
    });
  }

  isCurrentUser(id: string): boolean {
    return this.authService.getUser()?.id === id;
  }

  getCargaLabel(): string {
    const active = this.metrics?.advisor.activeChats ?? 0;
    if (active >= 4) return 'Capacidad llena';
    if (active >= 2) return 'Carga media';
    return 'Disponible';
  }

  getPerformanceScore(): number {
    if (!this.metrics) return 0;
    const rating = this.metrics.avgEstrellas > 0 ? (this.metrics.avgEstrellas / 5) * 35 : 0;
    const resolucion = Math.min(this.metrics.tasaResolucion, 100) * 0.4;
    const respuesta = Math.max(0, 25 - Math.min(this.metrics.avgPrimeraRespuestaMin, 25));
    return Math.round(rating + resolucion + respuesta);
  }
}
