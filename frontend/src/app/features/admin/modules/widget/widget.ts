import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex } from '../../../../shared/utils/track-by';

export interface WidgetConfig {
  // ── Botón flotante
  color: string;
  posicion: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  forma: 'circle' | 'rounded';
  tamano: 'sm' | 'md' | 'lg';
  icono: 'chat' | 'help' | 'support';
  textoBoton: string;
  mostrarTexto: boolean;
  // ── Comportamiento
  abrirAutomatico: boolean;
  delayAutoAbrir: number;
  mensajeBurbuja: string;
  mostrarBurbuja: boolean;
  // ── Textos del panel
  tituloPanelChat: string;
  subtituloPanelChat: string;
  chatUrl: string;
  // ── Diseño del chat cliente
  chatHeaderColor: string;
  chatBgColor: string;
  chatBubbleColor: string;
  chatBubbleUserColor: string;
  chatMarca: string;
  burbujaImagen: string;
}

export type SeccionId =
  'apariencia' | 'identidad' | 'mensajes' | 'chat' | 'comportamiento' | 'instalacion' | 'avanzado';

type Modo = 'basico' | 'avanzado';
type Device = 'desktop' | 'mobile';

interface EstiloPredefinido {
  id: string;
  nombre: string;
  color: string;
  chatHeaderColor: string;
  chatBgColor: string;
  chatBubbleColor: string;
  chatBubbleUserColor: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  color: '#2563eb',
  posicion: 'bottom-right',
  forma: 'circle',
  tamano: 'md',
  icono: 'chat',
  textoBoton: '',
  mostrarTexto: false,
  abrirAutomatico: false,
  delayAutoAbrir: 5,
  mensajeBurbuja: '¿Necesitas ayuda? ¡Chatea con nosotros!',
  mostrarBurbuja: true,
  tituloPanelChat: 'Soporte en línea',
  subtituloPanelChat: 'Estamos aquí para ayudarte',
  chatUrl: 'https://innoovacloud.com/korvix',
  chatHeaderColor: '#1a1a1a',
  chatBgColor: '#f0ede9',
  chatBubbleColor: '#ffffff',
  chatBubbleUserColor: '#1a1a1a',
  chatMarca: 'Soporte en línea',
  burbujaImagen: '',
};

@Component({
  selector: 'app-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './widget.html',
  styleUrl: './widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;

  config: WidgetConfig = { ...DEFAULT_CONFIG };
  saved = false;
  saving = false;
  loading = true;
  copiado = false;
  errorMsg = '';

  // ── Estado del constructor visual ──
  seccion: SeccionId = 'apariencia';
  modo: Modo = 'basico';
  device: Device = 'desktop';
  previewOpen = false;

  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  private copiadoTimer: ReturnType<typeof setTimeout> | null = null;

  readonly secciones: { id: SeccionId; label: string; basico: boolean }[] = [
    { id: 'apariencia', label: 'Apariencia', basico: true },
    { id: 'identidad', label: 'Identidad', basico: true },
    { id: 'mensajes', label: 'Mensajes', basico: true },
    { id: 'chat', label: 'Chat', basico: false },
    { id: 'comportamiento', label: 'Comportamiento', basico: true },
    { id: 'instalacion', label: 'Instalación', basico: true },
    { id: 'avanzado', label: 'Avanzado', basico: false },
  ];

  readonly seccionInfo: Record<SeccionId, { titulo: string; desc: string }> = {
    apariencia: {
      titulo: 'Apariencia',
      desc: 'Dale el estilo que quieras al botón flotante de tu sitio.',
    },
    identidad: {
      titulo: 'Identidad',
      desc: 'Los textos y el logo que verá el visitante dentro del chat.',
    },
    mensajes: { titulo: 'Mensajes', desc: 'El mensaje de bienvenida que invita a conversar.' },
    chat: { titulo: 'Chat', desc: 'Los colores del panel una vez que el chat está abierto.' },
    comportamiento: {
      titulo: 'Comportamiento',
      desc: 'Cómo y cuándo se abre el widget en tu sitio.',
    },
    instalacion: {
      titulo: 'Instalación',
      desc: 'El último paso: copia el código e instálalo en tu web.',
    },
    avanzado: { titulo: 'Avanzado', desc: 'Ajustes técnicos para casos específicos.' },
  };

  readonly consejos: Record<SeccionId, { titulo: string; texto: string }> = {
    apariencia: {
      titulo: 'Haz que destaque',
      texto:
        'Usa un color que contraste con el fondo de tu sitio para que el botón se note a primera vista.',
    },
    identidad: {
      titulo: 'Tu marca primero',
      texto:
        'Pon el nombre de tu institución o marca: genera confianza antes de que el visitante escriba.',
    },
    mensajes: {
      titulo: 'Invita a conversar',
      texto:
        'Un mensaje corto y amable aumenta las probabilidades de que el visitante inicie un chat.',
    },
    chat: {
      titulo: 'Coherencia visual',
      texto:
        'Mantén los colores del chat cerca de la paleta de tu sitio para que se sienta parte de la página.',
    },
    comportamiento: {
      titulo: 'Sé moderado',
      texto:
        'La apertura automática llama la atención, pero úsala con un retraso razonable para no molestar.',
    },
    instalacion: {
      titulo: 'Pega y listo',
      texto:
        'Copia el código e insértalo justo antes de cerrar <body> en tu sitio web. No requiere nada más.',
    },
    avanzado: {
      titulo: 'Solo si es necesario',
      texto: 'La URL del sistema solo cambia si mueves el widget a otro dominio o servidor.',
    },
  };

  readonly estilos: EstiloPredefinido[] = [
    {
      id: 'profesional',
      nombre: 'Profesional',
      color: '#2563eb',
      chatHeaderColor: '#1a1a1a',
      chatBgColor: '#f0ede9',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#1a1a1a',
    },
    {
      id: 'fresh',
      nombre: 'Fresh',
      color: '#16a34a',
      chatHeaderColor: '#15803d',
      chatBgColor: '#f0fdf4',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#16a34a',
    },
    {
      id: 'elegante',
      nombre: 'Elegante',
      color: '#0f172a',
      chatHeaderColor: '#0f172a',
      chatBgColor: '#f8fafc',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#0f172a',
    },
    {
      id: 'moderno',
      nombre: 'Moderno',
      color: '#7c3aed',
      chatHeaderColor: '#6d28d9',
      chatBgColor: '#faf5ff',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#7c3aed',
    },
    {
      id: 'energia',
      nombre: 'Energía',
      color: '#ea580c',
      chatHeaderColor: '#c2410c',
      chatBgColor: '#fff7ed',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#ea580c',
    },
  ];

  readonly posiciones: { value: WidgetConfig['posicion']; label: string }[] = [
    { value: 'bottom-right', label: 'Abajo derecha' },
    { value: 'bottom-left', label: 'Abajo izquierda' },
    { value: 'top-right', label: 'Arriba derecha' },
    { value: 'top-left', label: 'Arriba izquierda' },
  ];

  readonly formas: { value: WidgetConfig['forma']; label: string }[] = [
    { value: 'circle', label: 'Circular' },
    { value: 'rounded', label: 'Redondeado' },
  ];

  readonly tamanos: { value: WidgetConfig['tamano']; label: string }[] = [
    { value: 'sm', label: 'Pequeño' },
    { value: 'md', label: 'Mediano' },
    { value: 'lg', label: 'Grande' },
  ];

  readonly iconos: { value: WidgetConfig['icono']; label: string }[] = [
    { value: 'chat', label: 'Chat' },
    { value: 'help', label: 'Ayuda' },
    { value: 'support', label: 'Soporte' },
  ];

  readonly coloresPredefinidos = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#9333ea',
    '#ea580c',
    '#0891b2',
    '#111111',
    '#be185d',
  ];

  readonly chatColores = [
    '#1a1a1a',
    '#2563eb',
    '#16a34a',
    '#7c3aed',
    '#0891b2',
    '#dc2626',
    '#ea580c',
    '#6b7280',
  ];

  readonly chatFondos = [
    '#f0ede9',
    '#f8fafc',
    '#f0f4ff',
    '#f0fdf4',
    '#faf5ff',
    '#fff7ed',
    '#f9fafb',
    '#1a1a2e',
  ];

  readonly chatBurbujas = [
    '#ffffff',
    '#f8fafc',
    '#eff6ff',
    '#f0fdf4',
    '#faf5ff',
    '#fff7ed',
    '#1a1a1a',
    '#1e293b',
  ];

  private readonly apiUrl = `${environment.apiUrl}/widget-config`;

  constructor(
    private http: HttpClient,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
    if (this.copiadoTimer) clearTimeout(this.copiadoTimer);
  }

  cargar(): void {
    this.loading = true;
    this.http.get<any>(this.apiUrl).subscribe({
      next: (res) => {
        this.config = this.mapConfig(res);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.config = { ...DEFAULT_CONFIG };
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  guardar(): void {
    this.saving = true;
    this.errorMsg = '';
    const payload = { ...this.config };
    if (payload.chatUrl === '/') payload.chatUrl = DEFAULT_CONFIG.chatUrl;
    this.http.post<WidgetConfig>(this.apiUrl, payload).subscribe({
      next: () => {
        this.saving = false;
        this.saved = true;
        this.notification.success(
          'Widget guardado',
          'La configuración del widget se actualizó correctamente.',
        );
        this.savedTimer = setTimeout(() => {
          this.saved = false;
          this.cdr.detectChanges();
        }, 3000);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.errorMsg =
          err.error?.message?.[0] || err.error?.message || 'Error al guardar. Revisa los campos.';
        this.notification.error('Error al guardar', this.errorMsg);
        this.cdr.detectChanges();
      },
    });
  }

  resetear(): void {
    this.http.delete<WidgetConfig>(this.apiUrl).subscribe({
      next: () => {
        this.config = { ...DEFAULT_CONFIG };
        this.cdr.detectChanges();
      },
      error: () => {
        this.config = { ...DEFAULT_CONFIG };
        this.cdr.detectChanges();
      },
    });
  }

  abrirPreview(): void {
    const base = window.location.pathname.replace(/\/admin\/widget.*$/, '');
    const file =
      window.location.hostname !== 'localhost'
        ? base + '/widget-preview-prod.html'
        : base + '/widget-preview.html';

    const params = new URLSearchParams();
    const keys = Object.keys(DEFAULT_CONFIG) as (keyof WidgetConfig)[];
    for (const k of keys) {
      const v = this.config[k];
      if (v !== DEFAULT_CONFIG[k]) {
        params.set(k, String(v));
      }
    }
    const qs = params.toString();
    const url = window.location.origin + file + (qs ? '?' + qs : '');

    window.open(url, '_blank');
  }

  copiarScript(): void {
    navigator.clipboard.writeText(this.scriptIntegracion).then(() => {
      this.copiado = true;
      this.copiadoTimer = setTimeout(() => {
        this.copiado = false;
        this.cdr.detectChanges();
      }, 2000);
      this.cdr.detectChanges();
    });
  }

  // ── Constructor visual ─────────────────────────────────────────────────────
  cambiarModo(m: Modo): void {
    this.modo = m;
    if (m === 'basico' && !this.seccionVisible(this.seccion)) {
      this.seccion = 'apariencia';
    }
  }

  seccionVisible(id: SeccionId): boolean {
    const s = this.secciones.find((x) => x.id === id);
    return !!s && (this.modo === 'avanzado' || s.basico);
  }

  cambiarDevice(d: Device): void {
    this.device = d;
  }

  togglePreview(): void {
    this.previewOpen = !this.previewOpen;
  }

  aplicarEstilo(e: EstiloPredefinido): void {
    this.config.color = e.color;
    this.config.chatHeaderColor = e.chatHeaderColor;
    this.config.chatBgColor = e.chatBgColor;
    this.config.chatBubbleColor = e.chatBubbleColor;
    this.config.chatBubbleUserColor = e.chatBubbleUserColor;
  }

  get estiloActivo(): string {
    return (
      this.estilos.find(
        (e) => e.color === this.config.color && e.chatHeaderColor === this.config.chatHeaderColor,
      )?.id ?? ''
    );
  }

  // ── Helpers de vista previa ────────────────────────────────────────────────
  get previewSize(): number {
    return { sm: 44, md: 56, lg: 68 }[this.config.tamano] ?? 56;
  }

  get previewRadius(): string {
    if (this.config.forma === 'circle') return '50%';
    return { sm: '12px', md: '16px', lg: '20px' }[this.config.tamano] ?? '16px';
  }

  get btnGap(): number {
    return this.device === 'mobile' ? 10 : 18;
  }

  get chatOffset(): number {
    return this.previewSize + this.btnGap + 6;
  }

  get iconoPreview(): WidgetConfig['icono'] | 'close' {
    return this.previewOpen ? 'close' : this.config.icono;
  }

  isTop(pos: WidgetConfig['posicion']): boolean {
    return pos.startsWith('top');
  }

  contrastColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#111111' : '#ffffff';
  }

  btnWrapStyle(pos: WidgetConfig['posicion']): Record<string, string> {
    const m = this.device === 'mobile' ? 10 : 14;
    if (pos === 'bottom-right') return { bottom: m + 'px', right: m + 'px' };
    if (pos === 'bottom-left') return { bottom: m + 'px', left: m + 'px' };
    if (pos === 'top-right') return { top: m + 'px', right: m + 'px' };
    return { top: m + 'px', left: m + 'px' };
  }

  bubbleStyle(pos: WidgetConfig['posicion']): Record<string, string> {
    const m = this.device === 'mobile' ? 10 : 14;
    const o = this.previewSize + this.btnGap + (this.device === 'mobile' ? 8 : 12);
    const cy = pos.startsWith('top')
      ? `${m + this.previewSize / 2}px`
      : `calc(100% - ${m + this.previewSize / 2}px)`;
    const side: Record<string, string> =
      pos.endsWith('-right') ? { right: o + 'px' } : { left: o + 'px' };
    return { top: cy, transform: 'translateY(-50%)', ...side };
  }

  bubbleArrow(pos: WidgetConfig['posicion']): 'left' | 'right' {
    return pos.endsWith('-right') ? 'right' : 'left';
  }

  chatPanelStyle(pos: WidgetConfig['posicion']): Record<string, string> {
    const o = this.chatOffset;
    const w = this.device === 'mobile' ? 'calc(100% - 20px)' : '86%';
    const h = this.device === 'mobile' ? '78%' : '76%';
    if (pos === 'bottom-right')
      return {
        width: w,
        height: h,
        bottom: o + 'px',
        right: '8px',
        transformOrigin: 'bottom right',
      };
    if (pos === 'bottom-left')
      return { width: w, height: h, bottom: o + 'px', left: '8px', transformOrigin: 'bottom left' };
    if (pos === 'top-right')
      return { width: w, height: h, top: o + 'px', right: '8px', transformOrigin: 'top right' };
    return { width: w, height: h, top: o + 'px', left: '8px', transformOrigin: 'top left' };
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  get scriptIntegracion(): string {
    const url = `${this.config.chatUrl}/widget.js`;
    return `<script src="${url}" defer></script>`;
  }

  // ── Private ────────────────────────────────────────────────────────────────
  private mapConfig(res: any): WidgetConfig {
    return {
      color: res.color ?? DEFAULT_CONFIG.color,
      posicion: res.posicion ?? DEFAULT_CONFIG.posicion,
      forma: res.forma ?? DEFAULT_CONFIG.forma,
      tamano: res.tamano ?? DEFAULT_CONFIG.tamano,
      icono: res.icono ?? DEFAULT_CONFIG.icono,
      textoBoton: res.textoBoton ?? DEFAULT_CONFIG.textoBoton,
      mostrarTexto: res.mostrarTexto ?? DEFAULT_CONFIG.mostrarTexto,
      abrirAutomatico: res.abrirAutomatico ?? DEFAULT_CONFIG.abrirAutomatico,
      delayAutoAbrir: res.delayAutoAbrir ?? DEFAULT_CONFIG.delayAutoAbrir,
      mensajeBurbuja: res.mensajeBurbuja ?? DEFAULT_CONFIG.mensajeBurbuja,
      mostrarBurbuja: res.mostrarBurbuja ?? DEFAULT_CONFIG.mostrarBurbuja,
      tituloPanelChat: res.tituloPanelChat ?? DEFAULT_CONFIG.tituloPanelChat,
      subtituloPanelChat: res.subtituloPanelChat ?? DEFAULT_CONFIG.subtituloPanelChat,
      chatUrl: res.chatUrl ?? DEFAULT_CONFIG.chatUrl,
      chatHeaderColor: res.chatHeaderColor ?? DEFAULT_CONFIG.chatHeaderColor,
      chatBgColor: res.chatBgColor ?? DEFAULT_CONFIG.chatBgColor,
      chatBubbleColor: res.chatBubbleColor ?? DEFAULT_CONFIG.chatBubbleColor,
      chatBubbleUserColor: res.chatBubbleUserColor ?? DEFAULT_CONFIG.chatBubbleUserColor,
      chatMarca: res.chatMarca ?? DEFAULT_CONFIG.chatMarca,
      burbujaImagen: res.burbujaImagen ?? DEFAULT_CONFIG.burbujaImagen,
    };
  }
}
