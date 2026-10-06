import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { existsSync, unlinkSync } from 'fs';
import { basename, join, resolve } from 'path';
import { Ticket } from './ticket.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { TicketMailService } from './ticket-mail.service';
import { TicketsGateway } from './tickets.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SlaService } from '../slaprotection/sla.service';
import { TicketAuditService } from './ticket-audit.service';

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En Proceso',
  on_hold: 'En Espera',
  denied: 'Denegado',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  /**
   * Imágenes de notas, FUERA de `uploads/`. Ese directorio se sirve como
   * estático sin comprobar sesión, y estas capturas llevan datos personales del
   * cliente.
   */
  static readonly IMAGENES_DIR = join(
    process.cwd(),
    'uploads-private',
    'tickets',
  );

  constructor(
    @InjectRepository(Ticket) private readonly repo: Repository<Ticket>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly ticketMail: TicketMailService,
    private readonly notifications: NotificationsService,
    private readonly sla: SlaService,
    private readonly gateway: TicketsGateway,
    private readonly audit: TicketAuditService,
  ) {}

  private async generarCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    const last = await this.repo.findOne({
      where: { codigo: Like(`${prefix}%`) },
      order: { codigo: 'DESC' },
    });
    let nextNum = 1;
    if (last) {
      const numStr = last.codigo.slice(prefix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  private async resolveUser(id?: string | null): Promise<User | null> {
    if (!id) return null;
    return this.userRepo.findOneBy({ id });
  }

  async create(
    dto: CreateTicketDto,
    userId?: string,
  ): Promise<Ticket & { emailEnviado?: boolean }> {
    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.createOnce(dto, userId);
      } catch (err: any) {
        const isDuplicate =
          err?.code === '23505' || err?.message?.includes?.('duplicate key');
        if (!isDuplicate || attempt === MAX_RETRIES) {
          if (isDuplicate) {
            throw new ConflictException(
              'El codigo del ticket ya existe. Intenta de nuevo.',
            );
          }
          throw err;
        }
      }
    }
    throw new ConflictException(
      'No se pudo generar un codigo unico. Intenta de nuevo.',
    );
  }

  private async createOnce(
    dto: CreateTicketDto,
    userId?: string,
  ): Promise<Ticket & { emailEnviado?: boolean }> {
    const codigo = await this.generarCodigo();
    let assignedTo: User | null = null;
    if (dto.assignedToId) {
      assignedTo = await this.userRepo.findOneBy({ id: dto.assignedToId });
    } else if (userId) {
      assignedTo = await this.userRepo.findOneBy({ id: userId });
    }

    const createdBy = userId
      ? await this.userRepo.findOneBy({ id: userId })
      : null;

    const ticket = new Ticket();
    ticket.codigo = codigo;
    ticket.titulo = dto.titulo;
    ticket.descripcion = dto.descripcion ?? null;
    ticket.priority = dto.priority ?? 'medium';
    ticket.category = dto.category ?? null;
    ticket.sourceType = dto.sourceType;
    ticket.sourceId = dto.sourceId ?? null;
    ticket.clientName = dto.clientName;
    ticket.clientInfo = dto.clientInfo ?? null;
    ticket.institucion = dto.institucion ?? null;
    ticket.canal = dto.canal ?? dto.sourceType;
    ticket.conversation = dto.conversation ?? null;
    ticket.assignedTo = assignedTo;
    ticket.assignedToName = assignedTo?.name ?? null;
    ticket.createdBy = createdBy;

    const priority = dto.priority ?? 'medium';
    ticket.slaDeadline = await this.sla.calculateDeadline(priority);

    const saved = await this.repo.save(ticket);

    await this.audit.registrar({
      ticketId: saved.id,
      ticketCodigo: saved.codigo,
      accion: 'ticket_creado',
      campo: null,
      after: {
        status: saved.status,
        priority: saved.priority,
        sourceType: saved.sourceType,
        assignedTo: saved.assignedTo?.id ?? null,
      },
      actor: { id: createdBy?.id ?? userId, name: createdBy?.name, role: createdBy?.role },
    });

    let emailEnviado = false;
    if (dto.email) {
      const res = await this.ticketMail.enviarTicket(saved, dto.email);
      emailEnviado = res.enviado;
      if (!res.enviado && res.requerido) {
        await this.repo.delete(saved.id).catch(() => undefined);
        throw new ServiceUnavailableException(
          'No se pudo enviar el correo de confirmacion del ticket, por lo que el ticket no fue generado.',
        );
      }
    }

    await this.emitNotification({
      type: 'ticket_created',
      title: `Nuevo ticket ${codigo}`,
      message: `Se creo el ticket ${codigo}: "${dto.titulo}"`,
      entityId: saved.id,
      entityCodigo: codigo,
      recipientIds: [createdBy?.id ?? userId],
      senderId: userId,
      meta: { priority: saved.priority, sourceType: saved.sourceType },
    });

    if (assignedTo && assignedTo.id !== createdBy?.id) {
      await this.emitNotification({
        type: 'ticket_assigned',
        title: `Ticket asignado: ${codigo}`,
        message: `${createdBy?.name ?? 'Sistema'} te asigno el ticket ${codigo}: "${dto.titulo}"`,
        entityId: saved.id,
        entityCodigo: codigo,
        recipientIds: [assignedTo.id],
        senderId: userId,
        meta: { priority: saved.priority },
      });
    }

    const result = Object.assign(saved, { emailEnviado });
    this.gateway.broadcastTicketEvent('ticket:created', {
      id: result.id,
      codigo: result.codigo,
    });
    return result;
  }

  /**
   * Listado de tickets.
   *
   * VISIBILIDAD (decision de negocio): a proposito NO se filtra por rol ni por
   * asesor. El equipo necesita ver los tickets de los demas para atender
   * derivaciones, y el filtro "solo los mios" del frontend es de conveniencia,
   * no de seguridad.
   *
   * OJO: `userRole` y `userId` se reciben pero no se usan para filtrar. No es un
   * descuido: si algun dia se quiere aislamiento, el sitio para hacerlo es aqui,
   * junto con una comprobacion equivalente en `findOne` (H-04), porque hoy ambos
   * devuelven cualquier ticket del sistema.
   */
  async findAll(
    query: QueryTicketDto,
    userRole?: string,
    userId?: string,
  ): Promise<{
    data: Ticket[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.assignedTo', 'assignedTo')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .leftJoinAndSelect('t.closedBy', 'closedBy');

    if (query.search) {
      const s = `%${query.search}%`;
      qb.andWhere(
        '(t.titulo ILIKE :s OR t.codigo ILIKE :s OR t.clientName ILIKE :s)',
        { s },
      );
    }
    if (query.status) {
      const values = query.status.split(',').filter(Boolean);
      if (values.length === 1)
        qb.andWhere('t.status = :status', { status: values[0] });
      else if (values.length > 1)
        qb.andWhere('t.status IN (:...status)', { status: values });
    }
    if (query.priority) {
      const values = query.priority.split(',').filter(Boolean);
      if (values.length === 1)
        qb.andWhere('t.priority = :priority', { priority: values[0] });
      else if (values.length > 1)
        qb.andWhere('t.priority IN (:...priority)', { priority: values });
    }
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.sourceType) {
      const values = query.sourceType.split(',').filter(Boolean);
      if (values.length === 1)
        qb.andWhere('t.sourceType = :sourceType', { sourceType: values[0] });
      else if (values.length > 1)
        qb.andWhere('t.sourceType IN (:...sourceType)', {
          sourceType: values,
        });
    }
    if (query.assignedTo) {
      qb.andWhere('t.assignedTo = :assignedTo', {
        assignedTo: query.assignedTo,
      });
    }
    if (query.createdById) {
      qb.andWhere('t.createdBy = :createdBy', {
        createdBy: query.createdById,
      });
    }
    if (query.institucion) {
      qb.andWhere('t.institucion = :institucion', {
        institucion: query.institucion,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('t.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      qb.andWhere('t.createdAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    if (query.sortBy === 'priority') {
      qb.addSelect(
        `CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`,
        'ticket_priority_order',
      ).addOrderBy('ticket_priority_order', direction);
    } else if (query.sortBy === 'status') {
      qb.addSelect(
        `CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'on_hold' THEN 3 WHEN 'denied' THEN 4 WHEN 'resolved' THEN 5 WHEN 'closed' THEN 6 ELSE 7 END`,
        'ticket_status_order',
      ).addOrderBy('ticket_status_order', direction);
    } else if (query.sortBy === 'codigo') {
      qb.addOrderBy('t.codigo', direction);
    } else if (query.sortBy === 'titulo') {
      qb.addOrderBy('t.titulo', direction);
    } else if (query.sortBy === 'clientName') {
      qb.addOrderBy('t.clientName', direction);
    } else {
      qb.addOrderBy('t.createdAt', direction);
    }
    qb.addOrderBy('t.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findAllSimple(): Promise<Ticket[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      relations: ['assignedTo', 'createdBy', 'closedBy'],
      take: 500,
    });
  }

  async findCounts(
    query: Omit<QueryTicketDto, 'page' | 'limit'>,
    userRole?: string,
    userId?: string,
  ): Promise<{
    total: number;
    statusCounts: Record<string, number>;
    priorityCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  }> {
    const qb = this.repo.createQueryBuilder('t');

    if (query.search) {
      const s = `%${query.search}%`;
      qb.andWhere(
        '(t.titulo ILIKE :s OR t.codigo ILIKE :s OR t.clientName ILIKE :s)',
        { s },
      );
    }

    if (query.assignedTo) {
      qb.andWhere('t.assignedTo = :assignedTo', {
        assignedTo: query.assignedTo,
      });
    }
    if (query.createdById) {
      qb.andWhere('t.createdBy = :createdBy', { createdBy: query.createdById });
    }

    if (query.dateFrom) {
      qb.andWhere('t.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      qb.andWhere('t.createdAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }

    const tickets = await qb
      .select(['t.status', 't.priority', 't.sourceType', 't.category'])
      .getMany();

    const statusCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const t of tickets) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
      sourceCounts[t.sourceType] = (sourceCounts[t.sourceType] || 0) + 1;
      if (t.category)
        categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }

    return {
      total: tickets.length,
      statusCounts,
      priorityCounts,
      sourceCounts,
      categoryCounts,
    };
  }

  async findById(id: string): Promise<Ticket> {
    const ticket = await this.repo.findOne({
      where: { id },
      relations: ['assignedTo', 'createdBy', 'closedBy'],
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    userId?: string,
    role?: string,
  ): Promise<Ticket> {
    const ticket = await this.findById(id);

    const sender = userId ? await this.resolveUser(userId) : null;

    const oldStatus = ticket.status;
    const oldPriority = ticket.priority;
    const oldAssignedToId = ticket.assignedTo?.id ?? null;

    const baseChanges: string[] = [];

    if (dto.titulo !== undefined && dto.titulo !== ticket.titulo) {
      ticket.titulo = dto.titulo;
      baseChanges.push('el titulo');
    }
    if (
      dto.descripcion !== undefined &&
      dto.descripcion !== ticket.descripcion
    ) {
      ticket.descripcion = dto.descripcion;
      baseChanges.push('la descripcion');
    }
    if (dto.category !== undefined && dto.category !== ticket.category) {
      ticket.category = dto.category;
      baseChanges.push('la categoria');
    }

    if (dto.priority !== undefined && dto.priority !== oldPriority) {
      ticket.priority = dto.priority;
      ticket.slaAlertedAt = null;

      // Recalcular el SLA solo si el ticket sigue vivo. Antes se recalculaba
      // siempre, y subirle la prioridad a un ticket ya cerrado le resucitaba un
      // slaDeadline: la UI mostraba un vencimiento en un ticket que ya no
      // tiene nada que resolver.
      const activo = ticket.status === 'open' || ticket.status === 'in_progress';
      ticket.slaDeadline = activo
        ? await this.sla.calculateDeadline(dto.priority)
        : null;

      const recipients = this.collectTicketRecipients(ticket, userId);

      await this.emitNotification({
        type: 'ticket_priority_changed',
        title: `Prioridad cambiada: ${ticket.codigo}`,
        message: `${sender?.name ?? 'Sistema'} cambio la prioridad de ${PRIORITY_LABELS[oldPriority] ?? oldPriority} a ${PRIORITY_LABELS[dto.priority] ?? dto.priority} en ${ticket.codigo}`,
        entityId: ticket.id,
        entityCodigo: ticket.codigo,
        recipientIds: recipients,
        senderId: userId,
        meta: { oldPriority, newPriority: dto.priority },
      });

      await this.audit.registrar({
        ticketId: ticket.id,
        ticketCodigo: ticket.codigo,
        accion: 'ticket_prioridad_cambiada',
        campo: 'priority',
        before: { priority: oldPriority },
        after: { priority: dto.priority, slaDeadline: ticket.slaDeadline },
        actor: { id: userId, name: sender?.name, role },
      });
    }

    if (baseChanges.length > 0) {
      const recipients = this.collectTicketRecipients(ticket, userId);

      await this.emitNotification({
        type: 'ticket_updated',
        title: `Ticket actualizado: ${ticket.codigo}`,
        message: `${sender?.name ?? 'Sistema'} modifico ${baseChanges.join(', ')} en ${ticket.codigo}: "${ticket.titulo}"`,
        entityId: ticket.id,
        entityCodigo: ticket.codigo,
        recipientIds: recipients,
        senderId: userId,
        meta: { changes: baseChanges },
      });
    }

    if (dto.status !== undefined && dto.status !== oldStatus) {
      // REGLA DE CIERRE: `closed` solo se alcanza desde `resolved` y mediante el
      // endpoint POST /tickets/:id/close. Aqui se bloquea el atajo para que un
      // PATCH directo, un drag-and-drop manipulado o una llamada suelta no
      // esquiven el flujo de correo de confirmacion.
      const adminOverride = role === 'admin' || role === 'superadmin';
      if (dto.status === 'closed' && role === 'desarrollador') {
        throw new ForbiddenException(
          'El perfil desarrollador no puede cerrar tickets. Dejalo en resuelto.',
        );
      }
      // El cierre va SIEMPRE por POST /tickets/:id/close, incluso viniendo de
      // `resolved`. Un PATCH directo saltaria la decision de enviar o no el
      // correo, y con ella la auditoria: quedaria un `ticket_estado_cambiado`
      // sin registro de si se notificó al cliente. El admin conserva el
      // override por soporte.
      if (dto.status === 'closed' && !adminOverride) {
        throw new ConflictException(
          `No se puede cerrar ${ticket.codigo} con una actualizacion directa. ` +
            'Usa "Enviar correo y cerrar" o "Solamente cerrar".',
        );
      }
      const prevStatus = ticket.status;
      ticket.status = dto.status;

      if (dto.status === 'closed' && !ticket.closedAt) {
        ticket.closedAt = new Date();
        ticket.closedBy = sender;
        ticket.slaDeadline = null;
      }

      if (dto.status === 'denied' && !ticket.closedAt) {
        ticket.closedAt = new Date();
        ticket.closedBy = sender;
        ticket.slaDeadline = null;
      }

      // REAPERTURA: al salir de un estado terminal hay que limpiar la marca de
      // cierre y devolver el SLA. Antes no se hacia y el ticket quedaba
      // "abierto" con closedAt puesto y sin slaDeadline, lo que hacia que los
      // filtros por fecha de cierre y la columna de SLA mostraran datos
      // incoherentes.
      const esTerminal = (s: string) => s === 'closed' || s === 'denied';
      if (esTerminal(prevStatus) && !esTerminal(dto.status)) {
        ticket.closedAt = null;
        ticket.closedBy = null;
        // El SLA solo tiene sentido sobre un ticket vivo.
        ticket.slaDeadline = await this.sla.calculateDeadline(ticket.priority);
      }

      if (dto.status === 'on_hold') {
        ticket.pausedAt = new Date();
      } else if (prevStatus === 'on_hold' && ticket.pausedAt) {
        const pauseMs = Date.now() - ticket.pausedAt.getTime();
        ticket.totalPausedMs = (ticket.totalPausedMs ?? 0) + pauseMs;
        ticket.pausedAt = null;
      }

      const recipients = this.collectTicketRecipients(ticket, userId);

      const closed = dto.status === 'closed';
      const denied = dto.status === 'denied';
      const notifType = closed
        ? 'ticket_closed'
        : denied
          ? 'ticket_denied'
          : 'ticket_status_changed';
      const action = closed ? 'cerro' : denied ? 'nego' : 'cambio el estado de';
      const toLabel = STATUS_LABELS[dto.status] ?? dto.status;
      const fromLabel = STATUS_LABELS[prevStatus] ?? prevStatus;

      await this.emitNotification({
        type: notifType,
        title: `${toLabel}: ${ticket.codigo}`,
        message:
          closed || denied
            ? `${sender?.name ?? 'Sistema'} ${action} el ticket ${ticket.codigo}: "${ticket.titulo}" (estado previo: "${fromLabel}")`
            : `${sender?.name ?? 'Sistema'} ${action} "${fromLabel}" a "${toLabel}" en ${ticket.codigo}: "${ticket.titulo}"`,
        entityId: ticket.id,
        entityCodigo: ticket.codigo,
        recipientIds: recipients,
        senderId: userId,
        meta: { oldStatus: prevStatus, newStatus: dto.status },
      });

      const terminal = (s: string) => s === 'closed' || s === 'denied';
      await this.audit.registrar({
        ticketId: ticket.id,
        ticketCodigo: ticket.codigo,
        accion: terminal(prevStatus) && !terminal(dto.status)
          ? 'ticket_reabierto'
          : 'ticket_estado_cambiado',
        campo: 'status',
        before: { status: prevStatus },
        after: {
          status: dto.status,
          closedAt: ticket.closedAt,
          slaDeadline: ticket.slaDeadline,
        },
        actor: { id: userId, name: sender?.name, role },
      });
    }

    if (dto.assignedToId !== undefined) {
      const newAssigned = dto.assignedToId
        ? await this.userRepo.findOneBy({ id: dto.assignedToId })
        : null;

      const prevAssignedId = oldAssignedToId;
      ticket.assignedTo = newAssigned;
      ticket.assignedToName = newAssigned?.name ?? (null as any);

      if (newAssigned?.id !== prevAssignedId) {
        await this.audit.registrar({
          ticketId: ticket.id,
          ticketCodigo: ticket.codigo,
          accion: newAssigned ? 'ticket_reasignado' : 'ticket_desasignado',
          campo: 'assignedTo',
          before: { assignedTo: prevAssignedId ?? null },
          after: { assignedTo: newAssigned?.id ?? null },
          actor: { id: userId, name: sender?.name, role },
        });
      }

      if (newAssigned && newAssigned.id !== prevAssignedId) {
        if (prevAssignedId && prevAssignedId !== userId) {
          await this.emitNotification({
            type: 'ticket_reassigned',
            title: `Ticket reasignado: ${ticket.codigo}`,
            message: `${sender?.name ?? 'Sistema'} reasigno ${ticket.codigo} a ${newAssigned.name}`,
            entityId: ticket.id,
            entityCodigo: ticket.codigo,
            recipientIds: [prevAssignedId],
            senderId: userId,
            meta: {
              reassignedTo: newAssigned.name,
              reassignedToId: newAssigned.id,
            },
          });
        }

        if (newAssigned.id !== userId) {
          await this.emitNotification({
            type: 'ticket_assigned',
            title: `Ticket asignado: ${ticket.codigo}`,
            message: `${sender?.name ?? 'Sistema'} te asigno ${ticket.codigo}: "${ticket.titulo}"`,
            entityId: ticket.id,
            entityCodigo: ticket.codigo,
            recipientIds: [newAssigned.id],
            senderId: userId,
            meta: { priority: ticket.priority },
          });
        }
      }
    }

    const updated = await this.repo.save(ticket);
    this.gateway.broadcastTicketEvent('ticket:updated', {
      id: updated.id,
      codigo: updated.codigo,
    });
    return updated;
  }

  async delete(id: string, userId?: string): Promise<void> {
    const ticket = await this.findById(id);

    // Se resuelve el actor ANTES de borrar: después la ficha ya no está.
    const actor = userId ? await this.resolveUser(userId) : null;

    const result = await this.repo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException('Ticket no encontrado');

    await this.audit.registrar({
      ticketId: id,
      ticketCodigo: ticket.codigo,
      accion: 'ticket_eliminado',
      campo: null,
      before: {
        status: ticket.status,
        priority: ticket.priority,
        notas: Array.isArray(ticket.notes) ? ticket.notes.length : 0,
      },
      after: null,
      actor: { id: actor?.id ?? userId, name: actor?.name, role: actor?.role },
    });

    // Sin esto, las capturas de PII del ticket eliminado seguian en disco.
    this.borrarArchivosDeNotas(Array.isArray(ticket.notes) ? ticket.notes : []);

    this.gateway.broadcastTicketEvent('ticket:deleted', {
      id,
      codigo: ticket.codigo,
    });
  }

  async addNote(id: string, dto: AddNoteDto, user?: any): Promise<Ticket> {
    const ticket = await this.findById(id);

    // Solo se aceptan rutas servidas por este modulo y con el nombre de archivo que
    // genera multer. Antes el filtro era `/^\/uploads\//`, que admitia CUALQUIER
    // archivo publico de la aplicacion (incluso credenciales de sesion) y
    // ademas rechazaba la ruta autenticada nueva.
    const IMAGEN_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/;
    const images = (dto.images ?? []).filter(
      (u: string) =>
        typeof u === 'string' &&
        (u.startsWith('/tickets/imagenes/') ||
          u.startsWith('/uploads/tickets/')) &&
        IMAGEN_RE.test(basename(u)),
    );

    const note = {
      id:
        typeof crypto !== 'undefined' && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      authorId: user?.id ?? null,
      authorName: user?.name ?? 'Sistema',
      content: dto.content ?? '',
      images,
      createdAt: new Date().toISOString(),
    };

    ticket.notes = Array.isArray(ticket.notes) ? ticket.notes : [];
    ticket.notes.unshift(note);

    const updated = await this.repo.save(ticket);

    // El texto de la nota sí queda en la auditoría: es la evidencia de qué se
    // le dijo al cliente. Las imágenes solo se referencian por nombre.
    await this.audit.registrar({
      ticketId: ticket.id,
      ticketCodigo: ticket.codigo,
      accion: 'ticket_nota_agregada',
      campo: 'notes',
      before: null,
      after: {
        noteId: note.id,
        content: note.content,
        images: images.length,
        authorName: note.authorName,
      },
      actor: { id: user?.id, name: user?.name, role: user?.role },
    });

    const actorName = user?.name ?? 'Sistema';
    const recipients = this.collectTicketRecipients(ticket, user?.id);

    await this.emitNotification({
      type: 'ticket_note',
      title: `Nueva nota: ${ticket.codigo}`,
      message: `${actorName} agrego una nota a ${ticket.codigo}: "${ticket.titulo}"`,
      entityId: ticket.id,
      entityCodigo: ticket.codigo,
      recipientIds: recipients,
      senderId: user?.id,
      meta: { priority: ticket.priority },
    });

    this.gateway.broadcastTicketEvent('ticket:updated', {
      id: updated.id,
      codigo: updated.codigo,
    });
    return updated;
  }

  async deleteNote(
    id: string,
    noteId: string,
    user?: any,
  ): Promise<{ ok: boolean }> {
    const ticket = await this.findById(id);
    if (!Array.isArray(ticket.notes))
      throw new NotFoundException('Nota no encontrada');

    const noteIndex = ticket.notes.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) throw new NotFoundException('Nota no encontrada');

    const note = ticket.notes[noteIndex];
    if (
      note?.authorId &&
      user?.id &&
      note.authorId !== user?.id &&
      user.role !== 'admin'
    ) {
      throw new ForbiddenException(
        'Solo el autor o un admin puede eliminar esta nota',
      );
    }

    ticket.notes.splice(noteIndex, 1);
    await this.repo.save(ticket);
    await this.audit.registrar({
      ticketId: ticket.id,
      ticketCodigo: ticket.codigo,
      accion: 'ticket_nota_eliminada',
      campo: 'notes',
      before: { noteId: note.id, images: (note.images ?? []).length },
      after: null,
      actor: { id: user?.id, name: user?.name, role: user?.role },
    });
    // Las imágenes de la nota se borran del disco: si no, el archivo queda
    // vivo para siempre y la fila que lo autorizaba ya no existe.
    this.borrarArchivosDeNotas([note]);
    this.gateway.broadcastTicketEvent('ticket:updated', {
      id: ticket.id,
      codigo: ticket.codigo,
    });
    return { ok: true };
  }

  // ==================================================================
  // IMÁGENES DE NOTAS
  // ==================================================================

  /** UUID v4 + extensión de imagen. Cualquier otra cosa se descarta. */
  private static readonly IMAGEN_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/;

  private static readonly MIME_POR_EXT: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
  };

  /**
   * Valida que el ticket exista al subir la imagen. La subida ya está en disco
   * cuando se llama: si el ticket no existe, el archivo se elimina para no dejar
   * basura que nadie va a poder leer ni borrar.
   */
  async registrarImagenSubida(id: string, filename: string): Promise<void> {
    await this.findById(id);
    if (!TicketsService.IMAGEN_RE.test(filename)) {
      throw new BadRequestException('Nombre de archivo no permitido');
    }
  }

  /**
   * Localiza la imagen en disco SOLO si alguna nota de algún ticket la
   * referencia. Devolver el archivo sin esa comprobación convertiría el endpoint
   * en un buscador de archivos por UUID adivinable.
   *
   * Busca primero en el directorio privado (subidas nuevas) y después en el
   * legacy `uploads/tickets` (subidas anteriores al cambio), para que las notas
   * ya guardadas sigan mostrando sus imágenes.
   */
  async buscarImagenDeTicket(
    filename: string,
  ): Promise<{ path: string; mime: string } | null> {
    // `basename` primero: mata cualquier intento de traversal (`../`) antes de
    // tocar el sistema de archivos, y la regex descarta el resto.
    const seguro = basename(filename ?? '');
    if (seguro !== filename || !TicketsService.IMAGEN_RE.test(seguro)) return null;

    const candidatos = [
      join(TicketsService.IMAGENES_DIR, seguro),
      join(process.cwd(), 'uploads', 'tickets', seguro),
    ];
    const archivo = candidatos.find((p) => existsSync(p));
    if (!archivo) return null;

    // Que el archivo exista no basta: tiene que estar referenciado por una nota.
    // Se busca el nombre dentro del jsonb de notas.
    const referenciadas = await this.repo
      .createQueryBuilder('t')
      .where('t.notes::text LIKE :f', { f: `%${seguro}%` })
      .getMany();
    if (!referenciadas.length) return null;

    const ext = seguro.split('.').pop() as string;
    return {
      path: archivo,
      mime: TicketsService.MIME_POR_EXT[ext] ?? 'application/octet-stream',
    };
  }

  /** Borra los archivos de un conjunto de notas. Ignora errores de disco. */
  private borrarArchivosDeNotas(notes: any[]): void {
    const directorios = [
      TicketsService.IMAGENES_DIR,
      join(process.cwd(), 'uploads', 'tickets'),
    ];
    for (const note of notes ?? []) {
      for (const url of note?.images ?? []) {
        const name = basename(typeof url === 'string' ? url : '');
        if (!TicketsService.IMAGEN_RE.test(name)) continue;
        for (const dir of directorios) {
          const p = join(dir, name);
          if (existsSync(p)) {
            try {
              unlinkSync(p);
            } catch {
              // Un archivo ya borrado o bloqueado no debe tumbar la operacion.
            }
          }
        }
      }
    }
  }

  /**
   * Envia un correo de confirmacion de cierre/resolucion al cliente para
   * tickets de web o WhatsApp que tengan un email del cliente.
   * Devuelve `{ enviado }`. No bloquea el cambio de estado.
   */
  async enviarConfirmacionCierre(
    id: string,
    to?: string,
  ): Promise<{ enviado: boolean; mensaje: string }> {
    const ticket = await this.findById(id);

    // El correo dice "tu solicitud ha sido resuelta". Enviarlo con el ticket
    // abierto le promete al cliente algo que todavia no ha ocurrido, y como el
    // endpoint es independiente del cierre, se podia repetir cuantas veces se
    // quisiera. Solo tiene sentido en `resolved` o ya en `closed`.
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new ConflictException(
        `No se puede enviar la confirmacion: ${ticket.codigo} esta en ` +
          `"${STATUS_LABELS[ticket.status] ?? ticket.status}". ` +
          'El ticket debe estar Resuelto.',
      );
    }

    if (ticket.sourceType !== 'web' && ticket.sourceType !== 'whatsapp') {
      return {
        enviado: false,
        mensaje:
          'El correo de confirmacion solo aplica a tickets de la web o WhatsApp.',
      };
    }
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return {
        enviado: false,
        mensaje: 'El ticket debe estar resuelto o cerrado.',
      };
    }

    const email = (to ?? '').trim() || this.getClientEmail(ticket);
    if (!email) {
      return {
        enviado: false,
        mensaje: 'El cliente no tiene un correo registrado.',
      };
    }

    const enviado = await this.ticketMail.enviarConfirmacionCierre(
      ticket,
      email,
    );
    return {
      enviado,
      mensaje: enviado
        ? 'Correo enviado correctamente.'
        : 'No se pudo enviar el correo.',
    };
  }

  /**
   * Cierre controlado de un ticket. Es el UNICO camino permitido para llegar a
   * `closed` (salvo el override del admin).
   *
   * Regla de negocio: un ticket solo se cierra cuando ya esta en `resolved`, y
   * siempre mediante una accion explicita del usuario: "enviar correo y cerrar"
   * o "solamente cerrar". Antes el cierre era un cambio de estado mas, con lo
   * que se cerraban tickets a medias desde cualquier estado.
   *
   * El correo se envia ANTES de cerrar. Al reves se dejaba el ticket cerrado
   * aunque el correo fallara, y el cliente se quedaba sin la confirmacion sin
   * que nadie se enterara. Aqui si el correo falla no se cierra nada.
   *
   * @param enviarCorreo si es true, el correo es obligatorio: si falla, aborta.
   */
  async cerrarTicket(
    id: string,
    opciones: { enviarCorreo?: boolean; to?: string } = {},
    actor?: { id?: string; role?: string },
  ): Promise<{ cerrado: boolean; correoEnviado: boolean; mensaje: string }> {
    const ticket = await this.findById(id);
    const role = actor?.role ?? 'advisor';

    // El desarrollador nunca cierra: su flujo termina en `resolved`.
    if (role === 'desarrollador') {
      throw new ForbiddenException(
        'El perfil desarrollador no puede cerrar tickets. Dejalo en resuelto y el asesor lo cerrara.',
      );
    }

    if (ticket.status === 'closed') {
      return {
        cerrado: true,
        correoEnviado: false,
        mensaje: 'El ticket ya estaba cerrado.',
      };
    }

    // El admin puede cerrar desde cualquier estado como override de soporte.
    const adminOverride = role === 'admin' || role === 'superadmin';
    if (!adminOverride && ticket.status !== 'resolved') {
      throw new ConflictException(
        `Solo se puede cerrar un ticket que este en "Resuelto". ` +
          `${ticket.codigo} esta en "${STATUS_LABELS[ticket.status] ?? ticket.status}". ` +
          'Marcalo como Resuelto y despues cerralo.',
      );
    }

    let correoEnviado = false;
    if (opciones.enviarCorreo) {
      const resultado = await this.enviarConfirmacionCierre(id, opciones.to);
      if (!resultado.enviado) {
        // No se cierra: es preferible un ticket resuelto con el correo pendiente
        // que un ticket cerrado que el cliente nunca recibio.
        throw new ServiceUnavailableException(
          `No se cerro el ticket porque no se pudo enviar el correo: ${resultado.mensaje}`,
        );
      }
      correoEnviado = true;
    }

    const sender = actor?.id ? await this.resolveUser(actor.id) : null;

    const prevStatus = ticket.status;
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = sender ?? ticket.closedBy ?? null;
    ticket.slaDeadline = null;
    ticket.updatedAt = new Date();
    await this.repo.save(ticket);

    const recipients = this.collectTicketRecipients(ticket, actor?.id);
    const toLabel = 'Cerrado';
    const fromLabel = STATUS_LABELS[prevStatus] ?? prevStatus;
    const quien = sender?.name ?? 'Sistema';

    await this.emitNotification({
      type: 'ticket_closed',
      title: `${toLabel}: ${ticket.codigo}`,
      message:
        `${quien} cerro ${ticket.codigo}: "${ticket.titulo}"` +
        (correoEnviado ? ' (con correo de confirmacion al cliente)' : ' (sin correo)'),
      entityId: ticket.id,
      entityCodigo: ticket.codigo,
      recipientIds: recipients,
      senderId: actor?.id,
      meta: { from: prevStatus, to: 'closed', correoEnviado },
    });

    await this.audit.registrar({
      ticketId: ticket.id,
      ticketCodigo: ticket.codigo,
      accion: 'ticket_cerrado',
      campo: 'status',
      before: { status: prevStatus },
      after: {
        status: 'closed',
        closedAt: ticket.closedAt,
        correoEnviado,
        correoDestinatario: correoEnviado ? opciones.to ?? 'registrado' : null,
        adminOverride: prevStatus !== 'resolved',
      },
      actor: { id: actor?.id, name: sender?.name, role },
    });

    this.gateway.broadcastTicketEvent('ticket:updated', {
      id: ticket.id,
      codigo: ticket.codigo,
    });

    this.logger.log(
      `Ticket ${ticket.codigo} cerrado por ${quien} ` +
        `(estado previo: ${fromLabel}, correo: ${correoEnviado ? 'si' : 'no'}).`,
    );

    return {
      cerrado: true,
      correoEnviado,
      mensaje: correoEnviado
        ? 'Ticket cerrado y correo de confirmacion enviado.'
        : 'Ticket cerrado.',
    };
  }

  private getClientEmail(ticket: Ticket): string {
    if (!ticket.clientInfo) return '';
    const info = ticket.clientInfo;
    return String(info['email'] ?? info['correo'] ?? '').trim();
  }

  private collectTicketRecipients(
    ticket: Ticket,
    actorId?: string,
  ): Set<string> {
    const ids = new Set<string>();
    if (ticket.createdBy?.id) ids.add(ticket.createdBy.id);
    if (ticket.assignedTo?.id) ids.add(ticket.assignedTo.id);
    if (actorId) ids.delete(actorId);
    return ids;
  }

  private async emitNotification(data: {
    type: string;
    title: string;
    message: string;
    entityId: string;
    entityCodigo?: string;
    recipientIds?: (string | null | undefined)[] | Set<string>;
    senderId?: string | null;
    meta?: Record<string, any>;
  }): Promise<void> {
    const recipients = new Set<string>();

    if (data.recipientIds) {
      for (const id of data.recipientIds) {
        if (id) recipients.add(id);
      }
    }

    const admins = await this.userRepo.find({
      where: { role: 'admin' },
      select: ['id'],
    });
    for (const admin of admins) recipients.add(admin.id);

    if (data.senderId) recipients.delete(data.senderId);

    if (recipients.size === 0) return;

    for (const recipientId of recipients) {
      try {
        await this.notifications.create({
          type: data.type,
          title: data.title,
          message: data.message,
          entityType: 'ticket',
          entityId: data.entityId,
          entityCodigo: data.entityCodigo,
          recipientId,
          senderId: data.senderId ?? undefined,
          meta: data.meta,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to emit notification ${data.type}: ${(err as Error).message}`,
        );
      }
    }
  }
}
