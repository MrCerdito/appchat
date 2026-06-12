import {
  Component, OnInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, Metrics } from '../../../../core/services/admin.service';
import { SessionService, RankingAsesor } from '../../../../core/services/session.service';

// Intervalo de polling en ms — 2 segundos para métricas en vivo
const POLL_INTERVAL = 2_000;

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './metrics.html',
  styleUrl: './metrics.scss',
})
export class MetricsComponent implements OnInit, OnDestroy {

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

  // Timer del polling — se limpia en ngOnDestroy para no dejar fugas de memoria
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private adminService  : AdminService,
    private sessionService: SessionService,
    private cdr           : ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Carga inicial inmediata
    this.fetchMetrics();
    this.loadComentarios();

    // Polling cada 2 segundos: refresca métricas y ranking en vivo
    // Los comentarios NO se refrescan en el polling para no interrumpir
    // la paginación mientras el usuario la navega.
    this.pollTimer = setInterval(() => {
      this.fetchMetrics();
    }, POLL_INTERVAL);
  }

  ngOnDestroy(): void {
    // Limpia el intervalo al destruir el componente para evitar fugas
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // Carga métricas y ranking juntos en una sola función
  // para que el polling sea una sola llamada
  private fetchMetrics(): void {
    this.adminService.getMetrics().subscribe({
      next: (m) => {
        this.metrics = m;
        this.loading = false;
        this.error   = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // Solo muestra error en la carga inicial; en polling silencia el error
        // para no romper la UI si hay un fallo momentáneo de red
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