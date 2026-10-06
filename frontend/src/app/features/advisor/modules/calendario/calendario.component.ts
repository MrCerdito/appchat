import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { WhatsappChatService } from '../../../../core/services/whatsapp-chat.service';
import { LayoutService } from '../../../../core/services/layout.service';
import {
  CATEGORIAS_REUNION,
  CATEGORIA_POR_DEFECTO,
  buscarCategoria,
  categoriaDeEvento,
  CategoriaReunion,
} from '../../../../shared/utils/categoria-reunion.util';
import {
  CalendarioService,
  EventoCalendario,
  GrupoCalendario,
} from '../../../../core/services/calendario.service';
import {
  fmtMedium,
  fmtTime,
} from '../../../../shared/utils/date';

interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  meetings: EventoCalendario[];
}

/**
 * Una franja horaria del listado tipo Teams: la etiqueta ("9 AM") y los
 * eventos que empiezan en esa hora.
 */
interface HoraSlot {
  hora: number;
  etiqueta: string;
  eventos: EventoCalendario[];
}

/** Lo minimo que muestra el modal tras crear: la reunion completa no hace falta. */
interface ReunionCreada {
  subject: string;
  startDateTime: string;
  joinUrl: string | null;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
/* Solo las iniciales: la grilla compacta de la derecha no tiene ancho para
   los nombres completos. */
const WEEKDAYS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Bogota es UTC-5 fijo (no aplica horario de verano desde 1991).
 *
 * OJO CON EL SIGNO: para pasar de un instante UTC a la hora de pared de Bogota
 * hay que RESTAR 5 horas. La version anterior de `dayKey` hacia
 * `getTime() - BOG_OFFSET_MS`, o sea SUMABA 5h, y por eso una reunion de las
 * 20:00 del dia 5 caia en la celda del dia 6.
 *
 * Este offset es el mismo que usan `shared/utils/date.ts` (que si resta bien) y
 * `TeamsMeetingsService.BOGOTA_OFFSET_MS` en el backend, asi que los tres lados
 * coinciden.
 */
const BOG_OFFSET_MS = -5 * 3600000;

/**
 * Cada cuanto se relee el calendario del grupo para que las reuniones creadas
 * desde Teams aparezcan solas.
 *
 * 30 s es el punto practico: por debajo se pega contra el rate limit de Graph
 * (el calendario pagina de 10 en 10 y un mes son ~22 viajes) sin ganar nada,
 * porque una reunion se agenda con minutos de anticipacion, no con segundos.
 * Quien la necesite al instante tiene el refresco al volver a la pestana.
 */
const INTERVALO_REFRESCO = 30_000;

function aDate(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

/** Alias de la categoria que agrupa las reuniones en linea. */
const ALIAS_VIRTUAL = 'reunion virtual';
/** Alias de la categoria que agrupa las reuniones presenciales. */
const ALIAS_PRESENCIAL = 'reunion presencial';

/**
 * Sin acentos ni mayusculas, para que "reunion nazire" encuentre
 * "Reunión Nazire" y "jose" encuentre "José".
 */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Hora de pared de Bogota de un instante. Los campos se leen con `getUTC*`
 * porque el instante ya viene desplazado.
 */
function partesBogota(v: Date | string): {
  y: number;
  mes: number;
  d: number;
  h: number;
  min: number;
} {
  const b = new Date(aDate(v).getTime() + BOG_OFFSET_MS);
  return {
    y: b.getUTCFullYear(),
    mes: b.getUTCMonth(),
    d: b.getUTCDate(),
    h: b.getUTCHours(),
    min: b.getUTCMinutes(),
  };
}

/** 'YYYY-MM-DD' del dia local de Bogota de un instante real. */
function keyDeInstante(v: Date | string): string {
  const p = partesBogota(v);
  return `${p.y}-${pad2(p.mes + 1)}-${pad2(p.d)}`;
}

/**
 * 'YYYY-MM-DD' de una fecha nominal (medianoche UTC) que SOLO cuenta dias.
 *
 * No se desplaza a proposito: estas fechas no son instantes, son contadores de
 * la grilla. Aplicarles el offset las correria un dia.
 */
function keyNominal(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 'YYYY-MM-DDTHH:mm' en hora de Bogota, para <input type="datetime-local">. */
function naiveBogota(v: Date): string {
  const p = partesBogota(v);
  return `${p.y}-${pad2(p.mes + 1)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.min)}`;
}

/**
 * Instante UTC de la hora naive que escribio el usuario en el formulario.
 *
 * `<input type="datetime-local">` no lleva zona, asi que `new Date(naive)` la
 * interpretaria en la zona del navegador y correria la reunion si el equipo no
 * esta en Colombia. Se interpreta explicitamente como Bogota.
 */
function utcDesdeNaive(naive: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec((naive ?? '').trim());
  if (!m) return new Date(NaN);
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) -
      BOG_OFFSET_MS,
  );
}

@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendario.component.html',
  styleUrl: './calendario.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarioComponent implements OnInit, OnDestroy {
  protected readonly fmtMedium = fmtMedium;
  protected readonly fmtTime = fmtTime;
  protected readonly weekdayLabels = WEEKDAYS_CORTOS;

  viewYear: number;
  viewMonth: number;
  cells: CalendarCell[] = [];
  events: EventoCalendario[] = [];
  grupo: GrupoCalendario | null = null;
  /** El backend corto la lectura por CALENDARIO_MAX_PAGINAS. */
  truncado = false;
  selectedKey = '';
  todayKey = keyDeInstante(new Date());

  loading = true;
  error = '';

  protected readonly categoriasReunion = CATEGORIAS_REUNION;

  showCreate = false;
  draft = {
    subject: '',
    startDateTime: '',
    durationMinutes: 30,
    agendarCalendario: true,
    /** Alias de la categoria elegida ("Reunion virtual", ...). */
    categoria: CATEGORIA_POR_DEFECTO.alias,
  };
  creating = false;
  createError = '';
  createdMeeting: ReunionCreada | null = null;
  copiedId: string | null = null;

  isTeamsConnected = false;
  isLoadingTeams = false;
  teamsAccountName = '';

  /** Buscador del modulo. Solo filtra lo ya traido, no consulta nada. */
  busqueda = '';

  /** Refresco automatico: evita que el `setInterval` sobreviva al salir. */
  private timerRefresco: ReturnType<typeof setInterval> | null = null;
  private onVisibilidad: (() => void) | null = null;
  /** Evita peticiones encimadas si Graph tarda mas que el intervalo. */
  private refrescando = false;
  private reintentosFallidos = 0;
  /** Instante del proximo intento tras un fallo: `0` = intentar ya. */
  private proximoIntento = 0;

  constructor(
    private readonly waService: WhatsappChatService,
    private readonly calendario: CalendarioService,
    private readonly layout: LayoutService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    // El mes visible se deriva de la hora de Bogota, no de `getMonth()` del
    // navegador: si el equipo no esta en Colombia, el titulo del mes se
    // adelantaba un dia respecto al resaltado de "hoy".
    const hoy = partesBogota(new Date());
    this.viewYear = hoy.y;
    this.viewMonth = hoy.mes;
    this.selectedKey = this.todayKey;
  }

  ngOnInit(): void {
    // El sidebar del shell y su header NO se tocan: se siguen colapsando igual
    // que antes. Este modulo solo rediseña su propio contenido.
    this.layout.setSidebarForcedCollapsed(true);
    this.buildGrid();
    this.loadCalendar();
    this.iniciarRefresco();
  }

  ngOnDestroy(): void {
    this.layout.setSidebarForcedCollapsed(false);
    this.stopRefresco();
  }

  /** Aplica el texto del buscador y repinta la grilla. */
  aplicarBusqueda(): void {
    this.buildGrid();
    this.cdr.detectChanges();
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
    this.buildGrid();
    this.cdr.detectChanges();
  }

  openTeamsSettings(): void {
    this.router.navigate(['/dashboard/configuracion'], {
      queryParams: { tab: 'teams' },
    });
  }

  private loadTeamsStatus(): void {
    this.isLoadingTeams = true;
    this.waService.getTeamsStatus().subscribe({
      next: status => {
        this.isLoadingTeams = false;
        this.isTeamsConnected = status.connected;
        this.teamsAccountName = status.accountName || '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingTeams = false;
        this.isTeamsConnected = false;
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Pide al backend el calendario real del grupo para las 6 semanas que
   * muestra la grilla.
   *
   * El rango es el de las 42 celdas, no el del mes: si se pidiera solo el mes,
   * los dias del mes vecino que la grilla tambien dibuja saldrian vacios.
   * El backend pagina Graph completo y lo cachea, asi que ir y volver es barato.
   */
  async loadCalendar(refrescar = false): Promise<boolean> {
    // Un refresco en segundo plano no levanta el spinner: si lo levantara, la
    // agenda parpadearia cada 30 s mientras el asesor esta leyendo o escribiendo.
    if (!refrescar) {
      this.loading = true;
      this.error = '';
      this.cdr.detectChanges();
    }
    try {
      const { desde, hasta } = this.rangoGrilla();
      const res = await this.calendario.grupo(desde, hasta, refrescar);
      this.grupo = res.grupo;
      this.truncado = res.truncado;
      // Sin filtrar: llegan cumpleaños, recordatorios, series, cancelados y
      // eventos sin videollamada. Todo lo que hay en el calendario se ve.
      this.events = res.eventos.slice().sort(
        (a, b) => a.startDateTime.localeCompare(b.startDateTime),
      );
      this.rebuildDerived();
      return true;
    } catch (err: any) {
      // Un refresco fallido no debe tapar la agenda que ya se está viendo: solo
      // se muestra el error si no habia datos de antes.
      if (!refrescar || this.events.length === 0) {
        this.error = this.errText(err, 'No se pudo cargar el calendario del grupo.');
      }
      return false;
    } finally {
      if (!refrescar) this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Refresco automatico para que las reuniones creadas desde Teams aparezcan sin
   * recargar la pagina.
   *
   * El caso real: el asesor agenda en Teams o Outlook, cambia a esta pestana y
   * sigue trabajando. Antes no se enteraba de nada hasta que cambiaba de mes o
   * recargaba, y aun asi la cache del backend podia devolverle datos de hasta 5
   * minutos. Ahora cada `INTERVALO_REFRESCO` ms se salta la cache.
   *
   * Decisiones:
   *  - Solo con la pestana a la vista: en segundo plano no hay nadie mirando y
   *   |Consume Graph sin dar nada a cambio.
   *  - No refresca con el modal de creacion abierto ni mientras se escribe el
   *    nombre: `rebuildDerived` repinta la agenda y `cdr.detectChanges()` podria
   *    comerse el foco del input.
   *  - Backoff tras un fallo: si Graph responde mal, reintentar cada 30 s solo
   *    suma peticiones; se espera mas y el ciclo normal lo reintenta igual.
   */
  private iniciarRefresco(): void {
    this.stopRefresco();
    this.timerRefresco = setInterval(() => this.refrescarEnSegundoPlano(), INTERVALO_REFRESCO);

    // Volver a la pestana es la señal de que el asesor venia de Teams: se
    // recarga en el acto, sin esperar al siguiente tick.
    this.onVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        // Volver a la pestana es la senal de que el asesor venia de Teams: se
        // limpia el backoff y se recarga en el acto, sin esperar al siguiente tick.
        this.registrarAcierto();
        this.refrescarEnSegundoPlano();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilidad);
  }

  private stopRefresco(): void {
    if (this.timerRefresco !== null) {
      clearInterval(this.timerRefresco);
      this.timerRefresco = null;
    }
    if (this.onVisibilidad) {
      document.removeEventListener('visibilitychange', this.onVisibilidad);
      this.onVisibilidad = null;
    }
  }

  private refrescarEnSegundoPlano(): void {
    if (this.refrescando || this.creating || this.showCreate) return;
    if (document.visibilityState !== 'visible') return;
    // Backoff: si Graph esta fallando, no se le insiste cada 30 s. Cada fallo
    // consecutivo aleja el proximo intento un intervalo mas (30 s, 60 s, 90 s...)
    // hasta 5 minutos, y al primer acierto se vuelve al ritmo normal.
    if (Date.now() < this.proximoIntento) return;

    this.refrescando = true;
    this.loadCalendar(true)
      .then((ok) => {
        if (ok) this.registrarAcierto();
        else this.registrarFallo();
      })
      .catch(() => this.registrarFallo())
      .finally(() => {
        this.refrescando = false;
      });
  }

  private registrarAcierto(): void {
    this.reintentosFallidos = 0;
    this.proximoIntento = 0;
  }

  private registrarFallo(): void {
    this.reintentosFallidos = Math.min(this.reintentosFallidos + 1, 10);
    this.proximoIntento = Date.now() + this.reintentosFallidos * INTERVALO_REFRESCO;
  }

  /**
   * Inicios en UTC de la primera y la ultima celda, con el desfase de Bogota:
   * las celdas son "medianoche en Bogota", asi que el instante real es menos 5h.
   * `hasta` cubre el dia entero de la ultima celda.
   */
  private rangoGrilla(): { desde: string; hasta: string } {
    const celdas = this.cells;
    if (!celdas.length) {
      // Sin grilla todavia: se usa la medianoche de Bogota de hoy, no
      // `new Date() - 5h`, que seria la hora actual y no el inicio del dia.
      const hoy = this.nominalDe(this.todayKey);
      return {
        desde: new Date(hoy + BOG_OFFSET_MS).toISOString(),
        hasta: new Date(hoy + BOG_OFFSET_MS + 86400000).toISOString(),
      };
    }
    const primera = this.nominalDe(celdas[0].key);
    const ultima = this.nominalDe(celdas[celdas.length - 1].key);
    return {
      desde: new Date(primera + BOG_OFFSET_MS).toISOString(),
      hasta: new Date(ultima + BOG_OFFSET_MS + 86400000).toISOString(),
    };
  }

  /** Inversa de keyNominal: '2026-10-05' -> medianoche UTC de esa fecha. */
  private nominalDe(key: string): number {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  private rebuildDerived(): void {
    this.buildGrid();
  }

/** Eventos que se ven despues del buscador.
   *
   * El buscador es solo de vista: filtra lo que ya trajo el backend sobre el
   * asunto, el organizador y la categoria. No consulta nada nuevo, asi que la
   * grilla no puede quedar desfasada con el panel lateral.
   */
  get eventosVisibles(): EventoCalendario[] {
    const q = normalizar(this.busqueda);
    if (!q) return this.events;
    return this.events.filter((e) => {
      if (normalizar(e.subject).includes(q)) return true;
      if (normalizar(e.organizerName).includes(q)) return true;
      const c = categoriaDeEvento(e.categorias);
      if (c && normalizar(c.alias).includes(q)) return true;
      return false;
    });
  }

  get hayBusqueda(): boolean {
    return normalizar(this.busqueda).length > 0;
  }

  /**
   * Indicadores del modulo. Todos salen de los eventos ya cargados: no hay
   * ninguna cifra fija en el template.
   *
   * "Eventos especiales" es el resto que no es presencial ni en linea (reunion
   * de equipo, cumpleaños y eventos sin categoria), por eso se define como
   * total - presencial - virtual en vez de inventar una quinta categoria.
   */
  get metricas(): {
    total: number;
    presencial: number;
    virtual: number;
    especiales: number;
  } {
    const lista = this.eventosVisibles;
    let presencial = 0;
    let virtual = 0;
    for (const e of lista) {
      const alias = normalizar(categoriaDeEvento(e.categorias)?.alias);
      if (alias === ALIAS_PRESENCIAL) presencial++;
      else if (alias === ALIAS_VIRTUAL) virtual++;
    }
    return {
      total: lista.length,
      presencial,
      virtual,
      especiales: lista.length - presencial - virtual,
    };
  }

  /**
   * Segmentos del donut de categorias.
   *
   * `r = 15.915` hace que la circunferencia sea ~100, asi que el largo del
   * trazo es directamente el porcentaje y el desplazamiento es el acumulado.
   */
  get segmentosDonut(): Array<{
    alias: string;
    color: string;
    total: number;
    pct: number;
    dash: string;
    offset: number;
  }> {
    const filas = this.resumenCategorias;
    const total = filas.reduce((acc, f) => acc + f.total, 0);
    let acumulado = 0;
    return filas.map((f) => {
      const pct = total > 0 ? (f.total / total) * 100 : 0;
      const seg = {
        alias: f.cat.alias,
        color: f.cat.color,
        total: f.total,
        pct: Math.round(pct),
        dash: `${pct} 100`,
        offset: -acumulado,
      };
      acumulado += pct;
      return seg;
    });
  }

  get totalCategorias(): number {
    return this.resumenCategorias.reduce((acc, f) => acc + f.total, 0);
  }

  /** Nombre de la persona que organiza, o el texto neutro si Graph no lo dio. */
responsable(m: EventoCalendario): string {
    return m.organizerName?.trim() || 'Sin organizador';
  }

  /**
   /**
   * Origen de la reunion, en una sola etiqueta.
   *
   * Antes se mostraban dos textos que dicen lo mismo ("Reunion Teams" y
   * "Teams") y, para eventos sin videollamada, "Buzon compartido" o "Sin
   * videollamada", que tampoco aportan nada. Ahora solo aparece de donde salio
   * la reunion, y vacio si no hay nada que decir: la categoria ya la muestra
   * la pastilla de color y el horario ya dice "Todo el dia" cuando aplica.
   */
  tipoEvento(m: EventoCalendario): string {
    if (m.isCancelled) return 'Cancelado';
    if (m.creadaEnLaApp) return 'Creada en la app';
    if (m.joinUrl) return 'Creada en Teams';
    return '';
  }

  /**
   * Categorias presentes en el rango visible, con su conteo.
   *
   * Se arma sobre los eventos que ya se trajo, no con otra llamada: las
   * categorias solo se piden una vez por lectura del calendario.
   */
  get resumenCategorias(): Array<{ cat: CategoriaReunion; total: number }> {
    const cuenta = new Map<string, number>();
    for (const e of this.eventosVisibles) {
      const c = categoriaDeEvento(e.categorias);
      if (!c) continue;
      cuenta.set(c.alias, (cuenta.get(c.alias) ?? 0) + 1);
    }
    return CATEGORIAS_REUNION.filter((c) => cuenta.has(c.alias)).map((cat) => ({
      cat,
      total: cuenta.get(cat.alias) ?? 0,
    }));
  }

  /** Eventos de una categoria concreta, para el panel lateral. */
  eventosDeCategoria(alias: string): EventoCalendario[] {
    const c = buscarCategoria(alias);
    if (!c) return [];
    return this.eventosVisibles
      .filter((e) => {
        const ec = categoriaDeEvento(e.categorias);
        return ec?.alias === c.alias;
      })
      .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
  }

  private buildGrid(): void {
    const primeroDelMes = new Date(Date.UTC(this.viewYear, this.viewMonth, 1));
    const prev = new Date(
      Date.UTC(
        primeroDelMes.getUTCFullYear(),
        primeroDelMes.getUTCMonth(),
        primeroDelMes.getUTCDate() - primeroDelMes.getUTCDay(),
      ),
    );
    const byKey = new Map<string, EventoCalendario[]>();
    for (const m of this.eventosVisibles) {
      const k = keyDeInstante(m.startDateTime);
      const arr = byKey.get(k);
      if (arr) arr.push(m);
      else byKey.set(k, [m]);
    }
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate() + i)); // eslint-disable-line no-plusplus
      // `d` es un contador de dia, no un instante: se usa keyNominal para no
      // desplazarlo a la franja anterior.
      const key = keyNominal(d);
      const meetings = (byKey.get(key) ?? [])
        .slice()
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      cells.push({
        key,
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === this.viewMonth,
        isToday: key === this.todayKey,
        isSelected: key === this.selectedKey,
        meetings,
      });
    }
    this.cells = cells;
  }

  get monthLabel(): string {
    return `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
  }

  get selectedLabel(): string {
    const [y, m, d] = this.selectedKey.split('-').map(Number);
    return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
  }

  get selectedMeetings(): EventoCalendario[] {
    return this.cells.find((c) => c.key === this.selectedKey)?.meetings ?? [];
  }

  /** "9 AM" / "2 PM", el formato de etiquetas de hora de Teams. */
  private etiquetaHora(hora: number): string {
    const h12 = hora % 12 === 0 ? 12 : hora % 12;
    return `${h12} ${hora < 12 ? 'AM' : 'PM'}`;
  }

  /**
   * Listado del dia en franjas de una hora, al estilo de Teams.
   *
   * Las 24 franjas siempre estan, ocupadas esten o no: asi la columna no
   * "baila" al agregar o quitar una reunion y el usuario siempre encuentra la
   * hora que busca.
   */
  get horasDelDia(): HoraSlot[] {
    const porHora = new Map<number, EventoCalendario[]>();
    for (const m of this.selectedMeetings) {
      const h = partesBogota(m.startDateTime).h;
      const arr = porHora.get(h);
      if (arr) arr.push(m);
      else porHora.set(h, [m]);
    }
    const slots: HoraSlot[] = [];
    for (let hora = 0; hora < 24; hora++) { // eslint-disable-line no-plusplus
      const eventos = (porHora.get(hora) ?? [])
        .slice()
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      slots.push({ hora, etiqueta: this.etiquetaHora(hora), eventos });
    }
    return slots;
  }

  /** Hora actual en Bogotá, para marcar en que franja estamos. */
  get horaActual(): number {
    return partesBogota(new Date()).h;
  }

  /**
   * Hoy la franja ya paso: se apaga para que la parte vigente de la agenda
   * quede a la vista sin tener que scrollear.
   *
   * Un dia anterior se apaga completo y uno futuro no. La franja se apaga solo
   * si ya termino su hora, sin importar si tiene eventos: cada evento se
   * apaga por su cuenta con `isPastMeeting`, que sabe si la reunion sigo en
   * curso aunque la hora de inicio ya haya quedado atras.
   */
  protected franjaPasada(slot: HoraSlot): boolean {
    if (this.selectedKey < this.todayKey) return true;
    if (this.selectedKey !== this.todayKey) return false;
    return slot.hora < this.horaActual;
  }

  /**
   * Fecha legible de una celda cualquiera del mini calendario.
   *
   * Se usa en el `title` del boton: el dia se elige ahi, asi que al apuntar el
   * mouse tiene que decir que dia es y no solo mostrar un numero suelto.
   */
  selectedLabelFor(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
  }

  /**
   * Colores de los puntitos de una celda del mini calendario.
   *
   * Como maximo 3: en una celda de 34px no caben mas y el patron de puntos ya
   * dice "este dia tiene eventos". El orden es el de la hora de inicio, asi que
   * el punto de arriba es el primero del dia.
   */
  protected dotsDe(cell: CalendarCell): string[] {
    const colores: string[] = [];
    for (const m of cell.meetings) {
      const c = categoriaDeEvento(m.categorias)?.color ?? null;
      if (c && !colores.includes(c)) colores.push(c);
      if (colores.length === 3) break; // eslint-disable-line no-plusplus
    }
    return colores;
  }

  /**
   * Finalizado: la reunion ya se termino, hoy o en un dia anterior.
   *
   * Se compara el INSTANTE de fin contra el ahora, no solo la fecha: una
   * reunion que acabo a las 8:30 de manana ya no sirve y por eso se apaga y
   * pierde los botones, aunque siga siendo el mismo dia. Una reunion en curso
   * (empieza antes y termina despues) sigue siendo vigente y se puede abrir.
   */
  isPastMeeting(m: EventoCalendario): boolean {
    return aDate(m.endDateTime).getTime() <= Date.now();
  }

  /** El enlace solo existe si el evento trae videollamada de Teams. */
  tieneTeams(m: EventoCalendario): boolean {
    return !!m.joinUrl;
  }

  /** Categoria de color de un evento, o null si no tiene ninguna conocida. */
  protected categoria(m: EventoCalendario): CategoriaReunion | null {
    return categoriaDeEvento(m.categorias);
  }

  prevMonth(): void {
    const d = new Date(Date.UTC(this.viewYear, this.viewMonth - 1, 1));
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.buildGrid();
    this.loadCalendar();
  }

  nextMonth(): void {
    const d = new Date(Date.UTC(this.viewYear, this.viewMonth + 1, 1));
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.buildGrid();
    this.loadCalendar();
  }

  goToday(): void {
    const hoy = partesBogota(new Date());
    this.viewYear = hoy.y;
    this.viewMonth = hoy.mes;
    this.selectedKey = this.todayKey;
    this.buildGrid();
    this.loadCalendar();
  }

  selectDay(key: string): void {
    this.selectedKey = key;
    this.buildGrid();
    this.cdr.detectChanges();
  }

  /**
   * Mueve el dia seleccionado un dia hacia atras o hacia adelante.
   *
   * Si el dia cae fuera del mes visible (el mini calendario muestra 6 semanas),
   * se recentra el mes en el nuevo dia y se recarga: si no, el listado quedaria
   * vacio sin explicacion porque el backend ya no trae ese rango.
   */
  private moverDia(delta: number): void {
    const d = new Date(this.nominalDe(this.selectedKey) + delta * 86400000);
    this.selectedKey = keyNominal(d);
    const mesVisible = d.getUTCMonth() === this.viewMonth && d.getUTCFullYear() === this.viewYear;
    if (!mesVisible) {
      this.viewYear = d.getUTCFullYear();
      this.viewMonth = d.getUTCMonth();
      this.buildGrid();
      this.loadCalendar();
      return;
    }
    this.buildGrid();
    this.cdr.detectChanges();
  }

  prevDay(): void {
    this.moverDia(-1);
  }

  nextDay(): void {
    this.moverDia(1);
  }

  openCreate(): void {
    // Proxima hora en clave de Bogota, no de la zona del navegador.
    const base = new Date();
    const p = partesBogota(base);
    const desajusteMin = p.min;
    const desfase = (60 - desajusteMin) % 60;
    const inicio = new Date(
      base.getTime() + BOG_OFFSET_MS + desfase * 60000,
    );
    this.draft = {
      subject: '',
      startDateTime: naiveBogota(inicio),
      durationMinutes: 30,
      agendarCalendario: true,
      categoria: CATEGORIA_POR_DEFECTO.alias,
    };
    this.createError = '';
    this.createdMeeting = null;
    this.showCreate = true;
    this.loadTeamsStatus();
    this.cdr.detectChanges();
  }

  closeCreate(): void {
    if (this.creating) return;
    this.showCreate = false;
    this.createError = '';
    this.createdMeeting = null;
    this.cdr.detectChanges();
  }

  async createMeeting(): Promise<void> {
    if (this.creating) return;
    const subject = this.draft.subject.trim();
    if (!subject || !this.draft.startDateTime) {
      this.createError = 'Escribe un nombre y una fecha valida.';
      return;
    }
    this.creating = true;
    this.createError = '';
    this.cdr.detectChanges();
    // El input no lleva zona: se interpreta como hora de Bogota, no como la del
    // navegador.
    const agenda = utcDesdeNaive(this.draft.startDateTime);
    if (Number.isNaN(agenda.getTime())) {
      this.creating = false;
      this.createError = 'La fecha y hora no son validas.';
      this.cdr.detectChanges();
      return;
    }
    // A Graph hay que mandarle el nombre literal de Outlook ("Yellow category"),
    // no el alias que ve el usuario.
    const categoriaElegida = buscarCategoria(this.draft.categoria);
    try {
      // La creacion sigue pasando por teams-meetings.service.ts: este modulo
      // solo lee. Con TEAMS_GROUP_ID configurado, ahi es donde la reunion
      // aterriza en el calendario del grupo.
      const created = await firstValueFrom(
        this.waService.createStandaloneMeeting({
          subject,
          startDateTime: agenda.toISOString(),
          durationMinutes: this.draft.durationMinutes,
          calendarTarget: this.draft.agendarCalendario ? 'shared' : 'none',
          categorias: categoriaElegida ? [categoriaElegida.outlook] : undefined,
        }),
      );
      this.createdMeeting = {
        subject: created.subject,
        startDateTime: created.startDateTime,
        joinUrl: created.joinUrl ?? null,
      };
      this.selectedKey = keyDeInstante(created.startDateTime);
      this.viewYear = Number(this.selectedKey.slice(0, 4));
      this.viewMonth = Number(this.selectedKey.slice(5, 7)) - 1;
      this.buildGrid();
      // Se relee del grupo en vez de insertar a mano: asi lo que se ve es
      // exactamente lo que quedo en el calendario real.
      await this.loadCalendar();
    } catch (err: any) {
      this.createError = this.errText(err, 'No se pudo crear la reunion.');
    } finally {
      this.creating = false;
      this.cdr.detectChanges();
    }
  }

  async copyLink(m: EventoCalendario): Promise<void> {
    if (!m.joinUrl) return;
    try {
      await navigator.clipboard.writeText(m.joinUrl);
      this.copiedId = m.eventId;
    } catch {
      this.error = 'No se pudo copiar el enlace.';
    }
    this.cdr.detectChanges();
    setTimeout(() => {
      this.copiedId = null;
      this.cdr.detectChanges();
    }, 2000);
  }

  openLink(m: EventoCalendario): void {
    if (!m.joinUrl) return;
    window.open(m.joinUrl, '_blank', 'noopener');
  }

  /** Copia el enlace de la reunion recien creada desde el modal de exito. */
  async copyCreatedLink(): Promise<void> {
    const url = this.createdMeeting?.joinUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copiedId = 'creada';
    } catch {
      this.error = 'No se pudo copiar el enlace.';
    }
    this.cdr.detectChanges();
    setTimeout(() => {
      this.copiedId = null;
      this.cdr.detectChanges();
    }, 2000);
  }

  private errText(err: any, fallback: string): string {
    const msg = err?.error?.message;
    const raw = typeof err?.error === 'string' ? err.error : undefined;
    return String(msg || raw || fallback);
  }
}
