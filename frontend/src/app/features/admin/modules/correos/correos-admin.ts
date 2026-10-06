import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { SocketService } from '../../../../core/services/socket.service';
import {
  CorreosAdminService,
  EventoSlaCorreos,
  FilaAsesorSla,
  NivelSla,
  ResumenCorreosAdmin,
} from '../../../../core/services/correos-admin.service';
import {
  COLUMNAS_ESTADO,
  ClaveEstado,
  COLOR_ESTADO,
  ORDEN_NIVEL,
  estiloNivel,
} from './correos-sla.util';
import { fechaCorta, numero, tiempoRelativo } from './correos-fecha.util';

/** Evento del gateway que empuja los cambios del sincronizador. */
const EVENTO_SLA = 'correo:sla';

/**
 * Respaldo del WebSocket.
 *
 * El espejo local solo cambia cada 2 min (el tic del sincronizador), asi que este
 * interval es deliberadamente mas corto que eso: si el socket no llegara a
 * conectar, el tablero se entera igual. Si el socket funciona, este interval casi
 * nunca consulta nada porque el evento llega antes.
 */
const MS_RESPALDO = 45_000;

/** Columnas por las que se puede ordenar. `carpeta` ordena por la carpeta. */
type ClaveOrden = 'carpeta' | 'ultimoSync' | 'abiertos' | 'total' | ClaveEstado;

@Component({
  selector: 'app-correos-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './correos-admin.html',
  styleUrls: ['./correos-admin.scss'],
})
export class CorreosAdmin implements OnInit, OnDestroy {
  private api = inject(CorreosAdminService);
  private router = inject(Router);
  private socket = inject(SocketService);

  private suscripciones = new Subscription();
  private destroyed = false;
  /** Evita peticiones encadenadas si el refresh manual llega durante el push. */
  private recargando = false;
  /** Espera a que el servidor termine de leer las carpetas de Graph. */
  private esperandoCarpetas = false;

  readonly columnas = COLUMNAS_ESTADO;
  readonly ordenNivel = ORDEN_NIVEL;

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly datos = signal<ResumenCorreosAdmin | null>(null);
  /** true mientras llega una recarga con la tabla ya visible. */
  readonly refrescando = signal(false);

  /** Filtro por nivel de SLA. `null` = todos. */
  readonly filtroNivel = signal<NivelSla | null>(null);
  readonly busqueda = signal('');

  /** Orden activo. Por defecto, lo urgente arriba. */
  readonly orden = signal<{ clave: ClaveOrden; dir: 'asc' | 'desc' }>({
    clave: 'abiertos',
    dir: 'desc',
  });

  /**
   * Los datos no dependen de los filtros: el filtro se aplica aqui, para que
   * cambiar de nivel o escribir en la busqueda no vuelva a pegarle al servidor.
   */
  readonly filas = computed<FilaAsesorSla[]>(() => {
    const d = this.datos();
    if (!d) return [];

    const nivel = this.filtroNivel();
    const texto = this.busqueda().trim().toLowerCase();

    const filtradas = d.asesores
      .filter((a) => (nivel ? a.nivel === nivel : true))
      .filter((a) =>
        texto
          ? a.carpeta.toLowerCase().includes(texto) || a.asesor.toLowerCase().includes(texto)
          : true,
      );

    const { clave, dir } = this.orden();
    const factor = dir === 'asc' ? 1 : -1;

    return filtradas.slice().sort((a, b) => {
      // El nivel manda siempre: un "critico" no debe quedar debajo de un
      // "estable" porque ese tenga mas abiertos.
      if (clave !== 'abiertos') {
        const ia = ORDEN_NIVEL.indexOf(a.nivel);
        const ib = ORDEN_NIVEL.indexOf(b.nivel);
        if (ia !== ib) return ia - ib;
      }

      const va = valorOrden(a, clave);
      const vb = valorOrden(b, clave);

      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * factor;
      }
      // Los ceros se hunden al final en vez de competir arriba.
      if (va === 0 && vb !== 0) return 1;
      if (vb === 0 && va !== 0) return -1;
      return ((va as number) - (vb as number)) * factor;
    });
  });

  /** El backend ya manda las huerfanas al final; aqui no se reordena nada. */
  readonly sinAsesor = computed(() => this.datos()?.sinAsesor ?? []);

  /** El servidor todavia no tiene la lista de huerfanas; se esperara sola. */
  readonly faltanCarpetas = computed(() => this.datos()?.estadoCarpetas === 'calculando');

  ngOnInit(): void {
    this.cargar();

    // El servidor avisa cuando el sincronizador cambio algo: recargamos solos.
    this.suscripciones.add(
      this.socket.on<EventoSlaCorreos>(EVENTO_SLA).subscribe(() => this.cargar(true)),
    );

    // Respaldo por si el socket no llega a conectar.
    this.suscripciones.add(interval(MS_RESPALDO).subscribe(() => this.cargar(true)));

    // Volver a la pestana es una senal de que el dato puede estar viejo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') this.cargar(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    this.suscripciones.add({
      unsubscribe: () => document.removeEventListener('visibilitychange', alVolver),
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.suscripciones.unsubscribe();
  }

  /**
   * Carga el resumen.
   *
   * @param silencioso cuando la tabla ya esta en pantalla: no se muestra estado
   * de carga ni se pisa el error anterior, porque el admin esta mirando los
   * numeros y un parpadeo seria peor que esperar un instante.
   */
  cargar(silencioso = false): void {
    if (this.recargando) return;
    this.recargando = true;

    if (!silencioso && !this.datos()) this.cargando.set(true);
    if (silencioso) this.refrescando.set(true);
    if (!silencioso) this.error.set(null);

    this.api.resumen().subscribe({
      next: (r) => {
        if (this.destroyed) return;
        this.datos.set(r);
        this.cargando.set(false);
        this.refrescando.set(false);
        this.recargando = false;
        this.pedirCarpetasSiFaltan(r);
      },
      error: () => {
        if (this.destroyed) return;
        // Un refresco en silencio no borra lo que ya se ve.
        if (!silencioso || !this.datos()) {
          this.error.set('No se pudo cargar el resumen de correos.');
        }
        this.cargando.set(false);
        this.refrescando.set(false);
        this.recargando = false;
      },
    });
  }

  /**
   * Segunda pasada para pintar las carpetas huerfanas.
   *
   * El backend las lee en segundo plano para no hacer esperar la tabla, asi que
   * la primera respuesta llega con la seccion vacia. Cuando el servidor dice que
   * ya termino, se pide una vez mas y se completa sola: el admin no tiene que
   * volver a pulsar "Actualizar" ni ver un spinner.
   */
  private pedirCarpetasSiFaltan(r: ResumenCorreosAdmin): void {
    if (r.estadoCarpetas !== 'calculando' || this.esperandoCarpetas) return;
    this.esperandoCarpetas = true;

    this.api.resumen().subscribe({
      next: (final) => {
        this.esperandoCarpetas = false;
        if (this.destroyed || final.estadoCarpetas === 'calculando') return;
        this.datos.set(final);
      },
      error: () => {
        // La tabla ya esta; las huerfanas se quedan como estaban.
        this.esperandoCarpetas = false;
      },
    });
  }

  abrirAsesor(fila: FilaAsesorSla): void {
    // Se pasa la fila completa en el estado: el detalle la usa para el nombre,
    // la carpeta y el estado de SLA sin volver a pedir el resumen.
    this.router.navigate(['/admin/correos/asesor', fila.asesorId], { state: { fila } });
  }

  /** Alterna el filtro de nivel; volver a pulsar el mismo lo quita. */
  alternarNivel(nivel: NivelSla): void {
    this.filtroNivel.update((actual) => (actual === nivel ? null : nivel));
  }

  /**
   * Ordena por una columna. Si ya se ordena por esa, invierte la direccion;
   * si no, arranca descendente para los numeros y ascendente para los nombres.
   */
  alternarOrden(clave: ClaveOrden): void {
    this.orden.update((o) =>
      o.clave === clave
        ? { clave, dir: o.dir === 'desc' ? 'asc' : 'desc' }
        : {
            clave,
            dir: typeof valorOrden(this.datos()?.asesores[0], clave) === 'string' ? 'asc' : 'desc',
          },
    );
  }

  /** Marca visual del encabezado ordenado. */
  ordenDe(clave: ClaveOrden): 'asc' | 'desc' | null {
    const o = this.orden();
    return o.clave === clave ? o.dir : null;
  }

  /**
   * `aria-sort` del encabezado, para que un lector de pantalla anuncie por donde
   * esta ordenado. Sin esto la tabla se lee como una lista sin criterio.
   */
  ordenAria(clave: ClaveOrden): 'ascending' | 'descending' | 'none' {
    const o = this.ordenDe(clave);
    return o === 'asc' ? 'ascending' : o === 'desc' ? 'descending' : 'none';
  }

  /**
   * Abre el detalle con Enter o Espacio.
   *
   * La fila es clicable, pero un `<tr>` con click no es alcanzable con teclado:
   * sin esto el tablero solo se puede recorrer con el raton.
   */
  abrirConTecla(event: KeyboardEvent, fila: FilaAsesorSla): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // El espacio debescrollear si no lo detenemos aqui.
    event.preventDefault();
    this.abrirAsesor(fila);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  /** Estilo del estado de SLA de una fila. */
  estilo(fila: FilaAsesorSla): ReturnType<typeof estiloNivel> {
    return estiloNivel(fila.nivel);
  }

  estiloNivel(nivel: NivelSla): ReturnType<typeof estiloNivel> {
    return estiloNivel(nivel);
  }

  colorEstado(clave: ClaveEstado): string {
    return COLOR_ESTADO[clave] ?? 'var(--text-faint)';
  }

  /**
   * Chip de "Acceso" de una carpeta huerfana.
   *
   * No es un nivel de SLA: es si el backend pudo leer esa carpeta. Por eso usa
   * verde/slate y no la escala de niveles.
   */
  acceso(sincronizada: boolean): { color: string; fondo: string; borde: string } {
    return sincronizada
      ? { color: '#15803d', fondo: '#f0fdf4', borde: '#bbf7d0' }
      : { color: '#64748b', fondo: '#f8fafc', borde: '#e2e8f0' };
  }

  /**
   * "hace 3 min" en la columna de sincronizacion.
   *
   * La pregunta que responde el admin es "¿esto esta viejo?", y eso se contesta
   * con una distancia. El instante exacto queda en el `title`, asi que el dato
   * preciso no se pierde.
   */
  desde(valor: string | null): string {
    return tiempoRelativo(valor) ?? 'Nunca';
  }

  /** Instante exacto, para el `title` de la celda. */
  tituloFecha(valor: string | null): string {
    return fechaCorta(valor) ?? 'Sin sincronizar';
  }

  /** Entero con separador de miles: los conteos se comparan, no se cuentan. */
  num(valor: number): string {
    return numero(valor);
  }
}

/** Valor de la columna por la que se ordena. */
function valorOrden(fila: FilaAsesorSla | undefined, clave: ClaveOrden): number | string {
  if (!fila) return '';
  if (clave === 'carpeta') return fila.carpeta;
  if (clave === 'ultimoSync') return fila.ultimoSync ?? '';
  return fila[clave];
}