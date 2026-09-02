import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Message, TimelineItem, TimelineEvento } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { scrollToBottom } from '../../../../shared/utils/scroll';
import { fmtDateTimeShort, fmtDateTimeFull, fmtTime } from '../../../../shared/utils/date';
import { rangoCivilStr } from '../../../../shared/utils/fecha-bogota.util';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryGlobalComponent implements OnInit, OnDestroy {
  private readonly STORAGE_KEY = 'advisor_history_active_session';
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly fmtDateTimeShort = fmtDateTimeShort;
  protected readonly fmtDateTimeFull = fmtDateTimeFull;
  protected readonly fmtTime = fmtTime;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessions     : Session[] = [];
  activeSession: Session | null = null;
  timeline     : TimelineItem[] = [];
  nextBefore   : string | null = null;
  hasMoreHistorial = false;
  loadingMore  = false;
  msgSearchQuery = '';
  filter       : 'all' | 'active' | 'closed' = 'active';
  search = '';
  loading = false;

  // ── Filtros avanzados ──
  filterColegio      = '';
  filterRol          = '';
  filterSolicitud    = '';
  filterIdentificacion = '';
  filterAsesor       = '';

  // ── Filtro por fechas ──
  filterDateFrom  = '';
  filterDateTo    = '';

  // ── Dropdowns ──
  colegios   : string[] = [];
  roles      : string[] = [];
  solicitudes: string[] = [];
  asesores   : string[] = [];

  // ── Mobile ──
  mobileView: 'list' | 'chat' = 'list';

  // ── Preview de imagen ──
  imagePreview: { src: string; name: string } | null = null;

  // ── Tabs del chat ──
  activeTab: 'conversation' | 'info' | 'attachments' = 'conversation';
  showKebab = false;

  // ── Takeover ──
  takeoverLoading  = false;
  takeoverFeedback : { type: 'ok' | 'error'; text: string } | null = null;

  private currentUserId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private auth          : AuthService,
    private socket        : SocketService,
    private router        : Router,
    private cdr           : ChangeDetectorRef,
    private sanitizer     : DomSanitizer,
  ) {}

  // ── Filtro de sesiones ────────────────────────────────────────────────────
  get filteredSessions(): Session[] {
    return this.sessions.filter(s => {
      const matchStatus =
        this.filter === 'all' ||
        (this.filter === 'active'  && s.status !== 'closed') ||
        (this.filter === 'closed'  && s.status === 'closed');

      const q = this.search.toLowerCase();
      const matchSearch = !q ||
        s.clientName?.toLowerCase().includes(q)     ||
        s.advisor?.name?.toLowerCase().includes(q)  ||
        s.colegio?.toLowerCase().includes(q)        ||
        s.identificacion?.toLowerCase().includes(q);

      const matchColegio    = !this.filterColegio    || s.colegio?.toLowerCase()      === this.filterColegio.toLowerCase();
      const matchRol        = !this.filterRol        || s.rol?.toLowerCase()           === this.filterRol.toLowerCase();
      const matchSolicitud  = !this.filterSolicitud  || s.tipoSolicitud?.toLowerCase() === this.filterSolicitud.toLowerCase();
      const matchId         = !this.filterIdentificacion ||
        s.identificacion?.toLowerCase().includes(this.filterIdentificacion.toLowerCase());
      const matchAsesor     = !this.filterAsesor ||
        s.advisor?.name?.toLowerCase() === this.filterAsesor.toLowerCase();

      let matchDate = true;
      if ((this.filterDateFrom || this.filterDateTo) && s.createdAt) {
        const createdMs = new Date(s.createdAt).getTime();
        if (this.filterDateFrom) {
          const from = rangoCivilStr(this.filterDateFrom);
          if (from) matchDate = matchDate && createdMs >= new Date(from.desde).getTime();
        }
        if (this.filterDateTo) {
          const to = rangoCivilStr(this.filterDateTo);
          if (to) matchDate = matchDate && createdMs <= new Date(to.hasta).getTime();
        }
      }

      return matchStatus && matchSearch && matchColegio && matchRol && matchSolicitud && matchId && matchAsesor && matchDate;
    });
  }

  /** Estadísticas de atención según las sesiones filtradas */
  get stats() {
    const list      = this.filteredSessions;
    const total     = list.length;
    const conAsesor = list.filter(s => !!s.advisor?.name).length;
    const porIa     = total - conAsesor;
    const pct       = (n: number) => total ? Math.round((n / total) * 100) : 0;
    return {
      total,
      conAsesor,
      porIa,
      cerradas: list.filter(s => s.status === 'closed').length,
      pctAsesor: pct(conAsesor),
      pctIa    : pct(porIa),
    };
  }

  get canTakeOver(): boolean {
    if (!this.activeSession) return false;
    const s = this.activeSession;
    if (s.status !== 'active' && s.status !== 'waiting') return false;
    return s.advisor?.id !== this.currentUserId;
  }

  get filteredMessages(): TimelineItem[] {
    if (!this.msgSearchQuery.trim()) return this.timeline;
    const q = this.msgSearchQuery.toLowerCase();
    return this.timeline.filter(item => {
      if (item.kind === 'evento') {
        const d = item.detalle ?? {};
        return (
          d['pregunta']?.toLowerCase().includes(q) ||
          d['respuesta']?.toLowerCase().includes(q)
        );
      }
      return item.content?.toLowerCase().includes(q);
    });
  }

  esEvento(item: TimelineItem): item is TimelineEvento {
    return item.kind === 'evento';
  }

  eventoIcono(tipo: string): string {
    if (tipo === 'solicitud_asesor') return '🎧';
    if (tipo === 'faq_clic') return '❓';
    return 'ℹ️';
  }

  eventoTexto(item: TimelineEvento): string {
    if (item.tipo === 'solicitud_asesor') return 'El cliente solicitó hablar con un asesor';
    if (item.tipo === 'faq_clic') {
      const p = item.detalle?.['pregunta'];
      return p ? `Consultó la pregunta frecuente: "${p}"` : 'Consultó una pregunta frecuente';
    }
    return 'Evento de sesión';
  }

  /** Formatea el contenido (marcadores o HTML) como HTML seguro para la burbuja. */
  formatMessage(text: string): SafeHtml {
    if (!text) return '';
    if (this.isHtmlContent(text)) {
      return this.sanitizer.bypassSecurityTrustHtml(this.secureHtml(text));
    }
    const colorMap: Record<string, string> = {
      rojo: '#ef4444',
      verde: '#10b981',
      azul: '#3b82f6',
      naranja: '#f97316',
      morado: '#8b5cf6',
      amarillo: '#eab308',
    };
    const html = this.escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=\s|$|[)])/g, '$1<strong>$2</strong>')
      .replace(
        /\[color:(rojo|verde|azul|naranja|morado|amarillo)\]([\s\S]*?)\[\/color\]/g,
        (_, color, inner) =>
          `<span style="color:${colorMap[color]}">${inner}</span>`
      )
      .replace(
        /^(?:\d+\.\s+.+\n?)+/gm,
        (block) =>
          `<ol>${block
            .split('\n')
            .filter(Boolean)
            .map(line => `<li>${line.replace(/^\d+\.\s+/, '')}</li>`)
            .join('')}</ol>\n`
      )
      .replace(
        /^(?:[-•*]\s+.+\n?)+/gm,
        (block) =>
          `<ul>${block
            .split('\n')
            .filter(Boolean)
            .map(line => `<li>${line.replace(/^[-•*]\s+/, '')}</li>`)
            .join('')}</ul>\n`
      )
      .replace(/^#\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(
        /link:((https?:\/\/|www\.)[^\s<]+)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(
        /(?<!href="|src=")((https?:\/\/|www\.)[^\s<]+)/g,
        (match) => {
          const url = match.startsWith('www.') ? `https://${match}` : match;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        }
      )
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isHtmlContent(text: string): boolean {
    return /<(strong|b|ul|ol|li|div|p|br|span)[\s>]/i.test(text);
  }

  private secureHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\s*(script|iframe|object|embed)/gi, '&lt;$1')
      .replace(/\son[a-z]+\s*=/gi, ' data-blocked=')
      .replace(/javascript:/gi, '');
  }

  /** Busca el mensaje citado por replyToMessageId dentro del timeline. */
  getQuotedMessage(item: any): { senderName: string; content: string } | null {
    if (!item?.replyToMessageId) return null;
    const ref = this.timeline.find(t =>
      t.kind === 'message' && (t as any).id === item.replyToMessageId
    );
    if (!ref || ref.kind !== 'message') return null;
    const m = ref as any;
    return {
      senderName: m.senderName ?? (m.senderType === 'client' ? 'Cliente' : 'Asesor'),
      content: m.content || (m.attachments?.length ? '📎 Adjunto' : ''),
    };
  }

  /** Etiqueta humana para una opción que la IA ofreció (desde aiMarkers.opciones). */
  aiOptionLabel(opt: string): string {
    const map: Record<string, string> = {
      transferencia_asesor: 'La IA ofreció transferir a un asesor',
      agente: 'La IA ofreció ayuda de un asesor humano',
      encuesta: 'La IA mostró encuesta de satisfacción',
      documento: 'La IA adjuntó un documento',
    };
    return map[opt] ?? opt;
  }

  /** Resumen de la sesión (mensajes, documentos, duración). */
  get sessionSummary() {
    if (!this.activeSession) return null;
    const msgs = this.timeline.filter(t => t.kind === 'message') as any[];
    const client = msgs.filter(m => m.senderType === 'client').length;
    const advisor = msgs.filter(m => m.senderType === 'advisor' && m.senderName !== 'Asistente Virtual').length;
    const ia = msgs.filter(m => m.senderName === 'Asistente Virtual').length;
    const documentos = msgs.reduce((acc, m) => acc + (m.documentos?.length ?? 0), 0);
    const adjuntos = msgs.reduce((acc, m) => acc + (m.attachments?.length ?? 0), 0);
    const opciones = msgs.reduce((acc, m) => acc + (m.aiMarkers?.opciones?.length ?? 0), 0);
    return { total: msgs.length, client, advisor, ia, documentos, adjuntos, opciones };
  }

  /** Todos los adjuntos de la conversación (para la pestaña Adjuntos). */
  get allAttachments(): { id: string; url: string; originalName: string; mimeType: string; size: number; senderName: string; createdAt: string }[] {
    const atts: { id: string; url: string; originalName: string; mimeType: string; size: number; senderName: string; createdAt: string }[] = [];
    for (const item of this.timeline) {
      if (item.kind !== 'message') continue;
      const m = item as any;
      if (!m.attachments?.length) continue;
      for (const a of m.attachments) {
        atts.push({
          id: a.id,
          url: a.url,
          originalName: a.originalName ?? a.originalname ?? 'archivo',
          mimeType: a.mimeType ?? 'application/octet-stream',
          size: a.size ?? 0,
          senderName: m.senderName ?? (m.senderType === 'client' ? 'Cliente' : 'Asesor'),
          createdAt: m.createdAt,
        });
      }
    }
    return atts;
  }

  /** Agrupa el timeline por día para mostrar separadores de fecha. */
  groupDays(items: TimelineItem[]): { label: string; items: TimelineItem[] }[] {
    const groups: { label: string; items: TimelineItem[] }[] = [];
    let lastKey = '';
    for (const it of [...items]) {
      const d = new Date(it.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const hoy = new Date();
      const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
      const isHoy = `${hoy.getFullYear()}-${hoy.getMonth()}-${hoy.getDate()}` === key;
      const isAyer = `${ayer.getFullYear()}-${ayer.getMonth()}-${ayer.getDate()}` === key;
      const label = isHoy ? 'Hoy' : isAyer ? 'Ayer' : d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (key !== lastKey) {
        groups.push({ label, items: [] });
        lastKey = key;
      }
      groups[groups.length - 1].items.push(it);
    }
    return groups;
  }

  /** Exporta la conversación activa a CSV. */
  exportCsv(): void {
    if (!this.activeSession) return;
    const rows = this.timeline.map(t => {
      if (t.kind === 'evento') {
        return { fecha: t.createdAt, remitente: 'Sistema', contenido: this.eventoTexto(t) };
      }
      const m = t as any;
      return {
        fecha: m.createdAt,
        remitente: m.senderName ?? (m.senderType === 'client' ? 'Cliente' : 'Asesor'),
        contenido: (m.content || '') + (m.documentos?.length ? ' [Documentos: ' + m.documentos.map((d: any) => d.nombre).join(', ') + ']' : ''),
      };
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['fecha,remitente,contenido', ...rows.map(r => [esc(r.fecha), esc(r.remitente), esc(r.contenido)].join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `historial_${this.activeSession.clientName || this.activeSession.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Abre una vista imprimible/PDF de la conversación activa en otra ventana. */
  exportPdf(): void {
    if (!this.activeSession) return;
    const s = this.activeSession;
    const esc = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const fm = (iso?: string | null): string => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };

    const transcript = this.groupDays(this.timeline).map(grupo => {
      let html = '';
      for (const it of grupo.items) {
        if (it.kind === 'evento') {
          html += `<div class="evt">${esc(this.eventoTexto(it))}</div>`;
          continue;
        }
        const m = it as any;
        const sis = m.senderName === 'Sistema';
        const role = m.senderName ?? (m.senderType === 'client' ? 'Cliente' : 'Asesor');
        const content = esc(m.content || '');
        const cls = sis ? 'msg sys' : m.senderType === 'advisor' ? 'msg sent' : 'msg recv';
        const docs = m.documentos?.length
          ? `<div class="docs">${m.documentos.map((d: any) => `<span>📄 ${esc(d.nombre)}</span>`).join('')}</div>`
          : '';
        html += `<div class="${cls}">
          <div class="m-top"><span class="role">${esc(role)}</span><span class="time">${fm(m.createdAt)}</span></div>
          <div class="bubble">${content}${docs}</div>
        </div>`;
      }
      return `<div class="day">${esc(grupo.label)}</div>${html}`;
    }).join('');

    const cliente = (s.clientName || '') + (s.apellido ? ' ' + s.apellido : '');
    const chips = [
      ['Cliente', cliente],
      ['Identificación', s.identificacion],
      ['Colegio', s.colegio],
      ['Rol', s.rol],
      ['Tipo de solicitud', s.tipoSolicitud],
      ['Asesor', s.advisor?.name || 'Sin agente'],
      ['Estado', this.getStatusLabel(s.status)],
      ['Fecha', fm(s.createdAt)],
    ].filter(r => r[1]).map(r => `<span class="chip">${esc(r[0])} <b>${esc(r[1])}</b></span>`).join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Conversación</title><style>
      @page { size: A4; margin: 15mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a202c; margin: 0; font-size: 13px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { position: fixed; top: 12px; right: 12px; z-index: 99; padding: 10px 18px; background: #111827; color: #fff; border: 0; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }
      .report { max-width: 760px; margin: 0 auto; }
      .head { margin-bottom: 18px; }
      .head h1 { font-size: 21px; color: #0f172a; margin: 0 0 12px; font-weight: 700; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
      .chip { background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; border-radius: 999px; padding: 4px 12px; font-size: 12px; }
      .chip b { color: #0f172a; font-weight: 600; }
      .day { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin: 20px 0 8px; }
      .msg { margin-bottom: 12px; }
      .m-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
      .role { font-weight: 700; font-size: 11px; color: #475569; }
      .time { font-size: 10px; color: #a0aec0; }
      .bubble { display: inline-block; max-width: 82%; text-align: left; padding: 8px 12px; border-radius: 10px; font-size: 13px; white-space: pre-wrap; word-break: break-word; color: #1a202c; }
      .recv .bubble { background: #f1f5f9; }
      .sent { text-align: right; }
      .sent .m-top { justify-content: flex-end; }
      .sent .bubble { background: #e0e7ff; }
      .msg.sys .bubble { background: #fef3c7; color: #92400e; width: 100%; }
      .docs { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #1d4ed8; }
      .evt { background: #fef3c7; color: #92400e; border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; font-size: 12px; }
      @media print { .no-print { display: none !important; } body { margin: 0; } .msg { break-inside: avoid; } }
    </style></head><body>
      <button class="no-print" onclick="window.print()">Imprimir / PDF</button>
      <div class="report">
        <div class="head">
          <h1>Conversación de ${esc(cliente)}</h1>
          <div class="chips">${chips}</div>
        </div>
        ${transcript || '<p style="color:#94a3b8">Sin mensajes en esta conversación.</p>'}
      </div>
    </body></html>`);
    w.document.close();
  }

  /** Indica si el usuario actual ya es asesor/colaborador del chat activo */
  get alreadyInChat(): boolean {
    if (!this.activeSession) return false;
    const s = this.activeSession;
    if (s.advisor?.id === this.currentUserId) return true;
    const colabs: { id: string }[] = (s as any).collaborators ?? [];
    return colabs.some(c => c.id === this.currentUserId);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.currentUserId = this.auth.getUser()?.id ?? null;
    this.socket.connect(this.auth.getToken() ?? undefined);
    this.loadSessions();
    this.listenSocketEvents();
  }

  ngOnDestroy(): void {
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Socket events ─────────────────────────────────────────────────────────
  private listenSocketEvents(): void {

    // ✅ Unión exitosa → el backend ya añadió al asesor como colaborador
    //    Actualizamos la sesión local y redirigimos al panel de chats
    this.socket.on<{ sessionId: string; clientName: string }>('joined_chat_ok')
    .pipe(takeUntil(this.destroy$))
    .subscribe((data) => {
        this.takeoverLoading = false;

        // Marcar la sesión en la lista local para reflejar que ya estoy dentro
        const idx = this.sessions.findIndex(s => s.id === data.sessionId);
        if (idx !== -1 && this.currentUserId) {
          const colabs: { id: string }[] = (this.sessions[idx] as any).collaborators ?? [];
          if (!colabs.some(c => c.id === this.currentUserId)) {
            (this.sessions[idx] as any).collaborators = [
              ...colabs,
              { id: this.currentUserId },
            ];
          }
          // Refrescar activeSession también
          if (this.activeSession?.id === data.sessionId) {
            this.activeSession = { ...this.sessions[idx] };
          }
        }

        this.showFeedback('ok', 'Chat tomado. Redirigiendo...');
        this.cdr.detectChanges();

        // Pequeño delay para que el asesor vea el feedback antes de navegar
        setTimeout(() => this.router.navigate(['/dashboard/chats'], {
        queryParams: { openSession: data.sessionId }
      }), 900);
      });

    // ❌ Error al unirse
    this.socket.on<{ reason: string }>('join_chat_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.takeoverLoading = false;
        this.showFeedback('error', data.reason ?? 'No se pudo tomar el chat');
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string; clientName: string }>('session_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!this.takeoverLoading) return;
        this.takeoverLoading = false;
        this.showFeedback('ok', 'Chat tomado. Redirigiendo...');
        this.loadSessions();
        setTimeout(() => this.router.navigate(['/dashboard/chats'], {
          queryParams: { openSession: data.sessionId },
        }), 700);
      });

    this.socket.on<{ reason: string }>('takeover_error')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.takeoverLoading = false;
        this.showFeedback('error', data.reason ?? 'No se pudo tomar el chat');
        this.cdr.detectChanges();
      });

    // Mensaje en tiempo real
    this.socket.on<any>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        const sessionId = msg.session?.id ?? msg.sessionId;
        if (!sessionId) return;
        if (this.activeSession && sessionId === this.activeSession.id) {
          if (!this.timeline.some(t => t.kind === 'message' && t.id === msg.id)) {
            this.timeline = [...this.timeline, { kind: 'message' as const, ...msg }];
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        }
      });

    // Eventos de sesión en vivo (solicitud de asesor, clic en FAQ, ...)
    this.socket.on<any>('session_event')
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => {
        const sessionId = evt?.sessionId ?? evt?.session_id;
        if (!sessionId || !evt?.id) return;
        if (this.activeSession && sessionId === this.activeSession.id) {
          if (!this.timeline.some(t => t.kind === 'evento' && t.id === evt.id)) {
            this.timeline = [...this.timeline, {
              kind: 'evento' as const,
              id: evt.id,
              tipo: evt.tipo,
              detalle: evt.detalle ?? null,
              createdAt: evt.createdAt ?? new Date().toISOString(),
            }];
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        }
      });

    // Actualización en tiempo real si una sesión cambia de estado
    this.socket.on<{ sessionId: string }>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSessions();
        this.cdr.detectChanges();
      });

    this.socket.on<{ sessionId: string }>('session_closed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.sessions = this.sessions.map(s =>
          s.id === data.sessionId ? { ...s, status: 'closed' } : s
        );
        if (this.activeSession?.id === data.sessionId) {
          this.activeSession = { ...this.activeSession, status: 'closed' };
          sessionStorage.removeItem(this.STORAGE_KEY);
        }
        this.cdr.detectChanges();
      });
  }

  // ── Takeover ──────────────────────────────────────────────────────────────
  takeOver(): void {
    if (!this.activeSession || this.takeoverLoading || !this.canTakeOver) return;
    this.takeoverLoading  = true;
    this.takeoverFeedback = null;
    this.cdr.detectChanges();
    this.socket.emit('takeover_session', this.activeSession.id);
  }

  // ── Sesiones ──────────────────────────────────────────────────────────────
  loadSessions(): void {
    this.sessionService.findAllAdmin().subscribe({
      next: (s) => {
        this.sessions = s;
        this.buildFilterOptions();
        this.restoreActiveSession();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  buildFilterOptions(): void {
    const unique = (arr: (string | undefined | null)[]) =>
      [...new Set(arr.filter((v): v is string => !!v))].sort();

    this.colegios   = unique(this.sessions.map(s => s.colegio));
    this.roles      = unique(this.sessions.map(s => s.rol));
    this.solicitudes = unique(this.sessions.map(s => s.tipoSolicitud));
    this.asesores   = unique(this.sessions.map(s => s.advisor?.name));
  }

  clearFilters(): void {
    this.search = '';
    this.filter = 'all';
    this.filterColegio = '';
    this.filterRol = '';
    this.filterSolicitud = '';
    this.filterIdentificacion = '';
    this.filterAsesor = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
  }

  get hasActiveFilters(): boolean {
    return !!(this.search || this.filter !== 'all' || this.filterColegio ||
      this.filterRol || this.filterSolicitud || this.filterIdentificacion || this.filterAsesor ||
      this.filterDateFrom || this.filterDateTo);
  }

  selectSession(session: Session): void {
    sessionStorage.setItem(this.STORAGE_KEY, session.id);
    this.activeSession    = session;
    this.timeline         = [];
    this.nextBefore       = null;
    this.hasMoreHistorial = false;
    this.loading          = true;
    this.takeoverFeedback = null;
    this.mobileView       = 'chat';
    this.activeTab        = 'conversation';

    this.socket.emit('join_session', { sessionId: session.id });

    this.sessionService.getTimeline(session.id, null, 50).subscribe({
      next: (resp) => {
        this.timeline         = resp.items ?? [];
        this.nextBefore       = resp.nextBefore ?? null;
        this.hasMoreHistorial = !!resp.hasMore;
        this.loading  = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  /** Vuelve a la lista de sesiones (oculta el chat). */
  backToList(): void {
    if (this.activeSession) {
      this.socket.emit('set_active', { sessionId: this.activeSession.id, active: false });
    }
    this.activeSession = null;
    sessionStorage.removeItem(this.STORAGE_KEY);
    this.mobileView = 'list';
    this.cdr.detectChanges();
  }

  /** Carga el bloque anterior del historial conservando la posición de scroll. */
  cargarAnteriores(): void {
    if (!this.activeSession || !this.hasMoreHistorial || this.loadingMore || !this.nextBefore) return;
    this.loadingMore = true;
    this.cdr.detectChanges();

    const container = this.messagesContainer?.nativeElement as HTMLElement | undefined;
    const prevHeight = container?.scrollHeight ?? 0;

    this.sessionService
      .getTimeline(this.activeSession.id, this.nextBefore, 50)
      .subscribe({
        next: (resp) => {
          const viejos = resp.items ?? [];
          this.timeline = [...viejos, ...this.timeline];
          this.nextBefore = resp.nextBefore ?? null;
          this.hasMoreHistorial = !!resp.hasMore;
          this.loadingMore = false;
          this.cdr.detectChanges();
          if (container) {
            container.scrollTop = container.scrollHeight - prevHeight;
          }
        },
        error: () => { this.loadingMore = false; this.cdr.detectChanges(); },
      });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      waiting: 'Esperando', active: 'Activo', closed: 'Cerrado', ai: 'IA',
    };
    return map[status] ?? status;
  }

  private restoreActiveSession(): void {
    const savedId = sessionStorage.getItem(this.STORAGE_KEY);
    if (!savedId || this.activeSession) return;
    const session = this.sessions.find(s => s.id === savedId);
    if (session) {
      this.selectSession(session);
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        scrollToBottom(this.messagesContainer.nativeElement);
      }
    }, 50);
  }

  openImagePreview(src: string, name: string): void {
    this.imagePreview = { src, name };
  }

  closeImagePreview(): void {
    this.imagePreview = null;
  }

  private showFeedback(type: 'ok' | 'error', text: string): void {
    this.takeoverFeedback = { type, text };
    setTimeout(() => {
      this.takeoverFeedback = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  switchTab(tab: 'conversation' | 'info' | 'attachments'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showKebab) {
      this.showKebab = false;
      this.cdr.detectChanges();
    }
  }
}
