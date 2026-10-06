import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, SelectQueryBuilder } from 'typeorm';
import { Tarea, TareaStatus } from './tarea.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskTimeEntry } from './entities/task-time-entry.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';
import { AddTaskCommentDto, AddTaskTimeDto, SetTaskAssigneesDto, ReorderTareasDto } from './dto/task-ops.dto';
import { cleanText, normalizeText } from '../common/security/sanitize.helper';
import { TareasGateway } from './tareas.gateway';
import { NotificationsService } from '../notifications/notifications.service';

/** Identidad minima del actor, tal y como la inyecta el JWT. */
export interface TareaActor {
  id: string;
  role: string;
}

export interface TareaAssigneeOut {
  userId: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
}

export interface TareaItemOut {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  status: string;
  prioridad: string;
  parentTaskId: string | null;
  ticketId: string | null;
  ticketCodigo: string | null;
  ticketTitulo: string | null;
  moduloId: string | null;
  moduloNombre: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdByAvatarUrl: string | null;
  tags: string[];
  dueDate: string | null;
  reminderSentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeSpentMinutes: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  asignados: TareaAssigneeOut[];
  /** Subtitulos DIRECTOS. El rollup de todo el subarbol lo calcula el front. */
  subtareas: { total: number; completadas: number };
  /** Solo en la vista arbol. 0 = tarea raiz. */
  profundidad?: number;
  hijos?: TareaItemOut[];
}

/**
 * Normalizacion para busqueda insensible a acentos, hecha en SQL puro.
 *
 * `translate()` exige que ambos textos tengan la MISMA longitud: los caracteres
 * sobrantes en el primero se BORRAN. Por eso las dos cadenas son de 14, y no
 * vale la pena ampliarlas a la ligera.
 */
const NORMALIZA_SQL = `translate(lower(coalesce({col}, '')), 'áéíóúàâäôöçñüý', 'aeiouaaaaoocnuy')`;

/** Estados considered "abiertos" para los agregados del panel. */
/** Estados considerados "abiertos" para los agregados del panel. */
export interface TareaSerieDia {
  /** `YYYY-MM-DD` en hora local del servidor. */
  fecha: string;
  /** Etiqueta corta de eje: "Lun", "Mar"... */
  label: string;
  creadas: number;
  enProgreso: number;
  completadas: number;
  vencidas: number;
}

export interface TareaEstadisticas {
  porEstado: Record<string, number>;
  vencidas: number;
  hoy: number;
  sinAsignar: number;
  completadasSemana: number;
  minutosSemana: number;
  /** Minutos registrados en `task_time_entries` dentro de la semana en curso. */
  minutosRegistrados: number;
  carga: Array<{
    userId: string;
    nombre: string;
    avatarUrl: string | null;
    abiertas: number;
    completadas: number;
    minutos: number;
  }>;
  porModulo: Array<{ moduloId: string; nombre: string; total: number; completadas: number }>;
  /** Un punto por dia, del mas antiguo al mas reciente. Alimenta el grafico. */
  serie: TareaSerieDia[];
  /** Ventana en dias que representa `serie`. */
  dias: number;
}

@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);

  constructor(
    @InjectRepository(Tarea) private readonly repo: Repository<Tarea>,
    @InjectRepository(TaskAssignee) private readonly assigneeRepo: Repository<TaskAssignee>,
    @InjectRepository(TaskComment) private readonly commentRepo: Repository<TaskComment>,
    @InjectRepository(TaskTimeEntry) private readonly timeRepo: Repository<TaskTimeEntry>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly gateway: TareasGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // ────────────────────────────── VISIBILIDAD ──────────────────────────────

  /** admin y superadmin ven el tablero completo. */
  private veTodo(role: string): boolean {
    return role === 'admin' || role === 'superadmin';
  }

  /**
   * Conjunto de ids que el actor puede ver, o `null` si ve todas.
   *
   * Regla: una tarea es visible si la creo el actor o esta asignada a el. Una
   * SUBTAREA hereda la visibilidad de su tarea RAIZ, no la suya propia: si yo
   * no veo la raiz, tampoco veo el trabajo que cuelga de ella.
   *
   * Por eso el CTE arranca en las raices visibles y baja por `parent_task_id`.
   * Sin esto, asignarle una subtarea a alguien que no ve la raizfiltraria su
   * contenido y el arbol quedaria colgando de algo invisible.
   */
  private async idsVisibles(userId: string, role: string): Promise<Set<string> | null> {
    if (this.veTodo(role)) return null;

    const rows: Array<{ id: string }> = await this.repo.query(
      `WITH RECURSIVE raices AS (
         SELECT t.id
         FROM tasks t
         WHERE t.parent_task_id IS NULL
           AND (
             t.created_by_id = $1
             OR EXISTS (
               SELECT 1 FROM task_assignees a
               WHERE a.tarea_id = t.id AND a.user_id = $1
             )
           )
       ),
       arbol AS (
         SELECT id FROM raices
         UNION ALL
         SELECT t.id FROM tasks t JOIN arbol p ON t.parent_task_id = p.id
       )
       SELECT id FROM arbol`,
      [userId],
    );

    return new Set(rows.map((r) => r.id));
  }

  /** 404 (no 403) cuando no existe o no es visible: no revelamos la existencia. */
  private async assertAcceso(id: string, actor: TareaActor): Promise<Tarea> {
    const visibles = await this.idsVisibles(actor.id, actor.role);
    if (visibles && !visibles.has(id)) {
      throw new NotFoundException('Tarea no encontrada');
    }
    const tarea = await this.cargarConRelaciones(id);
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    return tarea;
  }

  // ──────────────────────────────── LISTADO ────────────────────────────────

  async findAll(
    query: QueryTareasDto,
    actor: TareaActor,
  ): Promise<{ items: TareaItemOut[]; total: number; page: number; resumen: Record<string, number> }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const visibles = await this.idsVisibles(actor.id, actor.role);
    if (visibles && visibles.size === 0) {
      return { items: [], total: 0, page, resumen: {} };
    }

    // 1) Count sobre el filtro completo.
    const total = await this.aplicarFiltros(
      this.repo.createQueryBuilder('t'),
      query,
      visibles,
    ).getCount();

    // 2) Solo los ids de la pagina. Paginar con un join a coleccion dentro de
    //    la misma query hace que TypeORM dedupe por id y el OFFSET deja de
    //    corresponder con lo que se ve. Separar los pasos lo evita.
    const raw = await this.aplicarOrden(
      this.aplicarFiltros(this.repo.createQueryBuilder('t'), query, visibles),
      query,
    )
      .select('t.id', 'id')
      .limit(limit)
      .offset((page - 1) * limit)
      .getRawMany<{ id: string }>();

    const ids = raw.map((r) => r.id);
    const items = await this.cargarPagina(ids);

    return { items, total, page, resumen: await this.resumen(query, actor) };
  }

  /**
   * Conteo por columna del kanban.
   *
   * Se aplican todos los filtros MENOS el de estado, para que cada columna
   * muestre cuanto trabajo hay en ella aunque el filtro activo sea otro.
   */
  private async resumen(
    query: QueryTareasDto,
    actor: TareaActor,
  ): Promise<Record<string, number>> {
    const visibles = await this.idsVisibles(actor.id, actor.role);
    if (visibles && visibles.size === 0) return {};

    const filas = await this.aplicarFiltros(
      this.repo.createQueryBuilder('t'),
      { ...query, status: undefined },
      visibles,
    )
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('t.status')
      .getRawMany<{ status: string; total: string }>();

    const out: Record<string, number> = {};
    for (const f of filas) out[f.status] = Number(f.total);
    return out;
  }

  /**
   * Orden de cada vista.
   *
   * Panel: lo vencido primero y lo mas urgente despues. En Postgres un
   * `ORDER BY ... ASC` ya coloca los NULL al final, asi que las tareas sin
   * fecha se quedan al final sin trabalho extra.
   *
   * Kanban y lista: manda el orden manual, que es lo que persiste el arrastre.
   */
  private aplicarOrden(qb: SelectQueryBuilder<Tarea>, q: QueryTareasDto) {
    if (q.vista === 'panel') {
      return qb
        .addOrderBy('t.due_date', 'ASC')
        .addOrderBy(
          `CASE t.prioridad
             WHEN 'critical' THEN 4
             WHEN 'high'     THEN 3
             WHEN 'medium'   THEN 2
             ELSE 1
           END`,
          'DESC',
        )
        .addOrderBy('t.created_at', 'DESC');
    }
    return qb.addOrderBy('t.order_index', 'ASC').addOrderBy('t.created_at', 'DESC');
  }

  private aplicarFiltros(
    qb: SelectQueryBuilder<Tarea>,
    query: QueryTareasDto,
    visibles: Set<string> | null,
  ): SelectQueryBuilder<Tarea> {
    if (visibles) {
      qb.andWhere('t.id = ANY(:visiblesIds)', { visiblesIds: [...visibles] });
    }

    if (query.status?.length) qb.andWhere('t.status IN (:...status)', { status: query.status });
    if (query.prioridad?.length) qb.andWhere('t.prioridad IN (:...prioridad)', { prioridad: query.prioridad });
    if (query.ticketId) qb.andWhere('t.ticket_id = :ticketId', { ticketId: query.ticketId });
    if (query.moduloId) qb.andWhere('t.modulo_id = :moduloId', { moduloId: query.moduloId });
    if (query.creadoPor) qb.andWhere('t.created_by_id = :creadoPor', { creadoPor: query.creadoPor });

    if (query.soloSinTicket) qb.andWhere('t.ticket_id IS NULL');
    if (query.soloRaiz) qb.andWhere('t.parent_task_id IS NULL');

    if (query.asignadoA) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM task_assignees a
                 WHERE a.tarea_id = t.id AND a.user_id = :asignadoA)`,
        { asignadoA: query.asignadoA },
      );
    }

    if (query.tags?.length) {
      // `tags` es jsonb: se busca la coincidencia exacta de cada etiqueta.
      qb.andWhere('t.tags ?| :tags', { tags: query.tags });
    }

    if (query.q?.trim()) {
      const term = `%${normalizeText(query.q.trim().toLowerCase())}%`;
      qb.andWhere(
        `(${NORMALIZA_SQL.replace('{col}', 't.titulo')} LIKE :q
          OR ${NORMALIZA_SQL.replace('{col}', 't.descripcion')} LIKE :q
          OR lower(t.codigo) LIKE :q)`,
        { q: term },
      );
    }

    return qb;
  }

  /** Carga una pagina de tareas con sus relaciones, en el orden pedido. */
  private async cargarPagina(ids: string[]): Promise<TareaItemOut[]> {
    if (!ids.length) return [];

    const tareas = await this.repo.find({
      where: { id: In(ids) },
      relations: {
        asignees: { user: true },
        ticket: true,
        modulo: true,
        createdBy: true,
      },
    });

    const porId = new Map(tareas.map((t) => [t.id, t]));
    const rollups = await this.rollupDirecto(ids);

    // `find` no garantiza el orden, asi que se reordena segun la pagina.
    return ids
      .map((id) => porId.get(id))
      .filter((t): t is Tarea => !!t)
      .map((t) => this.aItem(t, rollups.get(t.id) ?? { total: 0, completadas: 0 }));
  }

  /** Cuantas hijas directas tiene cada tarea y cuantas estan completadas. */
  private async rollupDirecto(
    ids: string[],
  ): Promise<Map<string, { total: number; completadas: number }>> {
    const out = new Map<string, { total: number; completadas: number }>();
    if (!ids.length) return out;

    const filas = await this.repo
      .createQueryBuilder('t')
      .select('t.parent_task_id', 'parent')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'completada')`, 'completadas')
      .where('t.parent_task_id IN (:...ids)', { ids })
      .groupBy('t.parent_task_id')
      .getRawMany<{ parent: string; total: string; completadas: string }>();

    for (const f of filas) {
      out.set(f.parent, { total: Number(f.total), completadas: Number(f.completadas) });
    }
    return out;
  }

  // ───────────────────────── DETALLE Y ARBOL ─────────────────────────

  async findOne(id: string, actor: TareaActor) {
    const tarea = await this.assertAcceso(id, actor);

    const [comentarios, tiempos, rollups] = await Promise.all([
      this.commentRepo.find({
        where: { tareaId: id },
        relations: { author: true },
        order: { createdAt: 'ASC' },
      }),
      this.timeRepo.find({
        where: { tareaId: id },
        order: { loggedAt: 'DESC' },
      }),
      this.rollupDirecto([id]),
    ]);

    const arbol = await this.subarbol(id, actor);

    return {
      ...this.aItem(tarea, rollups.get(id) ?? { total: 0, completadas: 0 }),
      comentarios: comentarios.map((c) => ({
        id: c.id,
        contenido: c.contenido,
        createdAt: c.createdAt,
        authorId: c.authorId,
        authorName: c.authorName ?? c.author?.name ?? 'Usuario',
        authorAvatarUrl: c.author?.profilePhotoUrl ?? null,
      })),
      tiempos: tiempos.map((t) => ({
        id: t.id,
        minutos: t.minutos,
        nota: t.nota,
        loggedAt: t.loggedAt,
        userId: t.userId,
        userName: t.userName ?? 'Usuario',
      })),
      /** Subarbol completo, anidado y con profundidad para la sangria. */
      arbol,
    };
  }

  /**
   * Todo el subarbol descendiente de `id`, ya anidado.
   *
   * El limite de 500 es de defensa: un arbol real no llega a eso, pero sin tope
   * un dato corrupto (parent en bucle por datos importados a mano) convertiria
   * el armado en recursion infinita.
   */
  private async subarbol(id: string, actor: TareaActor, limite = 500): Promise<TareaItemOut[]> {
    const filas: Array<{ id: string }> = await this.repo.query(
      // `desc` no sirve como nombre de CTE: es palabra reservada en Postgres
      // (orden descendente) y la consulta falla con "syntax error at or near desc".
      `WITH RECURSIVE descendientes AS (
         SELECT t.* FROM tasks t WHERE t.parent_task_id = $1
         UNION ALL
         SELECT t.* FROM tasks t JOIN descendientes d ON t.parent_task_id = d.id
       )
       SELECT id FROM descendientes LIMIT $2`,
      [id, limite],
    );

    if (!filas.length) return [];

    const ids = filas.map((r) => r.id);
    const tareas = await this.repo.find({
      where: { id: In(ids) },
      relations: { asignees: { user: true }, ticket: true, modulo: true, createdBy: true },
    });
    const rollups = await this.rollupDirecto(ids);
    const items = new Map<string, TareaItemOut & { parentKey: string | null }>();

    for (const t of tareas) {
      items.set(t.id, {
        ...this.aItem(t, rollups.get(t.id) ?? { total: 0, completadas: 0 }),
        parentKey: t.parentTaskId,
      });
    }

    // Se arma de abajo arriba: una hoja ya esta lista cuando llega su padre.
    const raices: Array<TareaItemOut & { parentKey: string | null }> = [];
    const index = new Map<string, TareaItemOut & { parentKey: string | null }>();
    for (const n of items.values()) index.set(n.id, n);

    const sorted = [...items.values()].sort(
      (a, b) => (b.orderIndex ?? 0) - (a.orderIndex ?? 0),
    );

    for (const n of sorted) n.hijos = [];

    for (const n of sorted) {
      const parent = n.parentKey ? index.get(n.parentKey) : undefined;
      if (parent) parent.hijos!.push(n);
      else raices.push(n);
    }

    this.calcularProfundidad(raices, 1);

    // El `parentKey` es interno del armado: no sale al cliente.
    const limpiar = (ns: Array<TareaItemOut & { parentKey?: string | null }>): TareaItemOut[] =>
      ns.map(({ parentKey: _omitir, ...rest }) => ({
        ...rest,
        hijos: rest.hijos?.length ? limpiar(rest.hijos as never[]) : undefined,
      }));

    return limpiar(raices);
  }

  private calcularProfundidad(
    nodos: Array<TareaItemOut & { parentKey?: string | null }>,
    base: number,
  ): void {
    for (const n of nodos) {
      n.profundidad = base;
      if (n.hijos?.length) this.calcularProfundidad(n.hijos as never[], base + 1);
    }
  }

  /**
   * Agregados del panel.
   *
   * Se calculan sobre el conjunto visible COMPLETO, no sobre la pagina que hay
   * en pantalla: un tablero paginado no puede usarse para contar. Por eso son
   * consultas agrupadas propias y no una suma en el cliente.
   */
  async estadisticas(actor: TareaActor, dias = 7): Promise<TareaEstadisticas> {
    const visibles = await this.idsVisibles(actor.id, actor.role);

    const base = () => {
      const qb = this.repo.createQueryBuilder('t').where('1 = 1');
      if (visibles) qb.andWhere('t.id = ANY(:visiblesIds)', { visiblesIds: [...visibles] });
      return qb;
    };

    const ACTIVAS = ['pendiente', 'en_progreso', 'bloqueada', 'revision'];
    const ahora = new Date();
    const manana = new Date(ahora.getTime() + 24 * 3600_000);
    // Lunes 00:00 de la semana en curso, en hora local del servidor.
    const lunes = new Date(ahora);
    lunes.setHours(0, 0, 0, 0);
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));

    const porEstado = await base()
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('t.status')
      .getRawMany<{ status: string; total: string }>();

    const [tarjetas, sinAsignar, completadasSemana, minutosSemana] = await Promise.all([
      base()
        .select('COUNT(*)', 'total')
        .andWhere('t.status IN (:...activas)', { activas: ACTIVAS })
        .andWhere('t.due_date IS NOT NULL')
        .andWhere('t.due_date < :ahora', { ahora })
        .getRawOne<{ total: string }>(),

      base()
        .select('COUNT(*)', 'total')
        .andWhere('t.status IN (:...activas)', { activas: ACTIVAS })
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.tarea_id = t.id)`,
        )
        .getRawOne<{ total: string }>(),

      base()
        .select('COUNT(*)', 'total')
        .andWhere('t.status = :done', { done: 'completada' })
        .andWhere('t.completed_at >= :lunes', { lunes })
        .getRawOne<{ total: string }>(),

      base()
        .select('COALESCE(SUM(t.time_spent_minutes), 0)', 'total')
        .andWhere('t.status IN (:...activas)', { activas: ACTIVAS })
        .getRawOne<{ total: string }>(),
    ]);

    // Vencen hoy: dentro de las proximas 24h y todavia no cumplidas.
    const hoy = await base()
      .select('COUNT(*)', 'total')
      .andWhere('t.status IN (:...activas)', { activas: ACTIVAS })
      .andWhere('t.due_date IS NOT NULL')
      .andWhere('t.due_date >= :ahora AND t.due_date < :manana', { ahora, manana })
      .getRawOne<{ total: string }>();

    const carga = await this.cargaPorResponsable(visibles, ACTIVAS);
    const porModulo = await this.tareasPorModulo(visibles);
    const [minutosRegistrados, serie] = await Promise.all([
      this.minutosRegistradosSemana(visibles, lunes),
      this.serieDiaria(visibles, ACTIVAS, dias),
    ]);

    return {
      porEstado: Object.fromEntries(porEstado.map((r) => [r.status, Number(r.total)])),
      vencidas: Number(tarjetas?.total ?? 0),
      hoy: Number(hoy?.total ?? 0),
      sinAsignar: Number(sinAsignar?.total ?? 0),
      completadasSemana: Number(completadasSemana?.total ?? 0),
      minutosSemana: Number(minutosSemana?.total ?? 0),
      minutosRegistrados,
      carga,
      porModulo,
      serie,
      dias,
    };
  }

  /**
   * Minutos realmente registrados en la semana, desde `task_time_entries`.
   *
   * `minutosSemana` suma el acumulado de las tareas abiertas, que es otra
   * cosa: ese total no dice cuando se trabajo. Para el KPI "Tiempo registrado"
   * hace falta la bitacora.
   */
  private async minutosRegistradosSemana(
    visibles: Set<string> | null,
    lunes: Date,
  ): Promise<number> {
    const qb = this.timeRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.minutos), 0)', 'total')
      .where('e.logged_at >= :lunes', { lunes });

    if (visibles) {
      const ids = [...visibles];
      if (!ids.length) return 0;
      qb.andWhere('e.tarea_id IN (:...ids)', { ids });
    }

    const fila = await qb.getRawOne<{ total: string }>();
    return Number(fila?.total ?? 0);
  }

  /**
   * Serie diaria para el grafico de actividad.
   *
   * Cada serie usa la fecha que le corresponde a su propio hecho, no una foto
   * del estado actual: creadas por `created_at`, en progreso por `started_at`,
   * completadas por `completed_at` y vencidas por `due_date`. Asi el grafico
   * cuenta trabajo real de cada dia en vez de inventar un historico.
   */
  private async serieDiaria(
    visibles: Set<string> | null,
    activas: string[],
    dias: number,
  ): Promise<TareaSerieDia[]> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - (dias - 1));

    // Zona del servidor, no una fija: el grafico tiene que agrupar en los mismos
    // dias que ve el usuario. Sin esto, Postgres (que corre en UTC) correria los
    // dias de las tareas creadas por la noche.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const porDia = (columna: string, filtro?: (qb: SelectQueryBuilder<Tarea>) => void) => {
      const dia = `to_char(${columna} AT TIME ZONE :tz, 'YYYY-MM-DD')`;
      const qb = this.repo
        .createQueryBuilder('t')
        .select(dia, 'fecha')
        .addSelect('COUNT(*)', 'total')
        .setParameter('tz', tz)
        .where(`${columna} >= :desde`, { desde })
        .andWhere(`${columna} < :manana`, { manana: new Date(hoy.getTime() + 86_400_000) });

      if (visibles) {
        const ids = [...visibles];
        if (!ids.length) return Promise.resolve(new Map<string, number>());
        qb.andWhere('t.id IN (:...ids)', { ids });
      }
      if (filtro) filtro(qb);

      return qb
        .groupBy(dia)
        .getRawMany<{ fecha: string; total: string }>()
        .then((filas) => new Map(filas.map((f) => [f.fecha, Number(f.total)])));
    };

    const [creadas, enProgreso, completadas, vencidas] = await Promise.all([
      porDia('t.created_at'),
      porDia('t.started_at'),
      porDia('t.completed_at'),
      porDia('t.due_date', (qb) => {
        qb.andWhere('t.status IN (:...activas)', { activas }).andWhere('t.due_date < NOW()');
      }),
    ]);

    const ETIQUETAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const out: TareaSerieDia[] = [];

    for (let i = 0; i < dias; i++) {
      const d = new Date(desde);
      d.setDate(desde.getDate() + i);
      const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      out.push({
        fecha,
        label: ETIQUETAS[d.getDay()],
        creadas: creadas.get(fecha) ?? 0,
        enProgreso: enProgreso.get(fecha) ?? 0,
        completadas: completadas.get(fecha) ?? 0,
        vencidas: vencidas.get(fecha) ?? 0,
      });
    }

    return out;
  }

  /** Activas por persona: cuantas lleva y cuanto tiempo registrado tiene. */
  private async cargaPorResponsable(
    visibles: Set<string> | null,
    activas: string[],
  ): Promise<Array<{ userId: string; nombre: string; avatarUrl: string | null; abiertas: number; completadas: number; minutos: number }>> {
    // Sin un WHERE de estado: cada metrica se cuenta con su propio FILTER, asi
    // se puede mostrar "completadas" y "en proceso" de la misma persona. Con un
    // filtro de activas en el WHERE las completadas serian siempre 0.
    const qb = this.assigneeRepo
      .createQueryBuilder('a')
      .innerJoin('a.user', 'u')
      .innerJoin(Tarea, 't', 't.id = a.tarea_id')
      .select('a.user_id', 'userId')
      .addSelect('u.name', 'nombre')
      .addSelect('u.profile_photo_url', 'avatarUrl')
      .addSelect(`COUNT(*) FILTER (WHERE t.status IN (:...activas))`, 'abiertas')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'completada')`, 'completadas')
      .addSelect(
        `COALESCE(SUM(t.time_spent_minutes) FILTER (WHERE t.status IN (:...activas)), 0)`,
        'minutos',
      )
      .groupBy('a.user_id')
      .addGroupBy('u.name')
      .addGroupBy('u.profile_photo_url')
      .orderBy('abiertas', 'DESC')
      .addOrderBy('completadas', 'DESC')
      .limit(8)
      // `activas` solo aparece dentro de los FILTER del SELECT, asi que no hay
      // ningun where que lo registre: sin esto `:...activas` llega literal a
      // Postgres y la consulta muere con "syntax error at or near :".
      .setParameter('activas', activas);

    if (visibles) qb.andWhere('t.id = ANY(:visiblesIds)', { visiblesIds: [...visibles] });

    const filas = await qb.getRawMany<{
      userId: string;
      nombre: string;
      avatarUrl: string | null;
      abiertas: string;
      completadas: string;
      minutos: string;
    }>();

    return filas.map((f) => ({
      userId: f.userId,
      nombre: f.nombre,
      avatarUrl: f.avatarUrl ?? null,
      abiertas: Number(f.abiertas),
      completadas: Number(f.completadas),
      minutos: Number(f.minutos),
    }));
  }

  private async tareasPorModulo(
    visibles: Set<string> | null,
  ): Promise<Array<{ moduloId: string; nombre: string; total: number; completadas: number }>> {
    const qb = this.repo
      .createQueryBuilder('t')
      .innerJoin('t.modulo', 'm')
      .select('t.modulo_id', 'moduloId')
      .addSelect('m.nombre', 'nombre')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'completada')`, 'completadas')
      .groupBy('t.modulo_id')
      .addGroupBy('m.nombre')
      .orderBy('COUNT(*)', 'DESC')
      .limit(8);

    if (visibles) qb.andWhere('t.id = ANY(:visiblesIds)', { visiblesIds: [...visibles] });

    const filas = await qb.getRawMany<{
      moduloId: string;
      nombre: string;
      total: string;
      completadas: string;
    }>();

    return filas.map((f) => ({
      moduloId: f.moduloId,
      nombre: f.nombre,
      total: Number(f.total),
      completadas: Number(f.completadas),
    }));
  }

  /** Barras de progreso del detalle de un ticket: todo el subarbol cuenta. */
  async progresoTicket(
    ticketId: string,
    actor: TareaActor,
  ): Promise<{ total: number; completadas: number; porcentaje: number }> {
    const visibles = await this.idsVisibles(actor.id, actor.role);
    if (visibles && visibles.size === 0) {
      return { total: 0, completadas: 0, porcentaje: 0 };
    }

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.ticket_id = :ticketId', { ticketId })
      .andWhere(`t.status <> 'cancelada'`);

    if (visibles) qb.andWhere('t.id = ANY(:visiblesIds)', { visiblesIds: [...visibles] });

    const fila = await qb
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'completada')`, 'completadas')
      .getRawOne<{ total: string; completadas: string }>();

    const total = Number(fila?.total ?? 0);
    const completadas = Number(fila?.completadas ?? 0);

    return {
      total,
      completadas,
      porcentaje: total ? Math.round((completadas / total) * 100) : 0,
    };
  }

  // ───────────────────────────── ESCRITURAS ─────────────────────────────

  private async generarCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TSK-${year}-`;
    const last = await this.repo.findOne({
      where: { codigo: Like(`${prefix}%`) },
      order: { codigo: 'DESC' },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.codigo.slice(prefix.length), 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  /**
   * Etiquetas canonicas: sin `#`, sin duplicados que solo difieran en mayuscula,
   * recortadas a 40 caracteres y topadas a 20 por tarea.
   */
  private normalizarTags(tags?: string[]): string[] {
    if (!tags?.length) return [];
    const vistos = new Map<string, string>();
    for (const raw of tags) {
      const t = cleanText(String(raw ?? '').replace(/^#+/, ''), 40).trim();
      if (!t) continue;
      const clave = t.toLowerCase();
      if (!vistos.has(clave)) vistos.set(clave, t);
      if (vistos.size >= 20) break;
    }
    return [...vistos.values()];
  }

  private parseDueDate(v?: string | null): Date | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new BadRequestException('Fecha de vencimiento invalida');
    return d;
  }

  async create(dto: CreateTareaDto, actor: TareaActor): Promise<TareaItemOut> {
    // El padre debe existir Y ser visible. Si el padre es una subtarea propia de
    // otro, se acepta: el anidamiento es arbitrario.
    if (dto.parentTaskId) {
      await this.assertAcceso(dto.parentTaskId, actor);
    }
    if (dto.ticketId) {
      await this.assertTicket(dto.ticketId);
    }

    const MAX_REINTENTOS = 5;
    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
      try {
        return await this.crearUna(dto, actor);
      } catch (err: any) {
        const duplicado = err?.code === '23505' || err?.message?.includes?.('duplicate key');
        if (!duplicado || intento === MAX_REINTENTOS) {
          if (duplicado) {
            throw new ConflictException('El codigo de la tarea ya existe. Intenta de nuevo.');
          }
          throw err;
        }
      }
    }
    throw new ConflictException('No se pudo generar un codigo de tarea libre');
  }

  private async crearUna(dto: CreateTareaDto, actor: TareaActor): Promise<TareaItemOut> {
    const autor = await this.userRepo.findOneBy({ id: actor.id });
    const status = (dto.status ?? 'pendiente') as TareaStatus;

    const tarea = this.repo.create({
      codigo: await this.generarCodigo(),
      titulo: cleanText(dto.titulo, 255),
      descripcion: dto.descripcion ? cleanText(dto.descripcion, 10000) : null,
      status,
      prioridad: (dto.prioridad ?? 'medium') as Tarea['prioridad'],
      parentTaskId: dto.parentTaskId ?? null,
      ticketId: dto.ticketId ?? null,
      moduloId: dto.moduloId ?? null,
      createdById: actor.id,
      createdByName: autor?.name ?? null,
      tags: this.normalizarTags(dto.tags),
      dueDate: this.parseDueDate(dto.dueDate) ?? null,
      startedAt: status === 'en_progreso' ? new Date() : null,
      orderIndex: await this.siguienteOrden(status, dto.parentTaskId ?? null),
    });

const saved = await this.repo.save(tarea);
    await this.reemplazarAsignados(saved.id, dto.asignados ?? [actor.id], actor.id);
    await this.avisarAsignados(saved, dto.asignados ?? [actor.id], actor);

    this.gateway.broadcastTareaEvent('tarea:created', { id: saved.id, codigo: saved.codigo });
    return (await this.findOne(saved.id, actor)) as TareaItemOut;
  }

  private async assertTicket(ticketId: string): Promise<void> {
    const existe = await this.repo.manager.query('SELECT 1 FROM tickets WHERE id = $1 LIMIT 1', [
      ticketId,
    ]);
    if (!existe?.length) throw new NotFoundException('Ticket no encontrado');
  }

  /** Ultimo `order_index` + 1 dentro del mismo grupo de hermanos. */
  private async siguienteOrden(status: string, parentTaskId: string | null): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('t')
      .select('MAX(t.order_index)', 'max')
      .where('t.status = :status', { status });
    if (parentTaskId) qb.andWhere('t.parent_task_id = :p', { p: parentTaskId });
    else qb.andWhere('t.parent_task_id IS NULL');

    const fila = await qb.getRawOne<{ max: string | null }>();
    const max = Number(fila?.max ?? 0);
    return (isNaN(max) ? 0 : max) + 1;
  }

  async update(id: string, dto: UpdateTareaDto, actor: TareaActor): Promise<TareaItemOut> {
    const tarea = await this.assertAcceso(id, actor);
    const antes = {
      status: tarea.status,
      prioridad: tarea.prioridad,
      titulo: tarea.titulo,
      asignados: tarea.asignees.map((a) => a.userId),
    };

    if (dto.titulo !== undefined) tarea.titulo = cleanText(dto.titulo, 255);
    if (dto.descripcion !== undefined) {
      tarea.descripcion = dto.descripcion ? cleanText(dto.descripcion, 10000) : null;
    }
    if (dto.prioridad !== undefined) tarea.prioridad = dto.prioridad as Tarea['prioridad'];
    if (dto.moduloId !== undefined) tarea.moduloId = dto.moduloId;

    if (dto.ticketId !== undefined) {
      if (dto.ticketId) await this.assertTicket(dto.ticketId);
      tarea.ticketId = dto.ticketId;
    }

    if (dto.tags !== undefined) tarea.tags = this.normalizarTags(dto.tags);

    if (dto.dueDate !== undefined) {
      const due = this.parseDueDate(dto.dueDate);
      tarea.dueDate = due ?? null;
      // Reprogramar limpia el antirrebote para que la nueva fecha pueda avisar.
      if (due) tarea.reminderSentAt = null;
    }

    if (dto.resetReminder === 'true') tarea.reminderSentAt = null;

    if (dto.status !== undefined && dto.status !== tarea.status) {
      this.aplicarTransicion(tarea, dto.status as TareaStatus, actor);
    }

    await this.repo.save(tarea);

    let nuevosAsignados: string[] | null = null;
    if (dto.asignados !== undefined) {
      await this.reemplazarAsignados(id, dto.asignados, actor.id);
      nuevosAsignados = dto.asignados;
      await this.avisarAsignados(
        tarea,
        dto.asignados.filter((u) => !antes.asignados.includes(u)),
        actor,
        true,
      );
    }

    if (antes.status !== tarea.status) {
      this.gateway.broadcastTareaEvent('tarea:updated', { id, status: tarea.status });
      await this.avisarCambioDeEstado(tarea, antes, actor, nuevosAsignados);
    } else if (antes.prioridad !== tarea.prioridad) {
      this.gateway.broadcastTareaEvent('tarea:updated', { id, prioridad: tarea.prioridad });
    } else {
      this.gateway.broadcastTareaEvent('tarea:updated', { id });
    }

    return (await this.findOne(id, actor)) as TareaItemOut;
  }

  /** Keeps `started_at`, `completed_at` y `completed_by_id` coherentes. */
  private aplicarTransicion(tarea: Tarea, nuevo: TareaStatus, actor: TareaActor): void {
    tarea.status = nuevo;

    if (nuevo === 'en_progreso' && !tarea.startedAt) {
      tarea.startedAt = new Date();
    }

    if (nuevo === 'completada') {
      tarea.completedAt = new Date();
      tarea.completedById = actor.id;
    } else {
      // Salir de completada (hacia cancelada incluida) limpia la marca.
      tarea.completedAt = null;
      tarea.completedById = null;
    }
  }

  /**
   * Borra la tarea y su subarbol entero (CASCADE en BD).
   *
   * Devuelve cuantas hijas se van con ella para que el dialogo del front pueda
   * advertirlo antes de que el usuario confirme.
   */
  async remove(
    id: string,
    actor: TareaActor,
  ): Promise<{ eliminadas: number; descendientes: number }> {
    const tarea = await this.assertAcceso(id, actor);

    const [{ count }] = await this.repo.query(
      `WITH RECURSIVE descendientes AS (
         SELECT t.id FROM tasks t WHERE t.parent_task_id = $1
         UNION ALL
         SELECT t.id FROM tasks t JOIN descendientes d ON t.parent_task_id = d.id
       )
       SELECT COUNT(*)::int AS count FROM descendientes`,
      [id],
    );

    await this.repo.delete(id);

    // A los responsables se les avisa, pero la tarea ya no existe: el evento
    // lleva el codigo para que el cliente pueda resolver la referencia.
    const Titulo = tarea.titulo;
    for (const uid of new Set([...tarea.asignees.map((a) => a.userId), tarea.createdById].filter(Boolean) as string[])) {
      if (uid === actor.id) continue;
      await this.notificar(uid, 'tarea_actualizada', {
        title: `Tarea ${tarea.codigo} eliminada`,
        message: `Se elimino la tarea "${Titulo}".`,
        entityId: tarea.id,
        entityCodigo: tarea.codigo,
        meta: { eliminada: true, codigo: tarea.codigo },
      });
    }

    this.gateway.broadcastTareaEvent('tarea:deleted', { id, codigo: tarea.codigo });

    return { eliminadas: 1, descendientes: Number(count ?? 0) };
  }

  // ───────────────────────── RESPONSABLES ─────────────────────────

  async setAssignees(
    id: string,
    dto: SetTaskAssigneesDto,
    actor: TareaActor,
  ): Promise<TareaItemOut> {
    const tarea = await this.assertAcceso(id, actor);
    const antes = new Set(tarea.asignees.map((a) => a.userId));

    await this.reemplazarAsignados(id, dto.userIds, actor.id);
    const nuevos = dto.userIds.filter((u) => !antes.has(u));

    await this.avisarAsignados(tarea, nuevos, actor, true);
    this.gateway.broadcastTareaEvent('tarea:updated', { id });

    return (await this.findOne(id, actor)) as TareaItemOut;
  }

  private async reemplazarAsignados(
    tareaId: string,
    userIds: string[],
    asignadoPorId: string,
  ): Promise<void> {
    const unicos = [...new Set(userIds.filter(Boolean))];

    if (unicos.length) {
      const existentes = await this.userRepo.find({
        where: { id: In(unicos) },
        select: { id: true, role: true },
      });
      // El workspace es de desarrollo: un asesor no puede llevar una tarea.
      const aptos = existentes.filter((u) => u.role === 'desarrollador' || u.role === 'admin' || u.role === 'superadmin');
      const descartados = unicos.length - aptos.length;
      if (descartados) {
        this.logger.warn(
          `Se descartaron ${descartados} responsable(s) no aptos en la tarea ${tareaId}.`,
        );
      }
      await this.assigneeRepo.delete({ tareaId });
      if (aptos.length) {
        await this.assigneeRepo.save(
          aptos.map((u) =>
            this.assigneeRepo.create({ tareaId, userId: u.id, asignadoPorId }),
          ),
        );
      }
    } else {
      await this.assigneeRepo.delete({ tareaId });
    }
  }

  // ──────────────────────── COMENTARIOS Y TIEMPO ────────────────────────

  async addComment(
    id: string,
    dto: AddTaskCommentDto,
    actor: TareaActor,
  ): Promise<{ id: string; contenido: string; createdAt: string; authorId: string; authorName: string; authorAvatarUrl: string | null }> {
    const tarea = await this.assertAcceso(id, actor);
    const autor = await this.userRepo.findOneBy({ id: actor.id });

    const comentario = await this.commentRepo.save(
      this.commentRepo.create({
        tareaId: id,
        authorId: actor.id,
        authorName: autor?.name ?? null,
        contenido: cleanText(dto.contenido, 5000),
      }),
    );

    // A quien le interesa: responsables y autor, menos quien escribe.
    const targets = new Set<string>([
      ...tarea.asignees.map((a) => a.userId),
      tarea.createdById ?? '',
    ]);
    targets.delete(actor.id);

    for (const uid of targets) {
      if (!uid) continue;
      this.gateway.sendToUser(uid, 'tarea:comentario', { tareaId: id });
await this.notificar(uid, 'tarea_comentario', {
        title: `Comentario en ${tarea.codigo}`,
        message: `${autor?.name ?? 'Alguien'} comento en "${tarea.titulo}".`,
        entityId: tarea.id,
        entityCodigo: tarea.codigo,
        senderId: actor.id,
        meta: { tareaId: tarea.id, codigo: tarea.codigo },
      });
    }

    return {
      id: comentario.id,
      contenido: comentario.contenido,
      createdAt: comentario.createdAt.toISOString(),
      authorId: actor.id,
      authorName: autor?.name ?? 'Usuario',
      authorAvatarUrl: autor?.profilePhotoUrl ?? null,
    };
  }

  async addTime(
    id: string,
    dto: AddTaskTimeDto,
    actor: TareaActor,
  ): Promise<{ minutos: number; totalMinutos: number }> {
    await this.assertAcceso(id, actor);
    const autor = await this.userRepo.findOneBy({ id: actor.id });

    await this.timeRepo.save(
      this.timeRepo.create({
        tareaId: id,
        userId: actor.id,
        userName: autor?.name ?? null,
        minutos: dto.minutos,
        nota: dto.nota ? cleanText(dto.nota, 300) : null,
      }),
    );

    await this.repo.increment({ id }, 'timeSpentMinutes', dto.minutos);
    this.gateway.broadcastTareaEvent('tarea:updated', { id, tiempo: dto.minutos });

    const actual = await this.repo.findOne({ where: { id }, select: { timeSpentMinutes: true } });
    return { minutos: dto.minutos, totalMinutos: actual?.timeSpentMinutes ?? 0 };
  }

  async removeTime(id: string, entryId: string, actor: TareaActor) {
    await this.assertAcceso(id, actor);

    const entry = await this.timeRepo.findOneBy({ id: entryId, tareaId: id });
    if (!entry) throw new NotFoundException('Registro de tiempo no encontrado');

    await this.timeRepo.delete(entryId);
    // Nunca por debajo de cero, aunque el historico quedara inconsistente.
    const resta = Math.min(entry.minutos, await this.totalTiempo(id));
    await this.repo.decrement({ id }, 'timeSpentMinutes', resta);
    this.gateway.broadcastTareaEvent('tarea:updated', { id });

    return { totalMinutos: await this.totalTiempo(id) };
  }

  private async totalTiempo(tareaId: string): Promise<number> {
    const tarea = await this.repo.findOne({ where: { id: tareaId }, select: { timeSpentMinutes: true } });
    return tarea?.timeSpentMinutes ?? 0;
  }

  // ───────────────────────────── KANBAN ─────────────────────────────

  /**
   * Persiste el orden de una columna.
   *
   * Solo reordena: el `status` se valida contra cada tarea y, si alguna no
   * pertenece a la columna, se rechaza la operacion entera. Mover entre columnas
   * es un cambio de estado y va por `PATCH /tareas/:id`.
   */
  async reorder(dto: ReorderTareasDto, actor: TareaActor): Promise<{ ok: true }> {
    const visibles = await this.idsVisibles(actor.id, actor.role);
    if (!dto.orden.length) return { ok: true };

    const tareas = await this.repo.find({
      where: { id: In(dto.orden) },
      select: { id: true, status: true, parentTaskId: true },
    });

    if (tareas.length !== dto.orden.length) {
      throw new BadRequestException('La lista contiene tareas que no existen');
    }

    const fueraDeEstado = tareas.filter((t) => t.status !== dto.status);
    if (fueraDeEstado.length) {
      throw new BadRequestException(
        'Alguna tarea ya no esta en esa columna. Recarga el tablero e intentalo de nuevo.',
      );
    }

    const fueraDePadre = tareas.filter(
      (t) => (t.parentTaskId ?? null) !== (dto.parentTaskId ?? null),
    );
    if (fueraDePadre.length) {
      throw new BadRequestException('Solo se reordena entre tareas hermanas');
    }

    const fueraDeVista = tareas.filter((t) => visibles && !visibles.has(t.id));
    if (fueraDeVista.length) {
      throw new NotFoundException('Alguna tarea no existe o no es visible');
    }

    // indices 1..n para que un `order_index` de 0 no colisione al reordenar.
    await this.repo.manager.transaction(async (m) => {
      for (let i = 0; i < dto.orden.length; i++) {
        await m.update(Tarea, dto.orden[i], { orderIndex: i + 1 });
      }
    });

    this.gateway.broadcastTareaEvent('tareas:reordenadas', { status: dto.status });
    return { ok: true };
  }

  // ─────────────────────────── NOTIFICACIONES ───────────────────────────

  private async notificar(
    recipientId: string,
    type: string,
    p: {
      title: string;
      message: string;
      /** Id de la TAREA, no del destinatario: la campana navega con el. */
      entityId: string;
      entityCodigo?: string;
      senderId?: string;
      meta?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      await this.notifications.create({
        type,
        title: p.title,
        message: p.message,
        entityType: 'tarea',
        entityId: p.entityId,
        recipientId,
        senderId: p.senderId,
        entityCodigo: p.entityCodigo,
        meta: p.meta,
      });
    } catch (err: any) {
      // Una notificacion fallida no puede tumbar la escritura que la origino.
      this.logger.warn(`No se pudo notificar a ${recipientId}: ${err?.message ?? err}`);
    }
  }

  private async avisarAsignados(
    tarea: Tarea,
    userIds: string[],
    actor: TareaActor,
    soloNuevos = false,
  ): Promise<void> {
    const targets = new Set(userIds.filter((u) => u && u !== actor.id));
    if (!targets.size) return;

    const autor = actor.id === tarea.createdById ? null : tarea.createdByName;
    for (const uid of targets) {
      await this.notificar(uid, 'tarea_asignada', {
        title: `Te asignaron ${tarea.codigo}`,
        message: `${autor ?? 'Un administrador'} te asigno "${tarea.titulo}".`,
        entityId: tarea.id,
        entityCodigo: tarea.codigo,
        senderId: actor.id,
        meta: { tareaId: tarea.id, codigo: tarea.codigo, soloNuevos },
      });
    }
  }

  private async avisarCambioDeEstado(
    tarea: Tarea,
    antes: { status: string },
    actor: TareaActor,
    nuevosAsignados: string[] | null,
  ): Promise<void> {
    const targets = new Set<string>([
      ...tarea.asignees.map((a) => a.userId),
      tarea.createdById ?? '',
      ...(nuevosAsignados ?? []),
    ]);
    targets.delete(actor.id);

    const completada = tarea.status === 'completada';
    for (const uid of targets) {
      if (!uid) continue;
      await this.notificar(
        uid,
        completada ? 'tarea_completada' : 'tarea_actualizada',
        {
          title: completada ? `Completaste ${tarea.codigo}` : `${tarea.codigo}: ${antes.status} → ${tarea.status}`,
          message: `"${tarea.titulo}" paso de ${antes.status} a ${tarea.status}.`,
          entityId: tarea.id,
          entityCodigo: tarea.codigo,
          senderId: actor.id,
          meta: { tareaId: tarea.id, codigo: tarea.codigo, status: tarea.status },
        },
      );
    }
  }

  // ─────────────────────────────── SERIALIZACION ───────────────────────────────

  private aItem(t: Tarea, rollup: { total: number; completadas: number }): TareaItemOut {
    return {
      id: t.id,
      codigo: t.codigo,
      titulo: t.titulo,
      descripcion: t.descripcion ?? null,
      status: t.status,
      prioridad: t.prioridad,
      parentTaskId: t.parentTaskId ?? null,
      ticketId: t.ticketId ?? null,
      ticketCodigo: t.ticket?.codigo ?? null,
      ticketTitulo: t.ticket?.titulo ?? null,
      moduloId: t.moduloId ?? null,
      moduloNombre: t.modulo?.nombre ?? null,
      createdById: t.createdById ?? null,
      createdByName: t.createdByName ?? t.createdBy?.name ?? null,
      createdByAvatarUrl: t.createdBy?.profilePhotoUrl ?? null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      dueDate: t.dueDate?.toISOString() ?? null,
      reminderSentAt: t.reminderSentAt?.toISOString() ?? null,
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      timeSpentMinutes: t.timeSpentMinutes ?? 0,
      orderIndex: t.orderIndex ?? 0,
      createdAt: t.createdAt?.toISOString() ?? '',
      updatedAt: t.updatedAt?.toISOString() ?? '',
      asignados: (t.asignees ?? []).map((a) => ({
        userId: a.userId,
        nombre: a.user?.name ?? 'Usuario',
        email: a.user?.email ?? '',
        avatarUrl: a.user?.profilePhotoUrl ?? null,
      })),
      subtareas: rollup,
    };
  }

  private async cargarConRelaciones(id: string): Promise<Tarea | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        asignees: { user: true },
        ticket: true,
        modulo: true,
        createdBy: true,
        completedBy: true,
      },
    });
  }
}