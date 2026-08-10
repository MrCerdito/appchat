import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaChat } from '../../../../../../core/models/whatsapp.models';
import { getInitials, getAvatarColor } from '../../../../../../shared/utils/avatar';

interface FijableChat {
  id: string;
  cliente: string;
  telefono: string;
  iniciales: string;
  avatar: string;
  colegio: string;
  prioridad: string;
  estado: string;
  ultimoMensaje: string;
  esGrupo: boolean;
  asesorActual: string;
  asesorActualNombre: string;
  asesorFijoId: string;
  asesorFijoNombre: string;
  isFijado: boolean;
}

@Component({
  selector: 'app-operaciones-fijar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './operaciones-fijar.html',
  styleUrl: './operaciones-fijar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesFijarComponent implements OnInit, OnDestroy {
  filtroFijado = 'todos';
  searchQuery = '';

  asesores: { id: string; nombre: string }[] = [];
  chats: FijableChat[] = [];
  fixing = new Set<string>();
  lastError: string | null = null;
  showFixPopup = false;
  fixPopupChatId: string | null = null;
  fixPopupChatName = '';
  fixPopupEsGrupo = false;

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
        this.chats = chats.map(c => this.mapToFijable(c));
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.whatsappChat.onChatUpdated().subscribe(() => {
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

  private mapToFijable(chat: WaChat): FijableChat {
    return {
      id: chat.id,
      cliente: chat.name,
      telefono: chat.phone,
      iniciales: this.getInitials(chat.name),
      avatar: this.getAvatarColor(chat.name),
      colegio: chat.institution || '—',
      prioridad: chat.priority || 'normal',
      estado: chat.operationalStatusLabel || chat.operationalStatus || chat.assignmentStatus || 'Nuevo',
      ultimoMensaje: chat.preview || '—',
      esGrupo: !!chat.isGroup,
      asesorActual: chat.assignedTo || '',
      asesorActualNombre: chat.assignedToName || '—',
      asesorFijoId: chat.fixedAdvisorId || '',
      asesorFijoNombre: chat.fixedAdvisorName || '',
      isFijado: !!chat.fixedAdvisorId,
    };
  }

  private getInitials = getInitials;
  private getAvatarColor = getAvatarColor;

  get chatsFiltrados(): FijableChat[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.chats.filter(c => {
      if (this.filtroFijado === 'fijados' && !c.isFijado) return false;
      if (this.filtroFijado === 'sin-fijar' && c.isFijado) return false;
      if (q) {
        const haystack = [c.cliente, c.telefono, c.colegio, c.asesorFijoNombre, c.asesorActualNombre].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  get totalFijados(): number {
    return this.chats.filter(c => c.isFijado).length;
  }

  prioridadClass(p: string): string {
    const map: Record<string, string> = { critical: 'urgente', high: 'alta', normal: 'media', low: 'baja' };
    return map[p] || p;
  }

  openFixPopup(chatId: string, chatName: string, esGrupo: boolean): void {
    this.fixPopupChatId = chatId;
    this.fixPopupChatName = chatName;
    this.fixPopupEsGrupo = esGrupo;
    this.showFixPopup = true;
  }

  closeFixPopup(): void {
    this.showFixPopup = false;
    this.fixPopupChatId = null;
    this.fixPopupChatName = '';
    this.fixPopupEsGrupo = false;
  }

  fijarChat(asesorId: string): void {
    if (!this.fixPopupChatId || !asesorId) return;
    this.fixing.add(this.fixPopupChatId);
    this.lastError = null;
    const chatId = this.fixPopupChatId;
    this.whatsappChat.setFixedAdvisor(chatId, asesorId).subscribe({
      next: () => {
        this.fixing.delete(chatId);
        this.closeFixPopup();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.fixing.delete(chatId);
        this.closeFixPopup();
        this.lastError = this.errorMsg(err);
        this.cdr.markForCheck();
      },
    });
  }

  desfijarChat(chatId: string): void {
    this.fixing.add(chatId);
    this.lastError = null;
    this.whatsappChat.clearFixedAdvisor(chatId).subscribe({
      next: () => {
        this.fixing.delete(chatId);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.fixing.delete(chatId);
        this.lastError = this.errorMsg(err);
        this.cdr.markForCheck();
      },
    });
  }

  private errorMsg(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return e?.error?.message || e?.message || 'No se pudo completar la operacion';
  }

  trackByChatId(_: number, c: FijableChat): string { return c.id; }
  trackByAdvisorId(_: number, a: { id: string }): string { return a.id; }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  openAdminSidebar(): void {
    const btn = document.querySelector('.sidebar-toggle-btn') as HTMLButtonElement;
    btn?.click();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
