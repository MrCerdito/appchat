import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

export interface WidgetConfig {
  // ── Botón flotante
  color             : string;
  posicion          : 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  forma             : 'circle' | 'rounded';
  tamano            : 'sm' | 'md' | 'lg';
  icono             : 'chat' | 'help' | 'support';
  textoBoton        : string;
  mostrarTexto      : boolean;
  // ── Comportamiento
  abrirAutomatico   : boolean;
  delayAutoAbrir    : number;
  mensajeBurbuja    : string;
  mostrarBurbuja    : boolean;
  // ── Textos del panel
  tituloPanelChat   : string;
  subtituloPanelChat: string;
  chatUrl           : string;
  // ── Diseño del chat cliente
  chatHeaderColor   : string;
  chatBgColor       : string;
  chatBubbleColor   : string;
  chatBubbleUserColor: string;
  chatMarca         : string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  color              : '#2563eb',
  posicion           : 'bottom-right',
  forma              : 'circle',
  tamano             : 'md',
  icono              : 'chat',
  textoBoton         : '',
  mostrarTexto       : false,
  abrirAutomatico    : false,
  delayAutoAbrir     : 5,
  mensajeBurbuja     : '¿Necesitas ayuda? ¡Chatea con nosotros!',
  mostrarBurbuja     : true,
  tituloPanelChat    : 'Soporte en línea',
  subtituloPanelChat : 'Estamos aquí para ayudarte',
  chatUrl            : 'https://ia.innovacloud.co',
  chatHeaderColor    : '#1a1a1a',
  chatBgColor        : '#f0ede9',
  chatBubbleColor    : '#ffffff',
  chatBubbleUserColor: '#1a1a1a',
  chatMarca          : 'Soporte en línea',
};

@Component({
  selector   : 'app-widget',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './widget.html',
  styleUrl   : './widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  config   : WidgetConfig = { ...DEFAULT_CONFIG };
  srcUrl   = '';
  saved    = false;
  saving   = false;
  loading  = true;
  copiado  = false;
  activeTab: 'apariencia' | 'comportamiento' | 'chat' | 'integracion' = 'apariencia';

  private savedTimer  : ReturnType<typeof setTimeout> | null = null;
  private copiadoTimer: ReturnType<typeof setTimeout> | null = null;

  readonly posiciones: { value: WidgetConfig['posicion']; label: string }[] = [
    { value: 'bottom-right', label: 'Abajo derecha'    },
    { value: 'bottom-left',  label: 'Abajo izquierda'  },
    { value: 'top-right',    label: 'Arriba derecha'   },
    { value: 'top-left',     label: 'Arriba izquierda' },
  ];

  readonly formas: { value: WidgetConfig['forma']; label: string }[] = [
    { value: 'circle',  label: 'Circular'   },
    { value: 'rounded', label: 'Redondeado' },
  ];

  readonly tamanos: { value: WidgetConfig['tamano']; label: string }[] = [
    { value: 'sm', label: 'Pequeño' },
    { value: 'md', label: 'Mediano' },
    { value: 'lg', label: 'Grande'  },
  ];

  readonly iconos: { value: WidgetConfig['icono']; label: string }[] = [
    { value: 'chat',    label: 'Chat'    },
    { value: 'help',    label: 'Ayuda'   },
    { value: 'support', label: 'Soporte' },
  ];

  readonly coloresPredefinidos = [
    '#2563eb', '#16a34a', '#dc2626', '#9333ea',
    '#ea580c', '#0891b2', '#111111', '#be185d',
  ];

  // Paleta para colores del chat — más neutros/profesionales
  readonly chatColores = [
    '#1a1a1a', '#2563eb', '#16a34a', '#7c3aed',
    '#0891b2', '#dc2626', '#ea580c', '#6b7280',
  ];

  readonly chatFondos = [
    '#f0ede9', '#f8fafc', '#f0f4ff', '#f0fdf4',
    '#faf5ff', '#fff7ed', '#f9fafb', '#1a1a2e',
  ];

  readonly chatBurbujas = [
    '#ffffff', '#f8fafc', '#eff6ff', '#f0fdf4',
    '#faf5ff', '#fff7ed', '#1a1a1a', '#1e293b',
  ];

  private readonly apiUrl = `${environment.apiUrl}/widget-config`;

  constructor(
    private http: HttpClient,
    private notification: NotificationService,
    private cdr : ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void {
    if (this.savedTimer)   clearTimeout(this.savedTimer);
    if (this.copiadoTimer) clearTimeout(this.copiadoTimer);
  }

  cargar(): void {
    this.loading = true;
    this.http.get<any>(this.apiUrl).subscribe({
      next : (res) => { this.config = this.mapConfig(res); this.srcUrl = this.config.chatUrl ? `${this.config.chatUrl}/widget.js` : ''; this.loading = false; this.cdr.detectChanges(); },
      error: ()    => { this.config = { ...DEFAULT_CONFIG }; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  errorMsg = '';

  guardar(): void {
    this.saving = true;
    this.errorMsg = '';
    const payload = { ...this.config };
    if (payload.chatUrl === '/') payload.chatUrl = DEFAULT_CONFIG.chatUrl;
    this.http.post<WidgetConfig>(this.apiUrl, payload).subscribe({
      next: () => {
        this.saving = false; this.saved = true;
        this.notification.success('Widget guardado', 'La configuración del widget se actualizó correctamente.');
        this.savedTimer = setTimeout(() => { this.saved = false; this.cdr.detectChanges(); }, 3000);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.errorMsg = err.error?.message?.[0] || err.error?.message || 'Error al guardar. Revisa los campos.';
        this.notification.error('Error al guardar', this.errorMsg);
        this.cdr.detectChanges();
      },
    });
  }

  resetear(): void {
    this.http.delete<WidgetConfig>(this.apiUrl).subscribe({
      next : () => { this.config = { ...DEFAULT_CONFIG }; this.cdr.detectChanges(); },
      error: () => { this.config = { ...DEFAULT_CONFIG }; this.cdr.detectChanges(); },
    });
  }

  abrirPreview(): void {
    const base = window.location.pathname.replace(/\/admin\/widget.*$/, '');
    const file = window.location.hostname !== 'localhost'
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
      this.copiadoTimer = setTimeout(() => { this.copiado = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    });
  }

  onSrcInput(url: string): void {
    this.srcUrl = url.trim();
    try {
      const u = new URL(this.srcUrl);
      const path = u.pathname;
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash > 0 ? path.substring(0, lastSlash) : '';
      this.config.chatUrl = (u.origin + dir).replace(/\/+$/, '');
    } catch (_) {}
    this.cdr.detectChanges();
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  get scriptIntegracion(): string {
    const url = this.srcUrl || `${this.config.chatUrl}/widget.js`;
    return `<!-- Widget de Chat -->\n<script src="${url}" defer><\/script>`;
  }

  get previewSize(): number {
    return { sm: 44, md: 56, lg: 68 }[this.config.tamano] ?? 56;
  }

  get previewRadius(): string {
    if (this.config.forma === 'circle') return '50%';
    return { sm: '12px', md: '16px', lg: '20px' }[this.config.tamano] ?? '16px';
  }

  // Color de texto contrastante (blanco o negro) para un fondo dado
  contrastColor(hex: string): string {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#111111' : '#ffffff';
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private mapConfig(res: any): WidgetConfig {
    return {
      color              : res.color              ?? DEFAULT_CONFIG.color,
      posicion           : res.posicion           ?? DEFAULT_CONFIG.posicion,
      forma              : res.forma              ?? DEFAULT_CONFIG.forma,
      tamano             : res.tamano             ?? DEFAULT_CONFIG.tamano,
      icono              : res.icono              ?? DEFAULT_CONFIG.icono,
      textoBoton         : res.textoBoton         ?? DEFAULT_CONFIG.textoBoton,
      mostrarTexto       : res.mostrarTexto       ?? DEFAULT_CONFIG.mostrarTexto,
      abrirAutomatico    : res.abrirAutomatico    ?? DEFAULT_CONFIG.abrirAutomatico,
      delayAutoAbrir     : res.delayAutoAbrir     ?? DEFAULT_CONFIG.delayAutoAbrir,
      mensajeBurbuja     : res.mensajeBurbuja     ?? DEFAULT_CONFIG.mensajeBurbuja,
      mostrarBurbuja     : res.mostrarBurbuja     ?? DEFAULT_CONFIG.mostrarBurbuja,
      tituloPanelChat    : res.tituloPanelChat    ?? DEFAULT_CONFIG.tituloPanelChat,
      subtituloPanelChat : res.subtituloPanelChat ?? DEFAULT_CONFIG.subtituloPanelChat,
      chatUrl            : res.chatUrl            ?? DEFAULT_CONFIG.chatUrl,
      chatHeaderColor    : res.chatHeaderColor    ?? DEFAULT_CONFIG.chatHeaderColor,
      chatBgColor        : res.chatBgColor        ?? DEFAULT_CONFIG.chatBgColor,
      chatBubbleColor    : res.chatBubbleColor    ?? DEFAULT_CONFIG.chatBubbleColor,
      chatBubbleUserColor: res.chatBubbleUserColor ?? DEFAULT_CONFIG.chatBubbleUserColor,
      chatMarca          : res.chatMarca          ?? DEFAULT_CONFIG.chatMarca,
    };
  }
}