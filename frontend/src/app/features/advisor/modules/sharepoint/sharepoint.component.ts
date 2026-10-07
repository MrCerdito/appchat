import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  HostBinding,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  SharepointService,
  ItemSharepoint,
  ListadoSharepoint,
  SesionSharepoint,
} from '../../../../core/services/sharepoint.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { trackById } from '../../../../shared/utils/track-by';
import { fmtDateTime } from '../../../../shared/utils/date';

const PREVIEW_IMAGEN = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const PREVIEW_PDF    = ['pdf'];

type Pestana = 'todos' | 'carpetas' | 'documentos';
type CampoOrden = 'nombre' | 'fecha' | 'tamano';
type Vista = 'lista' | 'cuadricula';

interface Nivel {
  id    : string | null;
  nombre: string;
}

@Component({
  selector: 'app-sharepoint',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sharepoint.component.html',
  styleUrl: './sharepoint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharePointComponent implements OnInit, OnDestroy {
  protected readonly trackById = trackById;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly skeleton = [1, 2, 3, 4, 5, 6, 7, 8];

  sesion       : SesionSharepoint | null = null;
  items        : ItemSharepoint[] = [];
  pila         : Nivel[] = [{ id: null, nombre: 'Documentos compartidos' }];
  busqueda     = '';

  readonly pestanas: { codigo: Pestana; label: string }[] = [
    { codigo: 'todos',      label: 'Todos' },
    { codigo: 'carpetas',   label: 'Carpetas' },
    { codigo: 'documentos', label: 'Documentos' },
  ];

  readonly pestanaLabel: Record<Pestana, string> = {
    todos: 'Todos', carpetas: 'Carpetas', documentos: 'Documentos',
  };

  pestana : Pestana = 'todos';
  vista   : Vista   = 'lista';
  orden   : CampoOrden = 'fecha';
  asc     = false;

  /** Paginador: 20 elementos por página (siempre sobre el listado filtrado). */
  readonly porPagina = 20;
  pagina = 1;

  seleccion    = new Set<string>();
  menuFila     : string | null = null;
  menuNuevo    = false;
  menuMas      = false;
  menuSel      = false;

  loading      = true;
  cargando     = false;
  error        = '';
  descargando  : string | null = null;

  previewUrl   : string | null = null;
  previewSrc   : SafeResourceUrl | null = null;
  previewEsPdf = false;
  previewAbierto = false;
  previewNombre  = '';
  previewCargando = false;
  previewItem   : ItemSharepoint | null = null;

  @HostBinding('class.theme-dark') protected themeDark = false;

  private readonly busqueda$ = new Subject<string>();
  private readonly destroy$  = new Subject<void>();
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly calentadas = new Set<string>();

  constructor(
    private svc   : SharepointService,
    private notif : NotificationService,
    private sanitizer: DomSanitizer,
    private cdr   : ChangeDetectorRef,
    private themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    this.themeDark = this.themeService.currentTheme === 'dark';
    this.themeService.currentTheme$.pipe(takeUntil(this.destroy$)).subscribe((t) => {
      this.themeDark = t === 'dark';
      this.cdr.markForCheck();
    });

    this.svc.info().pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => {
        this.sesion = s;
        this.pila = [{ id: null, nombre: s.bibliotecaNombre || 'Documentos compartidos' }];
        this.cdr.detectChanges();
      },
      error: (err) => { this.error = this.mensajeError(err); this.cdr.detectChanges(); },
    });

    this.busqueda$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.cargar(q));

    this.cargar();
  }

  ngOnDestroy(): void {
    this.cancelarPrefetch();
    this.destroy$.next();
    this.destroy$.complete();
    this.liberarPreview();
  }

  /**
   * Al mantener el cursor sobre una carpeta se pide su contenido en segundo
   * plano: al hacer clic el backend ya la tiene cacheada (60 s) y entra ya.
   */
  prefetch(item: ItemSharepoint): void {
    if (item.tipo !== 'carpeta' || this.calentadas.has(item.id)) return;
    this.cancelarPrefetch();
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      if (this.calentadas.has(item.id)) return;
      this.calentadas.add(item.id);
      this.svc.listar(item.id, undefined, item.nombre).pipe(takeUntil(this.destroy$)).subscribe({
        error: () => this.calentadas.delete(item.id),
      });
    }, 250);
  }

  cancelarPrefetch(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const destino = ev.target as HTMLElement | null;
    if (destino?.closest('.js-menu')) return;   // el menú se cierra solo
    if (this.menuFila || this.menuNuevo || this.menuMas || this.menuSel) {
      this.menuFila = null;
      this.menuNuevo = false;
      this.menuMas = false;
      this.menuSel = false;
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.previewAbierto) { this.cerrarPreview(); return; }
    if (this.seleccion.size) { this.limpiarSeleccion(); return; }
    this.cerrarMenus();
  }

  // ── Estado de la vista ─────────────────────────────────────────────────────
  get nivel(): Nivel { return this.pila[this.pila.length - 1]; }

  get enBusqueda(): boolean { return !!this.busqueda.trim(); }

  get itemsVisibles(): ItemSharepoint[] {
    if (this.pestana === 'carpetas')   return this.items.filter((i) => i.tipo === 'carpeta');
    if (this.pestana === 'documentos') return this.items.filter((i) => i.tipo === 'archivo');
    return this.items;
  }

  get conteoPestanas(): Record<Pestana, number> {
    return {
      todos     : this.items.length,
      carpetas  : this.items.filter((i) => i.tipo === 'carpeta').length,
      documentos: this.items.filter((i) => i.tipo === 'archivo').length,
    };
  }

  get itemsOrdenados(): ItemSharepoint[] {
    const dir = this.asc ? 1 : -1;
    return [...this.itemsVisibles].sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'carpeta' ? -1 : 1;
      if (this.orden === 'fecha') {
        const d = (a.modificado ? Date.parse(a.modificado) : 0) -
                  (b.modificado ? Date.parse(b.modificado) : 0);
        if (d) return d * dir;
      }
      if (this.orden === 'tamano') {
        const d = (a.tamano ?? 0) - (b.tamano ?? 0);
        if (d) return d * dir;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true }) * dir;
    });
  }

  get seleccionados(): ItemSharepoint[] {
    return this.items.filter((i) => this.seleccion.has(i.id));
  }

  // ── Paginación (20 por página) ────────────────────────────────────────────
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.itemsOrdenados.length / this.porPagina));
  }

  /** Lo que se pinta: la página actual del listado filtrado y ordenado. */
  get itemsPagina(): ItemSharepoint[] {
    const inicio = (this.pagina - 1) * this.porPagina;
    return this.itemsOrdenados.slice(inicio, inicio + this.porPagina);
  }

  get rangoTexto(): string {
    const total = this.itemsOrdenados.length;
    if (!total) return '';
    const inicio = (this.pagina - 1) * this.porPagina + 1;
    const fin = Math.min(total, this.pagina * this.porPagina);
    return `${inicio}–${fin} de ${total}`;
  }

  /** Números de página a mostrar (máx. 5, siempre centrada en la actual). */
  paginasVisibles(): number[] {
    const total = this.totalPaginas;
    const desde = Math.max(1, Math.min(this.pagina - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, i) => desde + i);
  }

  irAPagina(p: number): void {
    const destino = Math.min(Math.max(1, p), this.totalPaginas);
    if (destino === this.pagina) return;
    this.pagina = destino;
    this.cdr.markForCheck();
  }

  private reiniciarPagina(): void { this.pagina = 1; }

  get todosMarcados(): boolean {
    const pagina = this.itemsPagina;
    return pagina.length > 0 && pagina.every((i) => this.seleccion.has(i.id));
  }

  /** Color de la carpeta (6 tonos suaves, determinista por nombre). */
  colorCarpeta(item: ItemSharepoint): string {
    if (item.tipo !== 'carpeta') return '';
    let h = 0;
    for (let i = 0; i < item.nombre.length; i++) h = (h * 31 + item.nombre.charCodeAt(i)) >>> 0;
    return `fc-${(h % 6) + 1}`;
  }

  // ── Pestañas, orden y vista ────────────────────────────────────────────────
  irAPestana(p: Pestana): void {
    if (this.pestana === p) return;
    this.pestana = p;
    this.seleccion = new Set();
    this.reiniciarPagina();
    this.cdr.detectChanges();
  }

  ordenarPor(campo: CampoOrden): void {
    if (this.orden === campo) { this.asc = !this.asc; }
    else { this.orden = campo; this.asc = campo === 'nombre'; }
    this.reiniciarPagina();
    this.cdr.detectChanges();
  }

  onOrdenChange(): void {
    this.asc = this.orden === 'nombre';
    this.reiniciarPagina();
    this.cdr.detectChanges();
  }

  // ── Búsqueda y navegación ──────────────────────────────────────────────────
  buscar(): void { this.busqueda$.next(this.busqueda.trim()); }

  limpiarBusqueda(): void {
    this.busqueda = '';
    this.busqueda$.next('');
  }

  cargar(q?: string): void {
    const consulta = (q ?? this.busqueda).trim();
    this.cargando = true;
    this.error = '';
    this.cerrarMenus();
    this.reiniciarPagina();
    this.cdr.markForCheck();

    const parentId = consulta ? undefined : (this.nivel.id ?? undefined);
    const nombreCarpeta = consulta ? undefined : this.nivel.nombre;
    this.svc.listar(parentId, consulta || undefined, nombreCarpeta).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: ListadoSharepoint) => {
        this.items = res.items ?? [];
        this.cargando = false;
        this.loading = false;
        this.seleccion = new Set();
        this.liberarPreview();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.items = [];
        this.cargando = false;
        this.loading = false;
        this.error = this.mensajeError(err);
        this.cdr.detectChanges();
      },
    });
  }

  entrar(item: ItemSharepoint): void {
    if (item.tipo !== 'carpeta') { this.marcar(item); return; }
    this.cancelarPrefetch();
    this.cerrarMenus();
    // Si ya estamos dentro, no duplicamos la ruta (protege contra doble evento).
    if (this.nivel.id === item.id) return;
    this.busqueda = '';
    this.pestana = 'todos';
    this.pila = [...this.pila, { id: item.id, nombre: item.nombre }];
    this.cargar('');
    this.cdr.markForCheck();
  }

  /** Clic en el nombre: carpetas se abren, archivos se previsualizan o marcan. */
  abrir(item: ItemSharepoint): void {
    if (item.tipo === 'carpeta') { this.entrar(item); return; }
    if (this.puedePrevisualizar(item)) { this.abrirPreview(item); return; }
    this.marcar(item);
  }

  navegarA(i: number): void {
    if (i === this.pila.length - 1) return;
    this.busqueda = '';
    this.pila = this.pila.slice(0, i + 1);
    this.cargar('');
    this.cdr.markForCheck();
  }

  subir(): void {
    if (this.pila.length <= 1) return;
    this.navegarA(this.pila.length - 2);
  }

  // ── Selección ──────────────────────────────────────────────────────────────
  marcar(item: ItemSharepoint): void {
    const s = new Set(this.seleccion);
    if (s.has(item.id)) s.delete(item.id); else s.add(item.id);
    this.seleccion = s;
    this.cdr.detectChanges();
  }

  /** Marca/desmarca la página actual (el paginador corta a 20). */
  alternarTodos(): void {
    const pagina = this.itemsPagina;
    const todos = pagina.length > 0 && pagina.every((i) => this.seleccion.has(i.id));
    const s = new Set(this.seleccion);
    pagina.forEach((i) => (todos ? s.delete(i.id) : s.add(i.id)));
    this.seleccion = s;
    this.cdr.detectChanges();
  }

  limpiarSeleccion(): void {
    this.seleccion = new Set();
    this.cdr.detectChanges();
  }

  // ── Menús ──────────────────────────────────────────────────────────────────
  alternarMenuFila(id: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuFila = this.menuFila === id ? null : id;
    this.menuNuevo = false;
    this.menuMas = false;
    this.menuSel = false;
    this.cdr.detectChanges();
  }

  alternarMenuNuevo(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuNuevo = !this.menuNuevo;
    this.menuMas = false;
    this.menuSel = false;
    this.menuFila = null;
    this.cdr.detectChanges();
  }

  alternarMenuMas(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuMas = !this.menuMas;
    this.menuNuevo = false;
    this.menuSel = false;
    this.menuFila = null;
    this.cdr.detectChanges();
  }

  alternarMenuSel(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuSel = !this.menuSel;
    this.menuMas = false;
    this.menuNuevo = false;
    this.menuFila = null;
    this.cdr.detectChanges();
  }

  cerrarMenus(): void {
    this.menuFila = null;
    this.menuNuevo = false;
    this.menuMas = false;
    this.menuSel = false;
  }

  // ── Acciones ───────────────────────────────────────────────────────────────
  /** Esta biblioteca se administra desde SharePoint: avisamos en vez de fallar. */
  soloLectura(accion: string): void {
    this.cerrarMenus();
    this.notif.info(
      'Biblioteca de solo lectura',
      `${accion}: los cambios se hacen directamente en SharePoint.`,
    );
  }

  nuevo(): void {
    this.soloLectura('Nuevo elemento');
    this.menuNuevo = false;
  }

  cargarArchivo(): void { this.soloLectura('Cargar archivo'); }

  compartir(item?: ItemSharepoint): void {
    this.cerrarMenus();
    const destino = item?.webUrl ?? this.seleccionados[0]?.webUrl ?? this.sesion?.sitioUrl;
    if (!destino) return;
    window.open(destino, '_blank', 'noopener');
  }

  abrirSitio(): void {
    this.cerrarMenus();
    const url = this.sesion?.sitioUrl;
    if (url) window.open(url, '_blank', 'noopener');
    else this.soloLectura('Abrir el sitio');
  }

  copiarEnlace(item: ItemSharepoint): void {
    this.cerrarMenus();
    const url = item.webUrl ?? this.sesion?.sitioUrl;
    if (!url) return;
    navigator.clipboard?.writeText(url).then(
      () => this.notif.success('Enlace copiado', item.nombre),
      () => this.notif.error('No se pudo copiar', 'El navegador bloqueó el portapapeles.'),
    );
  }

  eliminarSeleccion(): void { this.soloLectura('Eliminar'); }
  moverSeleccion(): void { this.soloLectura('Mover'); }

  // ── Descarga ───────────────────────────────────────────────────────────────
  descargar(item?: ItemSharepoint | null): void {
    this.cerrarMenus();
    const archivo = item ?? this.seleccionados[0];
    if (!archivo) return;
    if (archivo.tipo === 'carpeta') { this.soloLectura('Descargar una carpeta'); return; }
    this.descargarItem(archivo, true);
  }

  descargarSeleccion(): void {
    const archivos = this.seleccionados.filter((i) => i.tipo === 'archivo');
    if (!archivos.length) {
      this.notif.info('Nada que descargar', 'Selecciona al menos un archivo.');
      return;
    }
    let i = 0;
    const siguiente = (): void => {
      if (i >= archivos.length) {
        this.notif.success('Descarga finalizada', `${archivos.length} archivo(s).`);
        return;
      }
      this.descargarItem(archivos[i++], false, siguiente);
    };
    siguiente();
  }

  private descargarItem(item: ItemSharepoint, avisar: boolean, alTerminar?: () => void): void {
    if (this.descargando) { alTerminar?.(); return; }
    this.descargando = item.id;
    if (avisar) this.notif.info('Descargando…', item.nombre);
    this.cdr.detectChanges();

    this.svc.descargar(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.descargando = null;
        if (avisar) this.notif.success('Descarga iniciada', item.nombre);
        this.cdr.detectChanges();
        alTerminar?.();
      },
      error: (err) => {
        this.descargando = null;
        if (avisar) this.notif.error('No se pudo descargar', this.mensajeError(err));
        this.cdr.detectChanges();
        alTerminar?.();
      },
    });
  }

  // ── Vista previa (modal) ───────────────────────────────────────────────────
  puedePrevisualizar(item?: ItemSharepoint | null): boolean {
    const ext = (item ?? this.previewItem)?.extension;
    if (!ext) return false;
    return PREVIEW_IMAGEN.includes(ext) || PREVIEW_PDF.includes(ext);
  }

  abrirPreview(item: ItemSharepoint): void {
    this.cerrarMenus();
    if (!this.puedePrevisualizar(item)) return;

    this.previewCargando = true;
    this.previewNombre = item.nombre;
    this.previewItem = item;
    this.previewAbierto = true;
    this.cdr.detectChanges();

    this.svc.descargar(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        this.liberarPreview();
        this.previewUrl  = URL.createObjectURL(blob);
        this.previewSrc  = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl);
        this.previewEsPdf = item.extension === 'pdf';
        this.previewCargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.previewCargando = false;
        this.previewAbierto = false;
        this.previewItem = null;
        this.notif.error('No se pudo abrir', this.mensajeError(err));
        this.cdr.detectChanges();
      },
    });
  }

  cerrarPreview(): void {
    this.previewAbierto = false;
    this.previewItem = null;
    this.liberarPreview();
    this.cdr.detectChanges();
  }

  private liberarPreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.previewSrc = null;
    this.previewEsPdf = false;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  esImagen(item: ItemSharepoint): boolean {
    return !!item.extension && PREVIEW_IMAGEN.includes(item.extension);
  }

  claseIcono(item: ItemSharepoint): string {
    if (item.tipo === 'carpeta') return 'ico-carpeta';
    const ext = item.extension ?? '';
    if (PREVIEW_IMAGEN.includes(ext)) return 'ico-img';
    if (ext === 'pdf') return 'ico-pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'ico-sheet';
    if (['docx', 'doc', 'rtf', 'txt'].includes(ext)) return 'ico-doc';
    if (['pptx', 'ppt'].includes(ext)) return 'ico-slide';
    if (['zip', 'rar', '7z'].includes(ext)) return 'ico-zip';
    return 'ico-file';
  }

  tipoLabel(item: ItemSharepoint): string {
    if (item.tipo === 'carpeta') return 'Carpeta';
    return item.extension ? item.extension.toUpperCase() : 'Archivo';
  }

  formato(tamano?: number): string {
    if (tamano === undefined || tamano === null || isNaN(tamano)) return '';
    if (tamano < 1024) return `${tamano} B`;
    const unidades = ['KB', 'MB', 'GB'];
    let v = tamano / 1024;
    let i = 0;
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${unidades[i]}`;
  }

  /** Segunda línea de la columna Nombre: tipo · tamaño. */
  meta(item: ItemSharepoint): string {
    const t = this.tipoLabel(item);
    const s = this.formato(item.tamano);
    return s ? `${t} · ${s}` : t;
  }

  carpeta(item: ItemSharepoint): string | null {
    return item.parentNombre ?? null;
  }

  mensajeError(err: any): string {
    const msg = err?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string' && msg) return msg;
    if (err?.status === 0) return 'No hay conexión con el servidor.';
    return 'No se pudo leer SharePoint. Intenta de nuevo.';
  }
}
