import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AdjuntoCorreo,
  BandejaCorreo,
  CorreosService,
  CuerpoCorreo,
  EstadoCorreos,
  MensajeCorreo,
  CategoriaConTotal,
  PresetFechaCorreo,
  SIN_CATEGORIA,
} from '../../../../core/services/correos.service';
import { LayoutService } from '../../../../core/services/layout.service';
import {
  colorCategoria,
  normalizarCategoria,
  normalizarCategorias,
} from '../../../../shared/utils/categoria-correo.util';
import { SocketService } from '../../../../core/services/socket.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { NotificationRealtimeService } from '../../../../core/services/notification-realtime.service';

const TAMANO_PAGINA = 50;

/** Espera antes de buscar por texto, para no pedir una consulta por tecla. */
const DEMORA_BUSQUEDA_MS = 350;

/**
 * Red de seguridad del socket. El backend avisa por socket, pero si ese evento
 * se pierde (reconexion, proxy) la lista se queda congelada; con este sondeo la
 * lista se corrige sola. Mismo criterio que el polling que ya usan history y
 * whatsapp.
 */
const INTERVALO_SONDEO_MS = 60_000;

/** Evento que emite el gateway de Correos del backend. */
const EVENTO_CORREO_ACTUALIZADO = 'correo:actualizado';

/** Payload del evento `correo:actualizado`. */
interface EventoCorreoActualizado {
  nuevos: number;
  actualizados: number;
  eliminados: number;
  carpeta: string;
  hayNoLeidos: boolean;
}

/**
 * Presets de fecha del lateral, en el orden en que se muestran.
 *
 * Etiquetas cortas a proposito: van tres en una fila y "Ultimos 7 dias" se
 * partia en dos lineas, dejando un boton mas alto que sus vecinos y un hueco
 * raro en el grupo.
 */
const PRESETES: { valor: PresetFechaCorreo; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: '7d', etiqueta: '7 días' },
];

/** Etiqueta que se muestra cuando el correo no tiene ninguna categoria en Outlook. */
const PENDIENTE = 'Pendiente';

@Component({
  selector: 'app-correos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './correos.component.html',
  styleUrl: './correos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CorreosComponent implements OnInit, OnDestroy {
  readonly PENDIENTE = PENDIENTE;

  /** Expuesto al template para elegir el filtro "sin categoría". */
  readonly SIN_CATEGORIA = SIN_CATEGORIA;
  cargando = true;
  cargandoCuerpo = false;
  sincronizando = false;

  // Los errores y estados ya no viven en la pagina: salen como avisos
  // flotantes via NotificationService, para no mover el listado al fallar.

  estado: EstadoCorreos | null = null;
  mensajes: MensajeCorreo[] = [];
  total = 0;
  totalCarpeta = 0;
  noLeidosTotal = 0;
  carpetaNombre = '';
  soloNoLeidos = false;

  offset = 0;
  private hayMas = true;

  /* ── Filtros del lateral ───────────────────────────── */

  /** Texto del buscador. No dispara la consulta: eso lo hace el debounce. */
  textoBusqueda = '';
  /** Categoria elegida. `SIN_CATEGORIA` significa "sin ninguna categoria". */
  categoriaSeleccionada = '';
  /** Preset de fecha activo, o '' si se usa el rango manual. */
  presetFecha: PresetFechaCorreo | '' = '';
  /** Rango manual inclusive, en `YYYY-MM-DD`. */
  desde = '';
  hasta = '';

  /** Categorias reales de la carpeta con su conteo, para pintar el lateral. */
  categoriasDisponibles: CategoriaConTotal[] = [];

  /** En movil el lateral se abre encima de la lista, como en History. */
  filtrosAbiertos = false;

  /** Timer del debounce del buscador. */
  private temporizadorBusqueda: ReturnType<typeof setTimeout> | null = null;

  readonly presets = PRESETES;

  /** El buscador cuenta como filtro activo desde el primer caracter. */
  get hayFiltros(): boolean {
    return (
      !!this.textoBusqueda.trim() ||
      !!this.categoriaSeleccionada ||
      !!this.presetFecha ||
      !!this.desde ||
      !!this.hasta
    );
  }

  get categoriaPendienteSeleccionada(): boolean {
    return this.categoriaSeleccionada === SIN_CATEGORIA;
  }

  /**
   * Texto real del buscador: lo que se aplica al backend. Se compara ya
   * recortado para que un espacio suelto no cuente como filtro.
   */
  get busquedaAplicable(): string {
    return this.textoBusqueda.trim();
  }

  /** El botón "cargar más" solo aparece si el backend devolvió una página llena. */
  get hayMasVisible(): boolean {
    return this.hayMas && this.mensajes.length < this.total;
  }

  seleccionado: MensajeCorreo | null = null;
  cuerpo: CuerpoCorreo | null = null;
  adjuntos: AdjuntoCorreo[] = [];

  /**
   * El cuerpo se pinta en un iframe con sandbox y SIN allow-same-origin: aunque
   * el backend ya sanitiza el HTML, el iframe es la segunda barrera para que un
   * correo malicioso no pueda tocar la sesión del asesor.
   */
  cuerpoIframe: SafeResourceUrl | null = null;

  private subs = new Subscription();

  /** Timer del sondeo de seguridad. */
  private temporizadorSondeo: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly correos: CorreosService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly layout: LayoutService,
    private readonly socket: SocketService,
    private readonly notifs: NotificationService,
    private readonly notificationRealtime: NotificationRealtimeService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // La bandeja ocupa toda la pantalla, igual que history y comunicados: se
    // colapsa la barra de modulos al entrar y se devuelve al salir.
    this.layout.setSidebarForcedCollapsed(true);
    this.cargarEstado();
    this.cargarMensajes(true);
    this.escucharCambios();
    this.sincronizarEnSilencio();
    this.temporizadorSondeo = setInterval(() => {
      this.sincronizarEnSilencio();
    }, INTERVALO_SONDEO_MS);
    this.leerCorreoDeLaUrl();
  }

  ngOnDestroy(): void {
    this.layout.setSidebarForcedCollapsed(false);
    // El debounce puede estar pendiente: si dispara despues de salir, llama a
    // `markForCheck` sobre un componente destruido y Angular avisa por consola.
    this.cancelarBusqueda();
    if (this.temporizadorSondeo !== null) {
      clearInterval(this.temporizadorSondeo);
      this.temporizadorSondeo = null;
    }
    this.subs.unsubscribe();
  }

  /**
   * Abre el correo que trae el enlace de la notificacion (`?correo=<id local>`).
   *
   * El aviso lleva el id del correo nuevo mas reciente, asi que al pinchar la
   * campanita se abre ese y no el primero de la lista. Se escucha tambien en
   * cada cambio de query param para que el enlace funcione aunque la bandeja
   * este ya montada.
   */
  private leerCorreoDeLaUrl(): void {
    this.subs.add(
      this.route.queryParamMap.subscribe((params) => {
        const id = params.get('correo');
        if (!id || id === this.seleccionado?.id) return;
        const yaEstaEnLaLista = this.mensajes.find((m) => m.id === id);
        if (yaEstaEnLaLista) {
          this.abrir(yaEstaEnLaLista);
        } else {
          // Esta en otra pagina de la lista: se pide su cuerpo y se abre igual.
          this.seleccionado = { id } as MensajeCorreo;
          this.cargarCuerpoDe({ id } as MensajeCorreo);
        }
      }),
    );
  }

  /**
   * Escucha el aviso del backend. El socket ya esta abierto por el dashboard del
   * asesor (namespace raiz compartido), asi que aqui solo se escucha.
   */
  private escucharCambios(): void {
    this.subs.add(
      this.socket
        .on<EventoCorreoActualizado>(EVENTO_CORREO_ACTUALIZADO)
        .subscribe((ev) => {
          this.recargarEnSilencio();
          if (ev.nuevos > 0) {
            this.notifs.info(
              ev.nuevos === 1
                ? 'Llego 1 correo nuevo'
                : `Llegaron ${ev.nuevos} correos nuevos`,
            );
          }
        }),
    );
  }

  /**
   * Sincroniza al entrar al modulo para que la lista no se arranque mostrando el
   * espejo viejo. Es silenciosa a proposito: no gira el boton ni muestra el aviso
   * de "buscando", porque el usuario no la pidio.
   */
  private sincronizarEnSilencio(): void {
    this.subs.add(
      this.correos.sincronizar().subscribe({
        next: () => this.recargarEnSilencio(),
        // Fallo silencioso: el sondeo lo reintenta y el error real ya se ve en
        // la carga normal de la lista.
        error: () => undefined,
      }),
    );
  }

  /**
   * Recarga la lista y el estado sin tocar la vista.
   *
   * El lector abierto se reapunta al mensaje del MISMO id en la lista nueva. Sin
   * esto, como el componente es OnPush y `seleccionado` guarda un objeto viejo,
   * el correo que estas leyendo se quedaria mostrando el estado de lectura que
   * tenia al abrirlo, justo lo que se quiere corregir.
   */
  private recargarEnSilencio(): void {
    const idAbierto = this.seleccionado?.id ?? null;

    this.subs.add(
      this.correos.listar(this.consultaActual()).subscribe({
        next: (b) => {
          this.mensajes = b.mensajes;
          this.total = b.total;
          this.totalCarpeta = b.totalCarpeta;
          this.noLeidosTotal = b.noLeidosTotal;
          this.carpetaNombre = b.carpetaNombre;
          this.categoriasDisponibles = b.categoriasDisponibles ?? [];
          this.offset = b.mensajes.length;
          this.hayMas = b.mensajes.length === TAMANO_PAGINA;
          this.cargando = false;

          if (idAbierto) {
            const refreshed = this.mensajes.find((m) => m.id === idAbierto);
            if (refreshed) {
              // Se reapunta al objeto nuevo, pero NO se vuelve a pedir el cuerpo:
              // ya esta en pantalla y recargarlo lo haria parpadear.
              this.seleccionado = refreshed;
            } else if (this.seleccionado) {
              // El correo salio del filtro activo (p. ej. la categoria cambio):
              // se deja el cuerpo visible en vez de dejar el lector en blanco.
              this.seleccionado = { ...this.seleccionado };
            }
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        },
      }),
    );
  }

  /** Parametros de la primera pagina, respetando todos los filtros. */
  private consultaActual(): {
    limite: number;
    offset: number;
    soloNoLeidos: boolean;
    buscar?: string;
    categoria?: string;
    sinCategoria?: boolean;
    preset?: PresetFechaCorreo;
    desde?: string;
    hasta?: string;
  } {
    return {
      limite: TAMANO_PAGINA,
      offset: 0,
      soloNoLeidos: this.soloNoLeidos,
      ...this.filtrosActivos(),
    };
  }

  private cancelarBusqueda(): void {
    if (this.temporizadorBusqueda !== null) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
  }

  /**
   * Filtros apliedos a la consulta. Se centraliza para que la lista y el
   * estado vacio usen exactamente los mismos criterios.
   */
  private filtrosActivos(): {
    buscar?: string;
    categoria?: string;
    sinCategoria?: boolean;
    preset?: PresetFechaCorreo;
    desde?: string;
    hasta?: string;
  } {
    const sinCategoria = this.categoriaSeleccionada === SIN_CATEGORIA;
    return {
      buscar: this.busquedaAplicable || undefined,
      categoria: sinCategoria || !this.categoriaSeleccionada ? undefined : this.categoriaSeleccionada,
      sinCategoria: sinCategoria || undefined,
      preset: this.presetFecha || undefined,
      desde: this.presetFecha ? undefined : this.desde || undefined,
      hasta: this.presetFecha ? undefined : this.hasta || undefined,
    };
  }

  /* ── Acciones del lateral ──────────────────────────── */

  /**
   * Busqueda por texto con rebote: se espera a que el usuario deje de escribir
   * para no disparar una consulta por cada tecla.
   */
  onBuscar(): void {
    this.cancelarBusqueda();
    this.temporizadorBusqueda = setTimeout(() => {
      this.temporizadorBusqueda = null;
      this.cargarMensajes(true);
    }, DEMORA_BUSQUEDA_MS);
  }

  /** El buscador tambien filtra al salir del campo con Enter. */
  buscarInmediato(): void {
    this.cancelarBusqueda();
    this.cargarMensajes(true);
  }

  /** Una categoria real. Volver a pulsarla la desactiva. */
  elegirCategoria(categoria: string): void {
    this.categoriaSeleccionada = this.categoriaSeleccionada === categoria ? '' : categoria;
    this.cargarMensajes(true);
  }

  limpiarCategoria(): void {
    if (!this.categoriaSeleccionada) return;
    this.categoriaSeleccionada = '';
    this.cargarMensajes(true);
  }

  /**
   * Preset de fecha. Es excluyente con el rango manual: al elegir uno se
   * limpian las fechas manuales, y al limpiar el preset el rango vuelve a
   * mandar, igual que en el backend.
   */
  elegirPreset(preset: PresetFechaCorreo): void {
    if (this.presetFecha === preset) {
      this.presetFecha = '';
      this.cargarMensajes(true);
      return;
    }
    this.presetFecha = preset;
    this.desde = '';
    this.hasta = '';
    this.cargarMensajes(true);
  }

  /** Cambio en las fechas manuales: invalidan el preset activo. */
  onCambiarRango(): void {
    if (this.presetFecha) this.presetFecha = '';
    this.cargarMensajes(true);
  }

  /** Vuelve a mostrar la carpeta completa. */
  limpiarFiltros(): void {
    this.textoBusqueda = '';
    this.categoriaSeleccionada = '';
    this.presetFecha = '';
    this.desde = '';
    this.hasta = '';
    this.cancelarBusqueda();
    this.cargarMensajes(true);
  }

  alternarFiltros(): void {
    this.filtrosAbiertos = !this.filtrosAbiertos;
    this.cdr.markForCheck();
  }

  cerrarFiltros(): void {
    if (!this.filtrosAbiertos) return;
    this.filtrosAbiertos = false;
    this.cdr.markForCheck();
  }

  private cargarEstado(): void {
    this.subs.add(
      this.correos.estado().subscribe({
        next: (e) => {
          this.estado = e;
          this.cdr.markForCheck();
        },
        error: () => undefined,
      }),
    );
  }

  private cargarMensajes(reiniciar = false): void {
    if (reiniciar) {
      this.offset = 0;
      this.hayMas = true;
    }
    if (!this.hayMas) return;

    this.cargando = this.offset === 0;

    this.subs.add(
      this.correos
        .listar({
          ...this.consultaActual(),
          offset: this.offset,
        })
        .subscribe({
          next: (b: BandejaCorreo) => {
            this.mensajes = reiniciar ? b.mensajes : [...this.mensajes, ...b.mensajes];
            this.total = b.total;
            this.totalCarpeta = b.totalCarpeta;
            this.noLeidosTotal = b.noLeidosTotal;
            this.carpetaNombre = b.carpetaNombre;
            this.categoriasDisponibles = b.categoriasDisponibles ?? [];
            this.offset += b.mensajes.length;
            this.hayMas = b.mensajes.length === TAMANO_PAGINA;
            this.cargando = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.cargando = false;
            this.avisarError(err);
            this.cdr.markForCheck();
          },
        }),
    );
  }

  /**
   * Traduce el error del backend a algo accionable. El backend ya devuelve
   * mensajes concretos (por ejemplo qué permiso falta en Entra), así que se
   * muestra el del servidor y solo se cae al texto genérico si no viene nada.
   */
  private leerError(err: any): string {
    const mensaje = err?.error?.message;
    if (Array.isArray(mensaje)) return mensaje.join(' ');
    if (typeof mensaje === 'string' && mensaje.trim()) return mensaje;
    return 'Intenta de nuevo en unos segundos.';
  }

  /**
   * Avisa de un fallo con un aviso flotante que trae "Reintentar", y ademas
   * recuerda que carpeta existe en ASIGNADOS: cuando la carpeta del asesor se
   * borro en Outlook, el unico dato util para arreglarlo es esa lista.
   */
  private avisarError(err: any): void {
    const mensaje = this.leerError(err);
    const carpetas = this.estado?.carpetasDisponibles ?? [];
    const detalle =
      carpetas.length > 0
        ? `${mensaje} Carpetas que hay en ${this.estado?.carpetaPadre ?? 'ASIGNADOS'}: ` +
          `${carpetas.join(', ')}.`
        : mensaje;

    this.notifs.conAccion(
      'error',
      'No se pudieron cargar los correos',
      detalle,
      { label: 'Reintentar', onClick: () => this.refrescar() },
    );
  }

  abrir(mensaje: MensajeCorreo): void {
    this.seleccionado = mensaje;
    this.cargarCuerpoDe(mensaje);
  }

  /** Pide el cuerpo y los adjuntos del mensaje ya marcado como seleccionado. */
  private cargarCuerpoDe(mensaje: MensajeCorreo): void {
    this.cuerpo = null;
    this.cuerpoIframe = null;
    this.adjuntos = [];
    this.cargandoCuerpo = true;
    this.cdr.markForCheck();

    this.subs.add(
      this.correos.cuerpo(mensaje.id).subscribe({
        next: (c) => {
          this.cuerpo = c;
          this.subs.add(this.notificationRealtime.markCorreoAbierto(mensaje.id).subscribe({ error: () => undefined }));
          this.cargandoCuerpo = false;
          this.cuerpoIframe = this.sanitizer.bypassSecurityTrustResourceUrl(
            this.envelopeHtml(c.html),
          );
          this.subs.add(this.correos.adjuntos(mensaje.id).subscribe((a) => {
            this.adjuntos = a.filter((x) => !x.isInline);
            this.cdr.markForCheck();
          }));
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.cargandoCuerpo = false;
          this.notifs.error('No se pudo abrir el correo', this.leerError(err));
          this.cdr.markForCheck();
        },
      }),
    );
  }

  /** Envoltura mínima con estilos base: sin scripts, sin origen compartido. */
  private envelopeHtml(html: string): string {
    const estilos =
      "body{margin:0;padding:14px;font-family:inherit;font-size:14px;line-height:1.5;color:#1f2937;word-break:break-word}" +
      "img{max-width:100%;height:auto}table{max-width:100%}" +
      "a{color:#2563eb}";
    const doc =
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline';">` +
      `<style>${estilos}</style></head><body>${html}</body></html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
  }

  descargar(adjunto: AdjuntoCorreo): void {
    if (!this.seleccionado) return;
    const nombre = adjunto.nombre ?? 'adjunto';

    this.subs.add(
      this.correos.descargarAdjunto(this.seleccionado.id, adjunto.graphAttachmentId).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = nombre;
          a.click();
          URL.revokeObjectURL(url);
          this.notifs.success('Adjunto descargado', nombre);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.notifs.error(`No se pudo descargar ${nombre}`, this.leerError(err));
          this.cdr.markForCheck();
        },
      }),
    );
  }

  sincronizar(): void {
    this.sincronizando = true;
    this.cdr.markForCheck();

    this.subs.add(
      // `manual=true`: es el unico sitio con derecho a saltarse el cooldown por
      // 403, porque el asesor acaba de pedirlo y puede que el permiso se acaba
      // de conceder en Entra ID.
      this.correos.sincronizar(true).subscribe({
        next: (r) => {
          this.sincronizando = false;
          if (r.nuevos > 0) {
            this.notifs.success(
              `${r.nuevos} correo(s) nuevo(s)`,
              `Encontrados en ${r.carpetaNombre}.`,
            );
          } else {
            this.notifs.info('No hay correos nuevos', `Nada nuevo en ${r.carpetaNombre}.`);
          }
          this.cargarEstado();
          // El aviso ya sale aqui, en pantalla; el backend no manda notificacion
          // de campana por este sync manual (`notificar=false`), asi que no llega
          // un aviso duplicado ahi donde el usuario esta mirando.
          this.recargarEnSilencio();
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.sincronizando = false;
          this.notifs.error(
            'No se pudieron buscar correos nuevos',
            this.leerError(err),
          );
          this.cdr.markForCheck();
        },
      }),
    );
  }

  alternarNoLeidos(): void {
    this.soloNoLeidos = !this.soloNoLeidos;
    this.cargarMensajes(true);
  }

  /** Apaga el filtro de no leidos. Lo usa el estado vacio para no dejar atascado al asesor. */
  verTodos(): void {
    if (!this.soloNoLeidos) return;
    this.soloNoLeidos = false;
    this.cargarMensajes(true);
  }

  cargarMas(): void {
    this.cargarMensajes();
  }

  refrescar(): void {
    this.cargarEstado();
    this.cargarMensajes(true);
  }

  tamano(bytes: number | null | undefined): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  fecha(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  iniciales(nombre: string | null, email: string | null): string {
    const base = (nombre || email || '?').trim();
    const partes = base.split(/[\s@._-]+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '?') + (partes[1]?.[0] ?? '')).toUpperCase();
  }

/**
 * Categorias de Outlook del correo, ya sin el simbolo decorativo y con el
 * texto normalizado ("✓ RESUELTO" se muestra como "RESUELTO").
 *
 * Cuando el mensaje no tiene ninguna se muestra `Pendiente`: es solo una
 * etiqueta en pantalla, no escribe nada en el buzon.
 */
categorias(m: MensajeCorreo | null): string[] {
  const cats = normalizarCategorias(m?.categorias);
  return cats.length ? cats : [PENDIENTE];
}

/** Color de fondo de una categoria ya normalizada, o null si no tiene asignado. */
color(cat: string): string | null {
  if (cat === PENDIENTE) return null;
  return colorCategoria(cat);
}

/** Texto normalizado de una categoria cruda de Outlook (para el lateral). */
etiqueta(categoriaCruda: string): string {
  return normalizarCategoria(categoriaCruda);
}

  /**
   * Conteo de correos sin ninguna categoria en la carpeta. Se deriva de los
   * totales reales que ya trae la respuesta, no de un filtro aparte: asi el
   * numero nunca puede contradecir la lista.
   */
  get sinCategoriaTotal(): number {
    const clasificados = this.categoriasDisponibles.reduce((suma, c) => suma + c.total, 0);
    return Math.max(this.totalCarpeta - clasificados, 0);
  }

  /** `2026-01-15`, para los <input type="date">. */
  get hoyIso(): string {
    const ahora = new Date();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    return `${ahora.getFullYear()}-${mes}-${dia}`;
  }
}
