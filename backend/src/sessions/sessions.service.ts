import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Session } from './entities/session.entity';
import { User } from 'src/auth/entities/user.entity';
import { Message } from '../chat/entities/message.entity';
import { Colegio } from './entities/colegio.entity';
import { Rating } from './entities/rating.entity';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    @InjectRepository(Rating) private readonly ratingRepo: Repository<Rating>,
  ) {}

  private readonly logger = new Logger(SessionsService.name);

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
    colegio: string;
    colegioLink?: string | null;
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
      colegio: data.colegio,
      colegioLink: data.colegioLink,
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
    if (!result)
      throw new NotFoundException('Sesion no encontrada tras tomar el chat');
    return result;
  }
  async findAll(advisorId?: string): Promise<Session[]> {
    if (advisorId) {
      return this.sessionRepo.find({
        where: { advisor: { id: advisorId } },
        order: { createdAt: 'DESC' },
        relations: ['advisor'],
      });
    }
    return this.sessionRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['advisor'],
    });
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

  // Solo devuelve sesiones en estado 'waiting' — las de estado 'ai' se ignoran
  async findWaitingSessions(): Promise<Session[]> {
    return this.sessionRepo.find({
      where: { status: 'waiting' },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Asignación ────────────────────────────────────────────────────────────
  // Solo asigna si está en 'waiting'. Si está en 'ai', no asigna.
  async assignAdvisor(sessionId: string, advisorId: string): Promise<Session> {
    const session = await this.findOne(sessionId);
    if (session.status !== 'waiting') return session;
    session.status = 'active';
    session.advisor = { id: advisorId } as any;
    const saved = await this.sessionRepo.save(session);
    await this.syncAdvisorActiveChats(advisorId);
    return saved;
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
      throw new NotFoundException('Sesion sin asesor asignado');

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
    if (!result)
      throw new NotFoundException('Sesion no encontrada tras transferencia');
    return result;
  }

  async findAllAdvisors(): Promise<User[]> {
    return this.userRepo.find({
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
    const hoy = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    hoy.setHours(0, 0, 0, 0);

    const inicioSemana = new Date(
      now.toLocaleString('en-US', { timeZone: tz }),
    );
    inicioSemana.setDate(inicioSemana.getDate() - 7);
    inicioSemana.setHours(0, 0, 0, 0);

    const [total, totalCerradas, totalActivas, hoyAtendidas, semanaAtendidas] =
      await Promise.all([
        this.sessionRepo.count({ where: { advisor: { id: advisorId } } }),
        this.sessionRepo.count({
          where: { advisor: { id: advisorId }, status: 'closed' },
        }),
        this.sessionRepo.count({
          where: { advisor: { id: advisorId }, status: 'active' },
        }),
        this.sessionRepo
          .createQueryBuilder('s')
          .where('s.advisor_id = :id', { id: advisorId })
          .andWhere('s.created_at >= :hoy', { hoy })
          .getCount(),
        this.sessionRepo
          .createQueryBuilder('s')
          .where('s.advisor_id = :id', { id: advisorId })
          .andWhere('s.created_at >= :inicio', { inicio: inicioSemana })
          .getCount(),
      ]);

    const [cerradas, advisor, ratings] = await Promise.all([
      this.sessionRepo.find({
        where: { advisor: { id: advisorId }, status: 'closed' },
        select: ['createdAt', 'closedAt'],
      }),
      this.userRepo.findOne({
        where: { id: advisorId },
        select: ['id', 'name', 'email', 'status', 'activeChats', 'createdAt'],
      }),
      this.ratingRepo
        .createQueryBuilder('r')
        .innerJoin('r.session', 's')
        .where('s.advisor_id = :id', { id: advisorId })
        .getMany(),
    ]);

    const firstResponses = await this.messageRepo
      .createQueryBuilder('m')
      .select('m.session_id', 'sessionId')
      .addSelect('MIN(m.created_at)', 'firstResponseAt')
      .addSelect('s.created_at', 'sessionCreatedAt')
      .innerJoin('m.session', 's')
      .where('s.advisor_id = :id', { id: advisorId })
      .andWhere('s.status = :status', { status: 'closed' })
      .andWhere('m.sender_type = :senderType', { senderType: 'advisor' })
      .groupBy('m.session_id')
      .addGroupBy('s.created_at')
      .getRawMany<{
        sessionId: string;
        firstResponseAt: string;
        sessionCreatedAt: string;
      }>();

    const resolutionMinutes = cerradas
      .filter((s) => s.closedAt)
      .map(
        (s) =>
          (new Date(s.closedAt!).getTime() - new Date(s.createdAt).getTime()) /
          1000 /
          60,
      );

    const firstResponseMinutes = firstResponses.map(
      (r) =>
        (new Date(r.firstResponseAt).getTime() -
          new Date(r.sessionCreatedAt).getTime()) /
        1000 /
        60,
    );

    const avgResolucionMin =
      resolutionMinutes.length > 0
        ? resolutionMinutes.reduce((a, b) => a + b, 0) /
          resolutionMinutes.length
        : 0;

    const avgPrimeraRespuestaMin =
      firstResponseMinutes.length > 0
        ? firstResponseMinutes.reduce((a, b) => a + b, 0) /
          firstResponseMinutes.length
        : 0;

    // Tasa de resolución: cerradas / (cerradas + activas) — mide resolución sobre sesiones atendidas
    const sesionesAtendidas = totalCerradas + totalActivas;
    const tasaResolucion =
      sesionesAtendidas > 0
        ? Math.round((totalCerradas / sesionesAtendidas) * 100)
        : 0;

    const totalRatings = ratings.length;
    const avgEstrellas =
      totalRatings > 0
        ? ratings.reduce((acc, r) => acc + r.estrellas, 0) / totalRatings
        : 0;

    const etiquetaCount = new Map<string, number>();
    ratings.forEach((r) => {
      r.etiquetas.forEach((e) => {
        etiquetaCount.set(e, (etiquetaCount.get(e) ?? 0) + 1);
      });
    });
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
      avgResolucionMin: Math.round(avgResolucionMin),
      medianaResolucionMin: Math.round(this.percentile(resolutionMinutes, 50)),
      p95ResolucionMin: Math.round(this.percentile(resolutionMinutes, 95)),
      avgPrimeraRespuestaMin: Math.round(avgPrimeraRespuestaMin),
      medianaPrimeraRespuestaMin: Math.round(
        this.percentile(firstResponseMinutes, 50),
      ),
      p95PrimeraRespuestaMin: Math.round(
        this.percentile(firstResponseMinutes, 95),
      ),
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

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.messageRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'ASC' },
    });
  }

  async getMetrics() {
    const total = await this.sessionRepo.count();
    const active = await this.sessionRepo.count({
      where: { status: 'active' },
    });
    const waiting = await this.sessionRepo.count({
      where: { status: 'waiting' },
    });
    const ai = await this.sessionRepo.count({ where: { status: 'ai' } });
    const closed = await this.sessionRepo.count({
      where: { status: 'closed' },
    });

    const closedSessions = await this.sessionRepo.find({
      where: { status: 'closed' },
      select: ['createdAt', 'closedAt'],
    });

    const minutes = closedSessions
      .filter((s) => s.closedAt)
      .map(
        (s) =>
          (new Date(s.closedAt!).getTime() - new Date(s.createdAt).getTime()) /
          1000 /
          60,
      );

    const avgMinutes =
      minutes.length > 0
        ? minutes.reduce((a, b) => a + b, 0) / minutes.length
        : 0;

    const advisors = await this.userRepo.find({
      where: { role: 'advisor' },
      select: ['id', 'name', 'status', 'activeChats', 'active'],
    });

    return {
      total,
      active,
      waiting,
      ai,
      closed,
      avgMinutes: Math.round(avgMinutes),
      medianaMinutos: Math.round(this.percentile(minutes, 50)),
      p95Minutos: Math.round(this.percentile(minutes, 95)),
      advisors,
    };
  }

  async findAllAdmin(): Promise<Session[]> {
    return this.sessionRepo.find({
      relations: ['advisor'],
      order: { createdAt: 'DESC' },
      take: 500,
    });
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
    return this.colegioRepo.find({ order: { nombre: 'ASC' } });
  }

  async getRankingAsesores() {
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

    return ranking.sort((a, b) =>
      b.bayesianAvg !== a.bayesianAvg
        ? b.bayesianAvg - a.bayesianAvg
        : b.total - a.total,
    );
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
}
