import { Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as crypto from 'crypto';
import { Session } from './entities/session.entity';
import { User } from 'src/auth/entities/user.entity';
import { Message } from '../chat/entities/message.entity';
import { Colegio } from './entities/colegio.entity';
import { Rating } from './entities/rating.entity';

@Injectable()
export class SessionsService {
  private readonly CACHE_PREFIX = 'sessions:';
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    @InjectRepository(Rating) private readonly ratingRepo: Repository<Rating>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async invalidateCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        await this.cache.del(`${this.CACHE_PREFIX}${pattern}`);
      } else {
        await this.cache.del(`${this.CACHE_PREFIX}metrics`);
        await this.cache.del(`${this.CACHE_PREFIX}advisors`);
        await this.cache.del(`${this.CACHE_PREFIX}ranking`);
      }
    } catch {}
  }

  private generarCodigo(): string {
    const year = new Date().getFullYear();
    const rand = crypto
      .randomBytes(3)
      .toString('base64url')
      .toUpperCase()
      .slice(0, 4);
    return `RC-${year}-${rand}`;
  }

  // ── Crear sesión ──────────────────────────────────────────────────────────
  // El estado inicial es 'ai': el cliente habla con el asistente virtual.
  // NO se pone en 'waiting' hasta que el cliente o la IA soliciten un asesor.
  // Esto evita que el gateway intente asignar un asesor prematuramente.
  async create(data: {
    clientName: string;
    identificacion: string;
    apellido: string;
    rol: string;
    colegio?: string;
    colegioLink?: string | null;
    email?: string | null;
    celular?: string | null;
    tipoSolicitud: string;
  }): Promise<Session> {
    let codigo = this.generarCodigo();
    let exists = await this.sessionRepo.findOneBy({ codigo });
    while (exists) {
      codigo = this.generarCodigo();
      exists = await this.sessionRepo.findOneBy({ codigo });
    }
    const session = this.sessionRepo.create({
      clientName: data.clientName,
      identificacion: data.identificacion,
      apellido: data.apellido,
      rol: data.rol,
      colegio: data.colegio ?? '',
      colegioLink: data.colegioLink,
      email: data.email,
      celular: data.celular,
      tipoSolicitud: data.tipoSolicitud,
      codigo,
      status: 'ai',
    });
    return this.sessionRepo.save(session);
  }

  async findCodigo(sessionId: string): Promise<{ codigo: string }> {
    const session = await this.findOne(sessionId);
    if (!session.codigo) {
      const year = new Date().getFullYear();
      const rand = crypto
        .randomBytes(3)
        .toString('base64url')
        .toUpperCase()
        .slice(0, 4);
      session.codigo = `RC-${year}-${rand}`;
      await this.sessionRepo.save(session);
    }
    return { codigo: session.codigo };
  }

  // ── Solicitar asesor ──────────────────────────────────────────────────────
  // Cambia el estado de 'ai' a 'waiting' cuando el cliente decide hablar
  // con un humano. A partir de este momento el gateway puede asignarle asesor.
  // Si la sesión no está en estado 'ai', no hace nada (idempotente).
  async requestAdvisor(sessionId: string): Promise<Session> {
    const session = await this.findOne(sessionId);
    if (session.status !== 'ai') return session; // ya está en waiting/active/closed
    session.status = 'waiting';
    return this.sessionRepo.save(session);
  }

  // Agregar este método al SessionsService
  async takeOver(sessionId: string, newAdvisorId: string): Promise<Session> {
    const session = await this.findOne(sessionId);
    if (session.status !== 'active' && session.status !== 'waiting') {
      throw new NotFoundException('La sesion no esta disponible para tomar');
    }

    const oldAdvisorId = session.advisor?.id ?? null;
    if (oldAdvisorId === newAdvisorId) return session;

    session.advisor = { id: newAdvisorId } as any;
    session.status = 'active';
    const saved = await this.sessionRepo.save(session);

    await this.syncAdvisorActiveChats(newAdvisorId);
    if (oldAdvisorId) await this.syncAdvisorActiveChats(oldAdvisorId);

    const result = await this.sessionRepo.findOne({
      where: { id: saved.id },
      relations: ['advisor'],
    });
    return result ?? saved;
  }
  async unassignAdvisor(sessionId: string): Promise<Session> {
    const session = await this.findOne(sessionId);
    const oldAdvisorId = session.advisor?.id ?? null;
    session.status = 'waiting';
    session.advisor = null;
    const saved = await this.sessionRepo.save(session);
    if (oldAdvisorId) await this.syncAdvisorActiveChats(oldAdvisorId);
    return saved;
  }

  async findAll(advisorId?: string): Promise<Session[]> {
    let sessions: Session[];
    if (advisorId) {
      sessions = await this.sessionRepo.find({
        where: { advisor: { id: advisorId } },
        order: { createdAt: 'DESC' },
        relations: ['advisor'],
      });
    } else {
      sessions = await this.sessionRepo.find({
        order: { createdAt: 'DESC' },
        relations: ['advisor'],
      });
    }
    return this.attachUnreadCounts(sessions);
  }

  /** Sesiones propias del asesor + las de la cola (sin asesor) para que
   *  cualquier asesor pueda tomarlas. Los admins usan findAllAdmin. */
  async findAllMine(advisorId: string): Promise<Session[]> {
    const sessions = await this.sessionRepo.find({
      relations: ['advisor'],
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const mine = sessions.filter(
      (s) => s.advisor?.id === advisorId || s.status === 'waiting',
    );
    return this.attachUnreadCounts(await this.attachLastMessages(mine));
  }

  async findAllPaginated(
    advisorId: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: Session[]; total: number; page: number; pages: number }> {
    const where = advisorId ? { advisor: { id: advisorId } } : {};
    const [data, total] = await this.sessionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: ['advisor'],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async addCollaborator(sessionId: string, advisorId: string): Promise<void> {
    // Ejemplo con TypeORM — ajusta según tu ORM
    await this.sessionRepo
      .createQueryBuilder()
      .relation('collaborators')
      .of(sessionId)
      .add(advisorId);
  }

  async findOne(id: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({
      where: { id },
      relations: ['advisor'],
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    return session;
  }

  async findPublic(id: string): Promise<{
    id: string;
    status: string;
    advisor?: { name: string; profilePhotoUrl?: string } | null;
    colegio: string;
    tipoSolicitud: string;
    clientName: string;
    rol: string;
  }> {
    const session = await this.sessionRepo.findOne({
      where: { id },
      relations: ['advisor'],
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    return {
      id: session.id,
      status: session.status,
      advisor: session.advisor
        ? { name: session.advisor.name, profilePhotoUrl: session.advisor.profilePhotoUrl ?? undefined }
        : null,
      colegio: session.colegio ?? '',
      tipoSolicitud: session.tipoSolicitud ?? '',
      clientName: session.clientName ?? '',
      rol: session.rol ?? '',
    };
  }

  // Solo devuelve sesiones en estado 'waiting' — las de estado 'ai' se ignoran
  async findWaitingSessions(): Promise<Session[]> {
    return this.sessionRepo.find({
      where: { status: 'waiting' },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Asignación ────────────────────────────────────────────────────────────
  // Solo asigna si está en 'waiting'. Si está en 'ai', no asigna.
  // ★ UPDATE ATÓMICO: solo un autoAssignAdvisor concurrente puede ganar la
  //   carrera (join_session + request_advisor + polling simultáneos). Si
  //   affected = 0, otra llamada ya asignó la sesión y NO debemos continuar
  //   (esto evitaba que la bienvenida se guardara dos veces).
  async assignAdvisor(
    sessionId: string,
    advisorId: string,
  ): Promise<{ session: Session; won: boolean }> {
    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(Session)
      .set({ status: 'active', advisor: { id: advisorId } as any })
      .where('id = :id', { id: sessionId })
      .andWhere("status = 'waiting'")
      .execute();

    const won = (result.affected ?? 0) > 0;

    if (won) await this.syncAdvisorActiveChats(advisorId);

    return { session: await this.findOne(sessionId), won };
  }
  async findAvailableAdvisor(): Promise<User | null> {
    const advisors = await this.userRepo.find({
      where: { role: 'advisor', status: 'online', active: true },
      order: { createdAt: 'ASC' },
    });
    return this.pickLeastLoadedAdvisor(advisors);
  }

  async findAvailableAdvisorFromList(
    connectedIds: string[],
  ): Promise<User | null> {
    if (!connectedIds.length) return null;

    const candidates = await this.userRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: 'advisor' })
      .andWhere('user.status = :status', { status: 'online' })
      .andWhere('user.active = true')
      .andWhere('user.id IN (:...ids)', { ids: connectedIds })
      .orderBy('user.createdAt', 'ASC')
      .getMany();

    return this.pickLeastLoadedAdvisor(candidates);
  }

  async incrementAdvisorChats(advisorId: string): Promise<void> {
    await this.userRepo.increment({ id: advisorId }, 'activeChats', 1);
  }

  async decrementAdvisorChats(advisorId: string): Promise<void> {
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ activeChats: () => 'GREATEST(active_chats - 1, 0)' })
      .where('id = :id', { id: advisorId })
      .execute();
  }

  async syncAdvisorActiveChats(advisorId: string): Promise<number> {
    const activeChats = await this.sessionRepo.count({
      where: { advisor: { id: advisorId }, status: 'active' },
    });
    await this.userRepo.update({ id: advisorId }, { activeChats });
    return activeChats;
  }

  private async pickLeastLoadedAdvisor(advisors: User[]): Promise<User | null> {
    if (!advisors.length) return null;

    const maxChats = Number(process.env.MAX_ACTIVE_CHATS_PER_ADVISOR ?? 4);
    const counts = await this.getActiveCountsByAdvisor(
      advisors.map((advisor) => advisor.id),
    );
    const available = advisors
      .map((advisor) => ({
        advisor,
        activeCount: counts.get(advisor.id) ?? 0,
      }))
      .filter((item) => item.activeCount < maxChats)
      .sort(
        (a, b) =>
          a.activeCount - b.activeCount ||
          new Date(a.advisor.createdAt).getTime() -
            new Date(b.advisor.createdAt).getTime(),
      );

    if (!available.length) return null;

    const lowest = available[0].activeCount;
    const tied = available.filter((item) => item.activeCount === lowest);
    const picked = tied[Math.floor(Math.random() * tied.length)].advisor;
    await this.syncAdvisorActiveChats(picked.id);
    return picked;
  }

  private async getActiveCountsByAdvisor(
    advisorIds: string[],
  ): Promise<Map<string, number>> {
    if (!advisorIds.length) return new Map();

    const rows = await this.sessionRepo
      .createQueryBuilder('session')
      .select('session.advisor_id', 'advisorId')
      .addSelect('COUNT(session.id)', 'count')
      .where('session.status = :status', { status: 'active' })
      .andWhere('session.advisor_id IN (:...advisorIds)', { advisorIds })
      .groupBy('session.advisor_id')
      .getRawMany<{ advisorId: string; count: string }>();

    return new Map(rows.map((row) => [row.advisorId, Number(row.count)]));
  }

  async setAdvisorStatus(
    advisorId: string,
    status: string,
  ): Promise<User | null> {
    if (!advisorId) return null;
    await this.syncAdvisorActiveChats(advisorId);
    await this.userRepo.update({ id: advisorId }, { status });
    return this.userRepo.findOne({ where: { id: advisorId } });
  }

  async saveRating(
    sessionId: string,
    estrellas: number,
    comentario: string | null,
    etiquetas: string[],
  ): Promise<Rating> {
    const existing = await this.ratingRepo.findOne({
      where: { session: { id: sessionId } },
    });
    if (existing) return existing;

    const rating = this.ratingRepo.create({
      session: { id: sessionId },
      estrellas,
      comentario: comentario ?? null,
      etiquetas: etiquetas ?? [],
    });
    return this.ratingRepo.save(rating);
  }

  async getRating(sessionId: string): Promise<Rating | null> {
    return this.ratingRepo.findOne({
      where: { session: { id: sessionId } },
    });
  }

  async findAdvisorById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  // ── Cierre ────────────────────────────────────────────────────────────────
  // Funciona para cualquier estado: 'ai', 'waiting', 'active'.
  // Si ya estaba 'closed', retorna sin hacer nada (idempotente) para evitar
  // que un doble cierre (cliente + asesor simultáneos) duplique el decremento.
  async close(sessionId: string): Promise<Session> {
    // ★ UPDATE ATÓMICO: solo actúa si la sesión NO está ya en 'closed'.
    //   Garantiza que aunque el cliente y el asesor cierren simultáneamente,
    //   el decremento de activeChats ocurra UNA SOLA VEZ.
    //   Si affected = 0 → ya estaba cerrada, no decrementamos.
    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(Session)
      .set({ status: 'closed', closedAt: new Date() })
      .where('id = :id', { id: sessionId })
      .andWhere("status != 'closed'")
      .execute();

    // Recarga con la relación del asesor para el decremento
    const session = await this.findOne(sessionId);

    if ((result.affected ?? 0) > 0 && session.advisor?.id) {
      await this.syncAdvisorActiveChats(session.advisor.id);
      this.logger.log(
        `[Close] ${sessionId} cerrada. Asesor ${session.advisor.id} activeChats sincronizado.`,
      );
    } else if ((result.affected ?? 0) === 0) {
      this.logger.log(
        `[Close] ${sessionId} ya estaba cerrada. Sin decremento.`,
      );
    }

    return session;
  }

  async transfer(sessionId: string, newAdvisorId: string): Promise<Session> {
    const session = await this.findOne(sessionId);
    if (!session.advisor)
      throw new NotFoundException('Sesion sin agente asignado');

    const oldAdvisorId = session.advisor.id;
    session.advisor = { id: newAdvisorId } as any;
    session.status = 'active';
    const saved = await this.sessionRepo.save(session);
    await this.syncAdvisorActiveChats(oldAdvisorId);
    await this.syncAdvisorActiveChats(newAdvisorId);

    const result = await this.sessionRepo.findOne({
      where: { id: saved.id },
      relations: ['advisor'],
    });
    return result ?? saved;
  }

  async findAllAdvisors(): Promise<User[]> {
    const cacheKey = `${this.CACHE_PREFIX}advisors`;
    try {
      const cached = await this.cache.get<User[]>(cacheKey);
      if (cached) return cached;
    } catch {}

    const result = await this.userRepo.find({
      where: { role: 'advisor' },
      select: [
        'id',
        'name',
        'email',
        'status',
        'activeChats',
        'profilePhotoUrl',
      ],
    });

    try {
      await this.cache.set(cacheKey, result, 10_000);
    } catch {}
    return result;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  async getMetricsByAdvisor(advisorId: string, timezone?: string) {
    const tz = timezone || 'America/Bogota';
    const now = new Date();
    const offset = tz === 'America/Bogota' ? -5 : 0;
    const bogotaNow = new Date(now.getTime() + offset * 3600000);
    const hoy = new Date(Date.UTC(bogotaNow.getUTCFullYear(), bogotaNow.getUTCMonth(), bogotaNow.getUTCDate()));

    const inicioSemana = new Date(hoy);
    inicioSemana.setUTCDate(inicioSemana.getUTCDate() - 7);

    const countsRow = await this.sessionRepo
      .createQueryBuilder('s')
      .select('COUNT(*)', 'total')
      .addSelect("COUNT(*) FILTER (WHERE s.status = 'closed')", 'closed')
      .addSelect("COUNT(*) FILTER (WHERE s.status = 'active')", 'active')
      .addSelect("COUNT(*) FILTER (WHERE s.created_at >= :hoy)", 'today')
      .addSelect("COUNT(*) FILTER (WHERE s.created_at >= :week)", 'week')
      .where('s.advisor_id = :id', { id: advisorId })
      .setParameters({ hoy, week: inicioSemana })
      .getRawOne<{ total: string; closed: string; active: string; today: string; week: string }>();

    const total = Number(countsRow?.total ?? 0);
    const totalCerradas = Number(countsRow?.closed ?? 0);
    const totalActivas = Number(countsRow?.active ?? 0);
    const hoyAtendidas = Number(countsRow?.today ?? 0);
    const semanaAtendidas = Number(countsRow?.week ?? 0);

    const [timingRow, advisor, ratings, firstResponseRow] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('s')
        .select('AVG(EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'avgResolution')
        .addSelect('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'medianResolution')
        .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'p95Resolution')
        .where('s.advisor_id = :id', { id: advisorId })
        .andWhere("s.status = 'closed'")
        .andWhere('s.closed_at IS NOT NULL')
        .getRawOne<{ avgResolution: string | null; medianResolution: string | null; p95Resolution: string | null }>(),
      this.userRepo.findOne({
        where: { id: advisorId },
        select: ['id', 'name', 'email', 'status', 'activeChats', 'createdAt'],
      }),
      this.ratingRepo
        .createQueryBuilder('r')
        .select('AVG(r.estrellas)', 'avgStars')
        .addSelect('COUNT(r.id)', 'totalRatings')
        .addSelect("jsonb_agg(DISTINCT jsonb_build_object('e', unnest_etiquetas.e))", 'etiquetasRaw')
        .innerJoin('r.session', 's')
        .where('s.advisor_id = :id', { id: advisorId })
        .groupBy()
        .getRawOne<{ avgStars: string | null; totalRatings: string; etiquetasRaw: any }>()
        .catch(() => null),
      this.messageRepo
        .createQueryBuilder('m')
        .select('AVG(EXTRACT(EPOCH FROM (m.created_at - s.created_at)) / 60)', 'avgFirstResponse')
        .innerJoin('m.session', 's')
        .where('s.advisor_id = :id', { id: advisorId })
        .andWhere("s.status = 'closed'")
        .andWhere("m.sender_type = 'advisor'")
        .getRawOne<{ avgFirstResponse: string | null }>()
        .catch(() => null),
    ]);

    const sesionesAtendidas = totalCerradas + totalActivas;
    const tasaResolucion =
      sesionesAtendidas > 0
        ? Math.round((totalCerradas / sesionesAtendidas) * 100)
        : 0;

    const totalRatings = Number(ratings?.totalRatings ?? 0);
    const avgEstrellas = totalRatings > 0 ? Number(ratings?.avgStars ?? 0) : 0;

    const etiquetaCount = new Map<string, number>();
    if (ratings?.etiquetasRaw && Array.isArray(ratings.etiquetasRaw)) {
      for (const item of ratings.etiquetasRaw) {
        if (item?.e) etiquetaCount.set(item.e, (etiquetaCount.get(item.e) ?? 0) + 1);
      }
    }
    const topEtiquetas = [...etiquetaCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([etiqueta, count]) => ({ etiqueta, count }));

    return {
      advisor,
      hoy: hoyAtendidas,
      semana: semanaAtendidas,
      total,
      totalCerradas,
      totalActivas,
      tasaResolucion,
      avgResolucionMin: Math.round(Number(timingRow?.avgResolution) || 0),
      medianaResolucionMin: Math.round(Number(timingRow?.medianResolution) || 0),
      p95ResolucionMin: Math.round(Number(timingRow?.p95Resolution) || 0),
      avgPrimeraRespuestaMin: Math.round(Number(firstResponseRow?.avgFirstResponse) || 0),
      medianaPrimeraRespuestaMin: 0,
      p95PrimeraRespuestaMin: 0,
      totalRatings,
      avgEstrellas: Math.round(avgEstrellas * 10) / 10,
      topEtiquetas,
    };
  }

  async getComentariosByAdvisor(
    advisorId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: any[]; total: number; page: number; pages: number }> {
    const skip = (page - 1) * limit;

    const total = await this.ratingRepo
      .createQueryBuilder('r')
      .innerJoin('r.session', 's')
      .where('s.advisor_id = :id', { id: advisorId })
      .andWhere('r.comentario IS NOT NULL')
      .andWhere("r.comentario != ''")
      .getCount();

    const ratings = await this.ratingRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.session', 's')
      .where('s.advisor_id = :id', { id: advisorId })
      .andWhere('r.comentario IS NOT NULL')
      .andWhere("r.comentario != ''")
      .orderBy('r.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const data = ratings.map((r) => ({
      id: r.id,
      estrellas: r.estrellas,
      comentario: r.comentario,
      etiquetas: r.etiquetas,
      createdAt: r.createdAt,
      clientName: r.session.clientName,
    }));

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async getMessages(sessionId: string, limit = 100): Promise<Message[]> {
    return this.messageRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
      take: limit,
    }).then(msgs => msgs.reverse());
  }

  async getMetrics() {
    const cacheKey = `${this.CACHE_PREFIX}metrics`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {}

    const statusRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(s.id)', 'count')
      .groupBy('s.status')
      .getRawMany<{ status: string; count: string }>();

    const statusMap = new Map(statusRows.map((r) => [r.status, Number(r.count)]));
    const total = statusRows.reduce((sum, r) => sum + Number(r.count), 0);

    const timingRow = await this.sessionRepo
      .createQueryBuilder('s')
      .select('AVG(EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'avgMinutes')
      .addSelect('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'medianMinutes')
      .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)', 'p95Minutes')
      .where('s.status = :status', { status: 'closed' })
      .andWhere('s.closed_at IS NOT NULL')
      .getRawOne<{ avgMinutes: string | null; medianMinutes: string | null; p95Minutes: string | null }>();

    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      select: ['id', 'name', 'status', 'activeChats', 'active'],
    });

    const result = {
      total,
      active: statusMap.get('active') ?? 0,
      waiting: statusMap.get('waiting') ?? 0,
      ai: statusMap.get('ai') ?? 0,
      closed: statusMap.get('closed') ?? 0,
      avgMinutes: Math.round(Number(timingRow?.avgMinutes) || 0),
      medianaMinutos: Math.round(Number(timingRow?.medianMinutes) || 0),
      p95Minutos: Math.round(Number(timingRow?.p95Minutes) || 0),
      advisors,
    };

    try {
      await this.cache.set(cacheKey, result, 30_000);
    } catch {}
    return result;
  }

  async findAllAdmin(): Promise<Session[]> {
    const sessions = await this.sessionRepo.find({
      relations: ['advisor'],
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return this.attachLastMessages(sessions);
  }

  /** Añade `unreadCount` por sesión: mensajes del cliente sin leer (read_at IS
   *  NULL) para que el contador de "chat en línea" sea consistente al refrescar
   *  y entre navegadores, en lugar de depender solo de localStorage. */
  private async attachUnreadCounts(sessions: Session[]): Promise<Session[]> {
    if (sessions.length === 0) return sessions;
    const ids = sessions.map((s) => s.id);

    const rows: Array<{ session_id: string; unread: string }> =
      await this.dataSource.query(
        `SELECT "session_id", COUNT(*)::int AS unread
         FROM "messages"
         WHERE "session_id" = ANY($1)
           AND "sender_type" = 'client'
           AND "read_at" IS NULL
         GROUP BY "session_id"`,
        [ids],
      );

    const bySession = new Map<string, number>();
    for (const row of rows) {
      bySession.set(row.session_id, Number(row.unread));
    }

    return sessions.map((s) => ({
      ...s,
      unreadCount: bySession.get(s.id) ?? 0,
    })) as Session[];
  }

  /** Añade `lastMessage` (último mensaje de la sesión, sea del cliente, la IA
   *  "Asistente Virtual" o cualquier asesor) para que la lista de recientes
   *  muestre el preview y se actualice en vivo. */
  private async attachLastMessages(sessions: Session[]): Promise<Session[]> {
    if (sessions.length === 0) return sessions;
    const ids = sessions.map((s) => s.id);

    // 1) Último id de mensaje por sesión en UNA consulta (Postgres DISTINCT ON)
    const rows: Array<{ id: string; session_id: string }> =
      await this.dataSource.query(
        `SELECT DISTINCT ON ("session_id") "id", "session_id"
         FROM "messages"
         WHERE "session_id" = ANY($1)
         ORDER BY "session_id", "created_at" DESC`,
        [ids],
      );
    if (rows.length === 0) return sessions;

    const msgIdToSession = new Map<string, string>();
    const lastIds: string[] = [];
    for (const row of rows) {
      msgIdToSession.set(row.id, row.session_id);
      lastIds.push(row.id);
    }

    // 2) Cargar esos mensajes por entidad para que se desencripten content/senderName
    const lastMessages = await this.messageRepo.find({
      where: { id: In(lastIds) },
    });
    const bySession = new Map<string, Message>();
    for (const m of lastMessages) {
      const sid = msgIdToSession.get(m.id);
      if (sid) bySession.set(sid, m);
    }

    return sessions.map((s) => {
      const lm = bySession.get(s.id);
      return {
        ...s,
        lastMessage: lm
          ? {
              id: lm.id,
              content: lm.content,
              senderType: lm.senderType,
              senderName: lm.senderName,
              createdAt: lm.createdAt,
            }
          : null,
      };
    }) as Session[];
  }

  async findAllAdminPaginated(
    page: number,
    limit: number,
  ): Promise<{ data: Session[]; total: number; page: number; pages: number }> {
    const [data, total] = await this.sessionRepo.findAndCount({
      relations: ['advisor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findAllColegios(): Promise<Colegio[]> {
    const cacheKey = `${this.CACHE_PREFIX}colegios`;
    try {
      const cached = await this.cache.get<Colegio[]>(cacheKey);
      if (cached) return cached;
    } catch {}

    const result = await this.colegioRepo.find({ order: { nombre: 'ASC' } });

    try {
      await this.cache.set(cacheKey, result, 120_000);
    } catch {}

    return result;
  }

  async createColegio(data: { nombre: string; link: string; email?: string }): Promise<Colegio> {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) : s;
    const nombre = truncate(data.nombre, 200);
    const link = truncate(data.link, 500);
    const existing = await this.colegioRepo.findOne({ where: { nombre } });
    if (existing) throw new NotFoundException(`Ya existe un colegio con el nombre "${nombre}"`);

    const colegio = this.colegioRepo.create({
      nombre,
      link,
      email: data.email ? truncate(data.email, 200) : '',
    });
    let saved: Colegio;
    try {
      saved = await this.colegioRepo.save(colegio);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new NotFoundException(`Ya existe un colegio con el nombre "${nombre}"`);
      }
      throw err;
    }
    try { await this.cache.del(`${this.CACHE_PREFIX}colegios`); } catch {}
    return saved;
  }

  async updateColegio(id: string, data: { nombre?: string; link?: string; email?: string }): Promise<Colegio> {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) : s;
    const colegio = await this.colegioRepo.findOne({ where: { id } });
    if (!colegio) throw new NotFoundException('Colegio no encontrado');

    if (data.nombre) {
      const nombre = truncate(data.nombre, 200);
      if (nombre !== colegio.nombre) {
        const dup = await this.colegioRepo.findOne({ where: { nombre } });
        if (dup) throw new NotFoundException(`Ya existe un colegio con el nombre "${nombre}"`);
        colegio.nombre = nombre;
      }
    }
    if (data.link !== undefined) colegio.link = truncate(data.link, 500);
    if (data.email !== undefined) colegio.email = data.email ? truncate(data.email, 200) : '';

    let saved: Colegio;
    try {
      saved = await this.colegioRepo.save(colegio);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new NotFoundException(`Ya existe un colegio con el nombre "${colegio.nombre}"`);
      }
      throw err;
    }
    try { await this.cache.del(`${this.CACHE_PREFIX}colegios`); } catch {}
    return saved;
  }

  async deleteColegio(id: string): Promise<{ ok: boolean }> {
    const colegio = await this.colegioRepo.findOne({ where: { id } });
    if (!colegio) throw new NotFoundException('Colegio no encontrado');
    await this.colegioRepo.remove(colegio);
    try { await this.cache.del(`${this.CACHE_PREFIX}colegios`); } catch {}
    return { ok: true };
  }

  async importColegios(data: { nombre: string; link: string; email?: string }[]): Promise<{ created: Colegio[]; skipped: number }> {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) : s;
    const truncateItem = (d: { nombre: string; link: string; email?: string }) => ({
      nombre: truncate(d.nombre, 200),
      link: truncate(d.link, 500),
      email: d.email ? truncate(d.email, 200) : '',
    });

    const truncated = data.map(truncateItem);
    const seen = new Set<string>();
    const unique = truncated.filter((d) => {
      const key = d.nombre.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const existing = await this.colegioRepo.find({
      where: { nombre: In(unique.map((d) => d.nombre)) },
      select: ['nombre'],
    });
    const existingSet = new Set(existing.map((c) => c.nombre.toLowerCase()));

    const toCreate = unique
      .filter((d) => !existingSet.has(d.nombre.toLowerCase()))
      .map((d) => this.colegioRepo.create(d));

    let created: Colegio[] = [];
    if (toCreate.length) {
      try {
        created = await this.colegioRepo.save(toCreate);
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new NotFoundException('Uno o más colegios ya existen (nombre duplicado)');
        }
        throw err;
      }
    }
    try { await this.cache.del(`${this.CACHE_PREFIX}colegios`); } catch {}
    return { created, skipped: data.length - created.length };
  }

  async deleteColegiosBulk(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.colegioRepo.delete({ id: In(ids) });
    try { await this.cache.del(`${this.CACHE_PREFIX}colegios`); } catch {}
    return { deleted: result.affected ?? 0 };
  }

  async exportColegios(): Promise<Colegio[]> {
    return this.colegioRepo.find({ order: { nombre: 'ASC' } });
  }

  async getRankingAsesores() {
    const cacheKey = `${this.CACHE_PREFIX}ranking`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {}

    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      select: ['id', 'name', 'status', 'activeChats'],
    });

    const advisorIds = advisors.map((a) => a.id);
    if (!advisorIds.length) return [];

    const [sessionStats, ratingStats] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('s')
        .select('s.advisor_id', 'advisorId')
        .addSelect('COUNT(s.id)', 'total')
        .addSelect(
          'SUM(CASE WHEN s.status = :closed THEN 1 ELSE 0 END)',
          'closedCount',
        )
        .where('s.advisor_id IN (:...ids)', {
          ids: advisorIds,
          closed: 'closed',
        })
        .groupBy('s.advisor_id')
        .getRawMany<{
          advisorId: string;
          total: string;
          closedCount: string;
        }>(),
      this.ratingRepo
        .createQueryBuilder('r')
        .select('s.advisor_id', 'advisorId')
        .addSelect('COUNT(r.id)', 'totalRatings')
        .addSelect('AVG(r.estrellas)', 'avgEstrellas')
        .innerJoin('r.session', 's')
        .where('s.advisor_id IN (:...ids)', { ids: advisorIds })
        .groupBy('s.advisor_id')
        .getRawMany<{
          advisorId: string;
          totalRatings: string;
          avgEstrellas: string;
        }>(),
    ]);

    const sessionMap = new Map(sessionStats.map((s) => [s.advisorId, s]));
    const ratingMap = new Map(ratingStats.map((r) => [r.advisorId, r]));

    // Promedio global de estrellas (para bayesian)
    let globalAvg = 0;
    let totalGlobalRatings = 0;
    for (const r of ratingStats) {
      const count = Number(r.totalRatings);
      globalAvg += Number(r.avgEstrellas) * count;
      totalGlobalRatings += count;
    }
    globalAvg = totalGlobalRatings > 0 ? globalAvg / totalGlobalRatings : 3;
    const C = 10; // constante de confianza bayesiana

    const ranking = advisors.map((advisor) => {
      const stats = sessionMap.get(advisor.id);
      const rStats = ratingMap.get(advisor.id);
      const rawAvg = rStats?.avgEstrellas ? Number(rStats.avgEstrellas) : 0;
      const count = Number(rStats?.totalRatings ?? 0);
      // Promedio bayesiano: pondera hacia el promedio global cuando hay pocas reseñas
      const bayesianAvg =
        count > 0 ? (count * rawAvg + C * globalAvg) / (count + C) : 0;
      return {
        id: advisor.id,
        name: advisor.name,
        status: advisor.status,
        activeChats: advisor.activeChats,
        total: Number(stats?.total ?? 0),
        totalCerradas: Number(stats?.closedCount ?? 0),
        totalRatings: count,
        avgEstrellas: Math.round(rawAvg * 10) / 10,
        bayesianAvg: Math.round(bayesianAvg * 10) / 10,
      };
    });

    const result = ranking.sort((a, b) =>
      b.bayesianAvg !== a.bayesianAvg
        ? b.bayesianAvg - a.bayesianAvg
        : b.total - a.total,
    );

    try {
      await this.cache.set(cacheKey, result, 60_000);
    } catch {}
    return result;
  }

  async getAllComentarios(
    page: number = 1,
    limit: number = 10,
    advisorId?: string,
  ): Promise<{ data: any[]; total: number; page: number; pages: number }> {
    const skip = (page - 1) * limit;

    const qb = this.ratingRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.session', 's')
      .leftJoinAndSelect('s.advisor', 'a')
      .andWhere('r.comentario IS NOT NULL')
      .andWhere("r.comentario != ''");

    if (advisorId) {
      qb.where('s.advisor_id = :advisorId', { advisorId });
    }

    const total = await qb.getCount();
    const ratings = await qb
      .orderBy('r.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const data = ratings.map((r) => ({
      id: r.id,
      estrellas: r.estrellas,
      comentario: r.comentario,
      etiquetas: r.etiquetas,
      createdAt: r.createdAt,
      clientName: r.session.clientName,
      advisorName: r.session.advisor?.name ?? '—',
    }));

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  findActiveSessionsByAdvisor(advisorId: string): Promise<Session[]> {
    return this.sessionRepo.find({
      where: { advisor: { id: advisorId }, status: 'active' },
      relations: ['advisor'],
    });
  }

  async reencryptAll(oldKey: string): Promise<{ processed: number }> {
    const {
      createCipheriv,
      createDecipheriv,
      pbkdf2Sync,
      randomBytes,
      createHash,
    } = await import('crypto');

    const PREFIX_V2 = 'enc:v2:';
    const PREFIX_V1 = 'enc:v1:';
    const PBKDF2_ITERATIONS = 100000;
    const PBKDF2_KEYLEN = 32;
    const PBKDF2_DIGEST = 'sha256';
    const IV_LENGTH = 12;
    const SALT_LENGTH = 32;

    const currentKey = process.env.CHAT_ENCRYPTION_KEY?.trim();
    if (!currentKey) throw new NotFoundException('CHAT_ENCRYPTION_KEY no configurada');

    const entries: { table: string; column: string }[] = [
      { table: 'messages', column: 'content' },
      { table: 'messages', column: 'sender_name' },
      { table: 'sessions', column: 'client_name' },
      { table: 'sessions', column: 'identificacion' },
      { table: 'sessions', column: 'apellido' },
      { table: 'whatsapp_messages', column: 'body' },
      { table: 'teams_tokens', column: 'access_token' },
      { table: 'teams_tokens', column: 'refresh_token' },
    ];

    let processed = 0;

    for (const { table, column } of entries) {
      try {
        const rows: any[] = await this.dataSource.query(
          `SELECT id, "${column}" FROM "${table}" WHERE "${column}"::text LIKE 'enc:v2:%' OR "${column}"::text LIKE 'enc:v1:%'`,
        );

        for (const row of rows) {
          const encrypted = row[column];
          if (!encrypted) continue;

          let decrypted: string;

          try {
            if (encrypted.startsWith(PREFIX_V2)) {
              const payload = encrypted.slice(PREFIX_V2.length);
              const [saltB64, ivB64, tagB64, encryptedB64] = payload.split(':');
              const salt = Buffer.from(saltB64, 'base64');
              const iv = Buffer.from(ivB64, 'base64');
              const tag = Buffer.from(tagB64, 'base64');
              const encData = Buffer.from(encryptedB64, 'base64');
              const oldDerived = pbkdf2Sync(oldKey, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
              const decipher = createDecipheriv('aes-256-gcm', oldDerived, iv);
              decipher.setAuthTag(tag);
              decrypted = Buffer.concat([decipher.update(encData), decipher.final()]).toString('utf8');
            } else if (encrypted.startsWith(PREFIX_V1)) {
              const payload = encrypted.slice(PREFIX_V1.length);
              const [ivB64, tagB64, encryptedB64] = payload.split(':');
              const oldDerived = createHash('sha256').update(oldKey).digest();
              const decipher = createDecipheriv('aes-256-gcm', oldDerived, Buffer.from(ivB64, 'base64'));
              decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
              decrypted = Buffer.concat([
                decipher.update(Buffer.from(encryptedB64, 'base64')),
                decipher.final(),
              ]).toString('utf8');
            } else {
              continue;
            }
          } catch {
            continue;
          }

          const newSalt = randomBytes(SALT_LENGTH);
          const newDerived = pbkdf2Sync(currentKey, newSalt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
          const newIv = randomBytes(IV_LENGTH);
          const cipher = createCipheriv('aes-256-gcm', newDerived, newIv);
          const newEncrypted = Buffer.concat([cipher.update(decrypted, 'utf8'), cipher.final()]);
          const newTag = cipher.getAuthTag();

          const newValue = `${PREFIX_V2}${newSalt.toString('base64')}:${newIv.toString('base64')}:${newTag.toString('base64')}:${newEncrypted.toString('base64')}`;

          await this.dataSource.query(
            `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
            [newValue, row.id],
          );
          processed++;
        }
      } catch {
        // table might not exist
      }
    }

    return { processed };
  }
}
