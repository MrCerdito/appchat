import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaChat, WaMessage } from '../../../../../../core/models/whatsapp.models';
import { getInitials, getAvatarColor } from '../../../../../../shared/utils/avatar';
import { scrollToBottom } from '../../../../../../shared/utils/scroll';

interface Contacto {
  id: string;
  nombre: string;
  telefono: string;
  iniciales: string;
  color: string;
  ultimo: string;
  hora: string;
  noLeidos: number;
  online: boolean;
  ultimaVez: string;
  isGroup?: boolean;
}

interface Mensaje {
  id: string;
  texto: string;
  tipo: 'enviado' | 'recibido';
  hora: string;
  leido: boolean;
  fecha: string;
  senderName?: string;
}

@Component({
  selector: 'app-operaciones-chats',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './operaciones-chats.html',
  styleUrl: './operaciones-chats.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperacionesChatsComponent implements OnInit, OnDestroy {
  @ViewChild('messageFeed') messageFeed?: ElementRef<HTMLElement>;

  selectedChatId: string | null = null;
  busqueda = '';
  nuevoMensaje = '';
  loadingProgress = 0;

  private chatsMap = new Map<string, WaChat>();
  private messagesMap = new Map<string, WaMessage[]>();
  private subs: Subscription[] = [];
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private dataReady = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.dataReady = false;
    this.startLoadingProgress();

    this.whatsappChat.loadChats().subscribe();

    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(chats => {
        for (const chat of chats) {
          this.chatsMap.set(chat.id, chat);
        }
        if (this.selectedChatId && this.chatsMap.has(this.selectedChatId)) {
          this.whatsappChat.loadMessages(this.selectedChatId, 1, 100).subscribe({
            next: (messages) => {
              this.messagesMap.set(this.selectedChatId!, messages);
              this.dataReady = true;
              this.cdr.markForCheck();
              setTimeout(() => this.scrollToBottom(), 100);
            },
            error: (err) => console.error('HTTP Error:', err),
          });
        } else {
          this.dataReady = true;
        }
        this.cdr.markForCheck();
      }),
    );

    this.route.queryParams.subscribe({
      next: (params) => {
        if (params['chatId']) {
          this.selectedChatId = params['chatId'];
          if (this.chatsMap.has(params['chatId'])) {
            this.seleccionarChat(params['chatId']);
          } else {
            this.loadChatMessages(params['chatId'], true);
          }
        }
      },
      error: (err) => console.error('HTTP Error:', err),
    });

    this.subs.push(
      this.whatsappChat.onNewMessage().subscribe(data => {
        if (data.chatId === this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId, true);
        }
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

  private loadChatMessages(chatId: string, silent = false): void {
    if (!silent) {
      this.dataReady = false;
      this.startLoadingProgress();
    }
    this.whatsappChat.loadMessages(chatId, 1, 100).subscribe({
      next: (messages) => {
        this.messagesMap.set(chatId, messages);
        this.dataReady = true;
        this.cdr.markForCheck();
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  private scrollToBottom(): void {
    try {
      if (this.messageFeed?.nativeElement) {
        scrollToBottom(this.messageFeed.nativeElement);
      }
    } catch {}
  }

  get chatList(): Contacto[] {
    return Array.from(this.chatsMap.values()).map(chat => this.mapToContacto(chat));
  }

  get chatsFiltrados(): Contacto[] {
    if (!this.busqueda.trim()) return this.chatList;
    const q = this.busqueda.trim().toLowerCase();
    return this.chatList.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.telefono.includes(q) ||
      c.ultimo.toLowerCase().includes(q),
    );
  }

  get chatSeleccionado(): Contacto | null {
    if (!this.selectedChatId) return null;
    const chat = this.chatsMap.get(this.selectedChatId);
    return chat ? this.mapToContacto(chat) : null;
  }

  get mensajesActuales(): Mensaje[] {
    const messages = this.messagesMap.get(this.selectedChatId ?? '') ?? [];
    return messages.map(m => this.mapToMensaje(m));
  }

  get mensajesAgrupados(): { fecha: string; mensajes: Mensaje[] }[] {
    const grupos: Record<string, Mensaje[]> = {};
    for (const m of this.mensajesActuales) {
      if (!grupos[m.fecha]) grupos[m.fecha] = [];
      grupos[m.fecha].push(m);
    }
    return Object.entries(grupos).map(([fecha, mensajes]) => ({ fecha, mensajes }));
  }

  private mapToContacto(chat: WaChat): Contacto {
    return {
      id: chat.id,
      nombre: chat.name,
      telefono: chat.phone,
      iniciales: this.getInitials(chat.name),
      color: this.getAvatarColor(chat.name),
      ultimo: chat.preview || '—',
      hora: chat.time || '',
      noLeidos: chat.unread || 0,
      online: chat.status === 'online',
      ultimaVez: chat.status === 'online' ? 'en línea' : (chat.time ? `últ. vez ${chat.time}` : ''),
      isGroup: chat.isGroup,
    };
  }

  private mapToMensaje(msg: WaMessage): Mensaje {
    const d = new Date(msg.timestamp);
    return {
      id: msg.id,
      texto: msg.body || '',
      tipo: msg.fromMe ? 'enviado' : 'recibido',
      hora: this.formatTime(d),
      leido: msg.status === 'read' || msg.status === 'delivered',
      fecha: this.formatDate(d),
      senderName: msg.senderName || (msg.fromMe ? 'Admin' : undefined),
    };
  }

  private getInitials = getInitials;
  private getAvatarColor = getAvatarColor;

  private tz = 'America/Bogota';

  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: this.tz,
    }).format(date);
  }

  private formatDate(date: Date): string {
    const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: this.tz });
    const today = fmt(new Date());
    const msg = fmt(date);
    if (msg === today) return 'Hoy';

    const [y, m, d] = today.split('-').map(Number);
    let yd = d - 1, ym = m, yy = y;
    if (yd === 0) {
      ym--;
      if (ym === 0) { yy--; ym = 12; }
      yd = new Date(yy, ym, 0).getDate();
    }
    const yesterday = `${yy}-${String(ym).padStart(2, '0')}-${String(yd).padStart(2, '0')}`;
    if (msg === yesterday) return 'Ayer';

    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: this.tz }).format(date);
  }

  seleccionarChat(id: string): void {
    this.selectedChatId = id;
    this.loadChatMessages(id, true);
    this.whatsappChat.markRead(id).subscribe({
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  enviarMensaje(): void {
    if (!this.nuevoMensaje.trim() || !this.selectedChatId) return;
    const chat = this.chatsMap.get(this.selectedChatId);
    if (!chat) return;
    const to = chat.jid || chat.phone;
    this.whatsappChat.sendMessage(to, this.nuevoMensaje.trim()).subscribe({
      next: (res) => {
        if (res.ok && this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId, true);
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.nuevoMensaje = '';
  }

  trackByContactoId(_: number, c: Contacto): string { return c.id; }
  trackByMensajeId(_: number, m: Mensaje): string { return m.id; }

  private startLoadingProgress(): void {
    this.loadingProgress = 0;
    this.stopProgressTimer();

    const tick = () => {
      if (!this.dataReady) {
        const remaining = 100 - this.loadingProgress;
        const increment = Math.min(remaining * 0.15 + Math.random() * 3, 8);
        this.loadingProgress = Math.min(this.loadingProgress + increment, 90);
      } else {
        this.loadingProgress = 100;
        this.stopProgressTimer();
      }
      this.cdr.markForCheck();
    };

    this.progressTimer = setInterval(tick, 400);
    tick();
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopProgressTimer();
    this.subs.forEach(s => s.unsubscribe());
  }
}
