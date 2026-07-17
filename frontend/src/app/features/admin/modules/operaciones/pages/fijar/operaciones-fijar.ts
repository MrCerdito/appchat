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
  showFixPopup = false;
  fixPopupChatId: string | null = null;
  fixPopupChatName = '';

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

  openFixPopup(chatId: string, chatName: string): void {
    this.fixPopupChatId = chatId;
    this.fixPopupChatName = chatName;
    this.showFixPopup = true;
  }

  closeFixPopup(): void {
    this.showFixPopup = false;
    this.fixPopupChatId = null;
    this.fixPopupChatName = '';
  }

  fijarChat(asesorId: string): void {
    if (!this.fixPopupChatId || !asesorId) return;
    this.fixing.add(this.fixPopupChatId);
    const chatId = this.fixPopupChatId;
    this.whatsappChat.setFixedAdvisor(chatId, asesorId).subscribe({
      next: () => {
        this.fixing.delete(chatId);
        this.closeFixPopup();
        this.cdr.markForCheck();
      },
      error: () => {
        this.fixing.delete(chatId);
        this.closeFixPopup();
        this.cdr.markForCheck();
      },
    });
  }

  desfijarChat(chatId: string): void {
    this.fixing.add(chatId);
    this.whatsappChat.clearFixedAdvisor(chatId).subscribe({
      next: () => {
        this.fixing.delete(chatId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.fixing.delete(chatId);
        this.cdr.markForCheck();
      },
    });
  }

  trackByChatId(_: number, c: FijableChat): string { return c.id; }
  trackByAdvisorId(_: number, a: { id: string }): string { return a.id; }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
