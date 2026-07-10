import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { WhatsappChatService } from '../../../../../../core/services/whatsapp-chat.service';
import { WaChat, WaMessage } from '../../../../../../core/models/whatsapp.models';

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

  private chatsMap = new Map<string, WaChat>();
  private messagesMap = new Map<string, WaMessage[]>();
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private whatsappChat: WhatsappChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.whatsappChat.loadChats().subscribe();

    this.subs.push(
      this.whatsappChat.getChatsStream().subscribe(chats => {
        for (const chat of chats) {
          this.chatsMap.set(chat.id, chat);
        }
        this.cdr.markForCheck();
      }),
    );

    this.route.queryParams.subscribe(params => {
      if (params['chatId'] && this.chatsMap.has(params['chatId'])) {
        this.seleccionarChat(params['chatId']);
      } else if (params['chatId']) {
        const id = params['chatId'];
        this.selectedChatId = id;
        this.loadChatMessages(id);
      }
    });

    this.subs.push(
      this.whatsappChat.onNewMessage().subscribe(data => {
        if (data.chatId === this.selectedChatId) {
          this.loadChatMessages(this.selectedChatId);
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
        this.whatsappChat.loadChats().subscribe();
      }),
    );
  }

  private loadChatMessages(chatId: string): void {
    this.whatsappChat.loadMessages(chatId, 1, 100).subscribe(messages => {
      this.messagesMap.set(chatId, messages);
      this.cdr.markForCheck();
      setTimeout(() => this.scrollToBottom(), 100);
    });
  }

  private scrollToBottom(): void {
    try {
      this.messageFeed?.nativeElement?.scrollTo({
        top: this.messageFeed.nativeElement.scrollHeight,
        behavior: 'smooth',
      });
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

  private getInitials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  private getAvatarColor(name: string): string {
    const colors = ['#128C7E', '#5F4B8B', '#E91E63', '#FF9800', '#2196F3', '#009688', '#3B82F6', '#EC4899'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

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
    this.loadChatMessages(id);
    this.whatsappChat.markRead(id).subscribe();
  }

  volverAlPanel(): void {
    this.router.navigate(['/admin/operaciones']);
  }

  enviarMensaje(): void {
    if (!this.nuevoMensaje.trim() || !this.selectedChatId) return;
    const chat = this.chatsMap.get(this.selectedChatId);
    if (!chat) return;
    const to = chat.jid || chat.phone;
    this.whatsappChat.sendMessage(to, this.nuevoMensaje.trim()).subscribe(res => {
      if (res.ok && this.selectedChatId) {
        this.loadChatMessages(this.selectedChatId);
      }
      this.cdr.markForCheck();
    });
    this.nuevoMensaje = '';
  }

  trackByContactoId(_: number, c: Contacto): string { return c.id; }
  trackByMensajeId(_: number, m: Mensaje): string { return m.id; }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
