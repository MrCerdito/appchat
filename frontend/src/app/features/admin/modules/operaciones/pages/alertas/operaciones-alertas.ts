import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaAdminAlert } from '../../../../../../core/models/whatsapp.models';

interface AlertaView {
  id: string;
  tipo: string;
  severidad: 'critical' | 'warning' | 'info';
  titulo: string;
  descripcion: string;
  timestamp: Date;
  contador: number;
}

@Component({
  selector: 'app-operaciones-alertas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './operaciones-alertas.html',
  styleUrl: './operaciones-alertas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesAlertasComponent implements OnInit, OnDestroy {
  filtroSeveridad: 'todas' | 'critical' | 'warning' | 'info' = 'todas';

  private rawAlerts: WaAdminAlert[] = [];
  private subs: Subscription[] = [];

  readonly severidadLabels: Record<string, string> = {
    critical: 'Crítica',
    warning: 'Advertencia',
    info: 'Información',
  };

  readonly severidadPastel: Record<string, string> = {
    critical: '#FFE4E6',
    warning: '#FEF3C7',
    info: '#E0E7FF',
  };

  readonly severidadTexto: Record<string, string> = {
    critical: '#BE123C',
    warning: '#B45309',
    info: '#4338CA',
  };

  constructor(
    private router: Router,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.whatsappChat.loadAdminDashboard().subscribe({
      next: (dashboard) => {
        this.rawAlerts = dashboard.alerts;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    this.subs.push(
      interval(30_000).subscribe(() => {
        this.whatsappChat.loadAdminDashboard().subscribe({
          next: (dashboard) => {
            this.rawAlerts = dashboard.alerts;
            this.cdr.markForCheck();
          },
          error: (err) => console.error('HTTP Error:', err),
        });
      }),
    );
  }

  private mapAlertType(type: string): string {
    const map: Record<string, string> = {
      sla: 'sla',
      frozen: 'congelado',
      congelado: 'congelado',
      inactive: 'inactivo',
      inactivo: 'inactivo',
      queue: 'cola',
      cola: 'cola',
    };
    return map[type] || type;
  }

  get alerts(): AlertaView[] {
    return this.rawAlerts.map((a, i) => ({
      id: `alert-${i}`,
      tipo: this.mapAlertType(a.type),
      severidad: a.severity,
      titulo: a.title,
      descripcion: a.detail,
      timestamp: new Date(),
      contador: 1,
    }));
  }

  get alertasFiltradas(): AlertaView[] {
    if (this.filtroSeveridad === 'todas') return this.alerts;
    return this.alerts.filter(a => a.severidad === this.filtroSeveridad);
  }

  trackByAlertId(_: number, a: AlertaView): string { return a.id; }

  setFiltro(f: 'todas' | 'critical' | 'warning' | 'info'): void {
    this.filtroSeveridad = f;
  }

  timeAgo(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Hace unos segundos';
    if (mins === 1) return 'Hace 1 min';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs === 1) return 'Hace 1 hora';
    return `Hace ${hrs} horas`;
  }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  agruparPorTipo(alertas: AlertaView[]): { tipo: string; label: string; items: AlertaView[] }[] {
    const grupos: Record<string, AlertaView[]> = {};
    for (const a of alertas) {
      if (!grupos[a.tipo]) grupos[a.tipo] = [];
      grupos[a.tipo].push(a);
    }
    const labels: Record<string, string> = {
      sla: 'Alertas de SLA',
      frozen: 'Chats congelados',
      congelado: 'Chats congelados',
      inactive: 'Asesores inactivos',
      inactivo: 'Asesores inactivos',
      queue: 'Cola de espera',
      cola: 'Cola de espera',
    };
    return Object.entries(grupos).map(([tipo, items]) => ({
      tipo,
      label: labels[tipo] ?? tipo,
      items,
    }));
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
