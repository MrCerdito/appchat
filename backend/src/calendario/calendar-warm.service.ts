import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarioGrupoService } from './calendario-grupo.service';
import { CalendarioGrupoDto } from './dto/calendario-grupo.dto';

/** Ventanas que se mantienen calientes a la vez. */
const MAX_VENTANAS_POR_DEFECTO = 6;
/** Minutos entre una pasada de calentamiento y la siguiente. */
const INTERVALO_MIN_POR_DEFECTO = 5;

/**
 * Mantiene calientes, SOLO EN MEMORIA, las ventanas de fechas que realmente se
 * estan mirando.
 *
 * Por que existe: Metricas necesita el total de reuniones (creadas en la app y
 * las creadas directamente en Teams) para el rango elegido por el admin. La
 * fuente de verdad de eso es el calendario M365, leido por
 * `CalendarioGrupoService`. Leer Graph cuesta varios viajes secuenciales
 * ($top=50 por pagina), asi que hacerlo dentro de la peticion del dashboard
 * dejaria al admin esperando segundos.
 *
 * La solucion NO es copiar todo a una tabla: aqui no se escribe UNA fila. Solo
 * se puebla el `Map` en RAM que ya usa el calendario (techo 40 entradas, se
 * purga solo). El costo de Graph queda acotado y en segundo plano: una pasada
 * cada N minutos sobre las ultimas ventanas pedidas, que es una fraccion del
 * limite de Outlook (10.000 requests cada 10 minutos por app+buzon).
 *
 * Flujo:
 *  1. Metricas llama `asegurar(desde, hasta)` -> registra la ventana en el
 *     anillo y devuelve la lectura (de RAM si ya esta tibia).
 *  2. Cada `INTERVALO_MIN` se recalculan TODAS las ventanas del anillo con
 *     `refrescar: true`, asi que la proxima peticion vuelve a ser instantanea.
 *  3. Si Graph falla, `CalendarioGrupoService` ya sirve la ultima copia buena
 *     (stale-while-error) y aqui solo se registra el aviso.
 */
@Injectable()
export class CalendarWarmService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CalendarWarmService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private corriendo = false;

  /** ISO -> ventana. El orden del Map es el del anillo (LRU por re-insersion). */
  private readonly ventanas = new Map<string, { desde: string; hasta: string }>();

  constructor(
    private readonly calendario: CalendarioGrupoService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const min = this.numero('CALENDARIO_WARM_INTERVALO_MIN', INTERVALO_MIN_POR_DEFECTO);
    this.interval = setInterval(() => void this.refrescar(), min * 60_000);
    this.interval.unref?.();
    this.log.log(
      `Calentamiento de calendario activo: cada ${min} min, hasta ` +
        `${this.limite()} ventanas en memoria (sin escrituras en BD).`,
    );
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  /**
   * Registra la ventana como "en uso" y devuelve su lectura.
   *
   * Primera vez para esa ventana: se lee Graph (varios viajes) y queda cacheada
   * 300 s. Las siguientes: respuesta de RAM.
   */
  async asegurar(desde: string, hasta: string): Promise<CalendarioGrupoDto> {
    this.registrar(desde, hasta);
    return this.calendario.obtener(desde, hasta);
  }

  /** Solo recalentar, sin devolver datos: para precargar antes de que alguien pida. */
  async calentar(desde: string, hasta: string): Promise<void> {
    this.registrar(desde, hasta);
    await this.calendario.obtener(desde, hasta, { refrescar: true });
  }

  private registrar(desde: string, hasta: string): void {
    const clave = `${desde}|${hasta}`;
    // Re-insertar mueve la ventana al final: es lo que hace que el Map funcione
    // como anillo LRU y que las menos vistas se purguen primero.
    this.ventanas.delete(clave);
    this.ventanas.set(clave, { desde, hasta });
    while (this.ventanas.size > this.limite()) {
      const masVieja = this.ventanas.keys().next().value;
      if (masVieja === undefined) break;
      this.ventanas.delete(masVieja);
    }
  }

  private async refrescar(): Promise<void> {
    // Guarda anti-solape: si una pasada tarda mas que el intervalo, la siguiente
    // se salta en vez de abrir una segunda tanda de viajes a Graph.
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      for (const v of [...this.ventanas.values()]) {
        try {
          await this.calendario.obtener(v.desde, v.hasta, { refrescar: true });
        } catch (err: any) {
          // No se propaga: una ventana que no se pudo recalentar no debe
          // tumbar el ciclo de las demas, y la proxima pasada reintenta.
          this.log.warn(
            `No se pudo recalentar ${v.desde}..${v.hasta}: ${err?.message ?? err}`,
          );
        }
      }
    } finally {
      this.corriendo = false;
    }
  }

  private limite(): number {
    return this.numero('CALENDARIO_WARM_MAX_VENTANAS', MAX_VENTANAS_POR_DEFECTO);
  }

  private numero(clave: string, porDefecto: number): number {
    const n = Number(this.config.get<string>(clave));
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  }
}
