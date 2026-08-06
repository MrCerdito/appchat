import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaChat, WaAdvisorStats } from '../../../../../../core/models/whatsapp.models';

interface AsignableChat {
  id: string;
  cliente: string;
  telefono: string;
  iniciales: string;
  avatar: string;
  colegio: string;
  prioridad: string;
  estado: string;
  esGrupo: boolean;
  cerrado: boolean;
  ultimoMensaje: string;
  tiempoEspera: string;
  asesorAsignado: string;
  asesorNombre: string;
  esFijado: boolean;
  asesorFijoNombre: string;
}

@Component({
  selector: 'app-operaciones-asignar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './operaciones-asignar.html',
  styleUrl: './operaciones-asignar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesAsignarComponent implements OnInit, OnDestroy {
  filtroEstado = 'todos';
  filtroPrioridad = 'todas';
  filtroTipo = 'todos';
  searchQuery = '';

  asesores: { id: string; nombre: string }[] = [];
  chats: AsignableChat[] = [];
  assigning = new Set<string>();
  releasing = new Set<string>();
  lastError: string | null = null;
  selectedAdvisor: Record<string, string> = {};

  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.whatsappChat.loadAdminDashboard().subscribe({
      next: (dashboard) => {
        this.asesores = dashboard.advisors.map(a => ({
          id: a.id,
          nombre: a.name,
        }));
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    this.whatsappChat.loadChats().subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });

    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(chats => {
        this.chats = chats.map(c => this.mapToAsignable(c));
        for (const c of this.chats) {
          if (!(c.id in this.selectedAdvisor)) {
            this.selectedAdvisor[c.id] = c.asesorAsignado || '';
          }
        }
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.whatsappChat.onChatAssigned().subscribe(() => {
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      interval(15_000).subscribe(() => {
        this.whatsappChat.loadChats().subscribe({
          error: (err) => console.error('HTTP Error:', err),
        });
      }),
    );
  }

  private mapToAsignable(chat: WaChat): AsignableChat {
    return {
      id: chat.id,
      cliente: chat.name,
      telefono: chat.phone,
      iniciales: this.getInitials(chat.name),
      avatar: this.getAvatarColor(chat.name),
      colegio: chat.institution || '—',
      prioridad: chat.priority || 'normal',
      estado: chat.operationalStatusLabel || chat.operationalStatus || chat.assignmentStatus || 'Nuevo',
      esGrupo: !!chat.isGroup,
      cerrado: chat.assignmentStatus === 'closed' || chat.operationalStatus === 'closed',
      ultimoMensaje: chat.preview || '—',
      tiempoEspera: chat.time || '—',
      asesorAsignado: chat.assignedTo || '',
      asesorNombre: chat.assignedToName || '',
      esFijado: !!chat.fixedAdvisorId,
      asesorFijoNombre: chat.fixedAdvisorName || '',
    };
  }

  private getInitials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  private getAvatarColor(name: string): string {
    const colors = ['#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  get chatsFiltrados(): AsignableChat[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.chats
      .filter(c => {
        if (this.filtroEstado !== 'todos' && c.estado !== this.filtroEstado) return false;
        if (this.filtroPrioridad !== 'todas' && c.prioridad !== this.filtroPrioridad) return false;
        if (this.filtroTipo === 'grupos' && !c.esGrupo) return false;
        if (this.filtroTipo === 'individuales' && c.esGrupo) return false;
        if (q) {
          const haystack = [c.cliente, c.telefono, c.colegio, c.asesorNombre].join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.cerrado !== b.cerrado) return a.cerrado ? 1 : -1;
        const pa = this.priorityRank(a.prioridad);
        const pb = this.priorityRank(b.prioridad);
        if (pa !== pb) return pa - pb;
        const ua = a.asesorAsignado ? 1 : 0;
        const ub = b.asesorAsignado ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return 0;
      });
  }

  private priorityRank(p: string): number {
    const map: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    return map[p] ?? 2;
  }

  prioridadClass(p: string): string {
    const map: Record<string, string> = { critical: 'urgente', high: 'alta', normal: 'media', low: 'baja' };
    return map[p] || p;
  }

  asignarChat(chatId: string, asesorId: string): void {
    if (!asesorId) return;
    this.lastError = null;
    this.assigning.add(chatId);
    this.whatsappChat.adminAssignChat(chatId, asesorId).subscribe({
      next: () => {
        this.assigning.delete(chatId);
        this.selectedAdvisor[chatId] = asesorId;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.assigning.delete(chatId);
        this.lastError = this.errorMsg(err);
        this.cdr.markForCheck();
      },
    });
  }

  liberarChat(chat: AsignableChat): void {
    if (this.releasing.has(chat.id)) return;
    this.lastError = null;
    this.releasing.add(chat.id);
    this.whatsappChat.closeChat(chat.id).subscribe({
      next: () => {
        this.releasing.delete(chat.id);
        this.selectedAdvisor[chat.id] = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.releasing.delete(chat.id);
        this.lastError = this.errorMsg(err);
        this.cdr.markForCheck();
      },
    });
  }

  private errorMsg(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return e?.error?.message || e?.message || 'No se pudo completar la operacion';
  }

  trackByChatId(_: number, c: AsignableChat): string { return c.id; }
  trackByAdvisorId(_: number, a: { id: string }): string { return a.id; }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
