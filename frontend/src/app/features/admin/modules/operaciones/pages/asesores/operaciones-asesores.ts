import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaAdvisorStats } from '../../../../../../core/models/whatsapp.models';

@Component({
  selector: 'app-operaciones-asesores',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './operaciones-asesores.html',
  styleUrl: './operaciones-asesores.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesAsesoresComponent implements OnInit, OnDestroy {
  protected readonly Math = Math;
  filtroStatus: 'todos' | 'online' | 'busy' | 'away' = 'todos';

  asesores: WaAdvisorStats[] = [];
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.whatsappChat.loadAdminDashboard().subscribe(dashboard => {
      this.asesores = dashboard.advisors;
      this.cdr.markForCheck();
    });

    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(() => {
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      interval(30_000).subscribe(() => {
        this.whatsappChat.loadAdminDashboard().subscribe(dashboard => {
          this.asesores = dashboard.advisors;
          this.cdr.markForCheck();
        });
      }),
    );
  }

  get asesoresFiltrados(): WaAdvisorStats[] {
    if (this.filtroStatus === 'todos') return this.asesores;
    return this.asesores.filter(a => a.status === this.filtroStatus);
  }

  setFiltro(f: 'todos' | 'online' | 'busy' | 'away'): void {
    this.filtroStatus = f;
  }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  capacidadColor(pct: number): string {
    if (pct > 110) return '#DC2626';
    if (pct > 100) return '#F59E0B';
    return '#10B981';
  }

  advisorCapacity(advisor: WaAdvisorStats): number {
    const total = advisor.connectedMinutes + advisor.idleMinutes;
    if (total === 0) return Math.min(advisor.activeChats * 20, 100);
    return Math.round((advisor.connectedMinutes / total) * 100);
  }

  slaRiesgo(advisor: WaAdvisorStats): number {
    return Math.max(0, Math.round((1 - advisor.slaPercent / 100) * advisor.activeChats));
  }

  getInitials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  statusLabel(advisor: WaAdvisorStats): string {
    if (!advisor.active) return 'Inactivo';
    const map: Record<string, string> = { online: 'Disponible', busy: 'En chat', away: 'Ausente' };
    return map[advisor.status] || advisor.status;
  }

  statusClass(advisor: WaAdvisorStats): string {
    if (!advisor.active) return 'away';
    return advisor.status;
  }

  trackByAdvisorId(_: number, a: WaAdvisorStats): string { return a.id; }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
