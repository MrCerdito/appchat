import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
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

  constructor(
    @InjectRepository(Ticket) private readonly repo: Repository<Ticket>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly ticketMail: TicketMailService,
    private readonly notifications: NotificationsService,
    private readonly sla: SlaService,
    private readonly gateway: TicketsGateway,
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

    const createdBy = userId ? await this.userRepo.findOneBy({ id: userId }) : null;

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
      recipientId: createdBy?.id ?? userId,
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
        recipientId: assignedTo.id,
        senderId: userId,
        meta: { priority: saved.priority },
      });
    }

    const result = Object.assign(saved, { emailEnviado });
    this.gateway.broadcastTicketEvent('ticket:created', { id: result.id, codigo: result.codigo });
    return result;
  }

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
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit ?? '20', 10)),
    );

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
      qb.andWhere('t.assignedTo = :assignedTo', { assignedTo: query.assignedTo });
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
    if (dto.descripcion !== undefined && dto.descripcion !== ticket.descripcion) {
      ticket.descripcion = dto.descripcion;
      baseChanges.push('la descripcion');
    }
    if (dto.category !== undefined && dto.category !== ticket.category) {
      ticket.category = dto.category;
      baseChanges.push('la categoria');
    }

    if (dto.priority !== undefined && dto.priority !== oldPriority) {
      ticket.priority = dto.priority;
      ticket.slaDeadline = await this.sla.calculateDeadline(dto.priority);
      ticket.slaAlertedAt = null;

      const recipients = this.collectTicketRecipients(ticket, userId);

      for (const rid of recipients) {
        await this.emitNotification({
          type: 'ticket_priority_changed',
          title: `Prioridad cambiada: ${ticket.codigo}`,
          message: `${sender?.name ?? 'Sistema'} cambio la prioridad de ${PRIORITY_LABELS[oldPriority] ?? oldPriority} a ${PRIORITY_LABELS[dto.priority] ?? dto.priority} en ${ticket.codigo}`,
          entityId: ticket.id,
          entityCodigo: ticket.codigo,
          recipientId: rid,
          senderId: userId,
          meta: { oldPriority, newPriority: dto.priority },
        });
      }
    }

    if (baseChanges.length > 0) {
      const recipients = this.collectTicketRecipients(ticket, userId);

      for (const rid of recipients) {
        await this.emitNotification({
          type: 'ticket_updated',
          title: `Ticket actualizado: ${ticket.codigo}`,
          message: `${sender?.name ?? 'Sistema'} modifico ${baseChanges.join(', ')} en ${ticket.codigo}: "${ticket.titulo}"`,
          entityId: ticket.id,
          entityCodigo: ticket.codigo,
          recipientId: rid,
          senderId: userId,
          meta: { changes: baseChanges },
        });
      }
    }

    if (dto.status !== undefined && dto.status !== oldStatus) {
      if (role === 'desarrollador' && dto.status === 'closed') {
        throw new ForbiddenException('Solo el asesor o administrador puede cerrar tickets');
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
      const action = closed
        ? 'cerro'
        : denied
          ? 'nego'
          : 'cambio el estado de';
      const toLabel = STATUS_LABELS[dto.status] ?? dto.status;
      const fromLabel = STATUS_LABELS[prevStatus] ?? prevStatus;

      for (const rid of recipients) {
        await this.emitNotification({
          type: notifType,
          title: `${toLabel}: ${ticket.codigo}`,
          message:
            closed || denied
              ? `${sender?.name ?? 'Sistema'} ${action} el ticket ${ticket.codigo}: "${ticket.titulo}" (estado previo: "${fromLabel}")`
              : `${sender?.name ?? 'Sistema'} ${action} "${fromLabel}" a "${toLabel}" en ${ticket.codigo}: "${ticket.titulo}"`,
          entityId: ticket.id,
          entityCodigo: ticket.codigo,
          recipientId: rid,
          senderId: userId,
          meta: { oldStatus: prevStatus, newStatus: dto.status },
        });
      }
    }

    if (dto.assignedToId !== undefined) {
      const newAssigned = dto.assignedToId
        ? await this.userRepo.findOneBy({ id: dto.assignedToId })
        : null;

      const prevAssignedId = oldAssignedToId;
      ticket.assignedTo = newAssigned;
      ticket.assignedToName = newAssigned?.name ?? (null as any);

      if (newAssigned && newAssigned.id !== prevAssignedId) {
        if (prevAssignedId && prevAssignedId !== userId) {
          await this.emitNotification({
            type: 'ticket_reassigned',
            title: `Ticket reasignado: ${ticket.codigo}`,
            message: `${sender?.name ?? 'Sistema'} reasigno ${ticket.codigo} a ${newAssigned.name}`,
            entityId: ticket.id,
            entityCodigo: ticket.codigo,
            recipientId: prevAssignedId,
            senderId: userId,
            meta: { reassignedTo: newAssigned.name, reassignedToId: newAssigned.id },
          });
        }

        if (newAssigned.id !== userId) {
          await this.emitNotification({
            type: 'ticket_assigned',
            title: `Ticket asignado: ${ticket.codigo}`,
            message: `${sender?.name ?? 'Sistema'} te asigno ${ticket.codigo}: "${ticket.titulo}"`,
            entityId: ticket.id,
            entityCodigo: ticket.codigo,
            recipientId: newAssigned.id,
            senderId: userId,
            meta: { priority: ticket.priority },
          });
        }
      }
    }

    const updated = await this.repo.save(ticket);
    this.gateway.broadcastTicketEvent('ticket:updated', { id: updated.id, codigo: updated.codigo });
    return updated;
  }

  async delete(id: string, userId?: string): Promise<void> {
    const ticket = await this.findById(id);

    const recipientIds = new Set<string>();
    const admins = await this.userRepo.find({ where: { role: 'admin' } });
    for (const admin of admins) recipientIds.add(admin.id);

    const result = await this.repo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException('Ticket no encontrado');

    for (const rid of recipientIds) {
      if (rid === userId) continue;
      await this.emitNotification({
        type: 'ticket_deleted',
        title: `Ticket eliminado: ${ticket.codigo}`,
        message: `El ticket ${ticket.codigo}: "${ticket.titulo}" fue eliminado`,
        entityId: id,
        entityCodigo: ticket.codigo,
        recipientId: rid,
        senderId: userId,
        meta: { priority: ticket.priority },
      });
    }

    this.gateway.broadcastTicketEvent('ticket:deleted', { id, codigo: ticket.codigo });
  }

  async addNote(id: string, dto: AddNoteDto, user?: any): Promise<Ticket> {
    const ticket = await this.findById(id);

    const images = (dto.images ?? []).filter((u: string) => /^\/uploads\//.test(u));

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

    const actorName = user?.name ?? 'Sistema';
    const recipients = this.collectTicketRecipients(ticket, user?.id);

    for (const rid of recipients) {
      await this.emitNotification({
        type: 'ticket_note',
        title: `Nueva nota: ${ticket.codigo}`,
        message: `${actorName} agrego una nota a ${ticket.codigo}: "${ticket.titulo}"`,
        entityId: ticket.id,
        entityCodigo: ticket.codigo,
        recipientId: rid,
        senderId: user?.id,
        meta: { priority: ticket.priority },
      });
    }

    this.gateway.broadcastTicketEvent('ticket:updated', { id: updated.id, codigo: updated.codigo });
    return updated;
  }

  async deleteNote(id: string, noteId: string, user?: any): Promise<{ ok: boolean }> {
    const ticket = await this.findById(id);
    if (!Array.isArray(ticket.notes)) throw new NotFoundException('Nota no encontrada');

    const noteIndex = ticket.notes.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) throw new NotFoundException('Nota no encontrada');

    const note = ticket.notes[noteIndex];
    if (note?.authorId && user?.id && note.authorId !== user?.id && user.role !== 'admin') {
      throw new ForbiddenException('Solo el autor o un admin puede eliminar esta nota');
    }

    ticket.notes.splice(noteIndex, 1);
    await this.repo.save(ticket);
    this.gateway.broadcastTicketEvent('ticket:updated', { id: ticket.id, codigo: ticket.codigo });
    return { ok: true };
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
    if (ticket.sourceType !== 'web' && ticket.sourceType !== 'whatsapp') {
      return { enviado: false, mensaje: 'El correo de confirmacion solo aplica a tickets de la web o WhatsApp.' };
    }
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return { enviado: false, mensaje: 'El ticket debe estar resuelto o cerrado.' };
    }

    const email = (to ?? '').trim() || this.getClientEmail(ticket);
    if (!email) {
      return { enviado: false, mensaje: 'El cliente no tiene un correo registrado.' };
    }

    const enviado = await this.ticketMail.enviarConfirmacionCierre(ticket, email);
    return { enviado, mensaje: enviado ? 'Correo enviado correctamente.' : 'No se pudo enviar el correo.' };
  }

  private getClientEmail(ticket: Ticket): string {
    if (!ticket.clientInfo) return '';
    const info = ticket.clientInfo;
    return String(info['email'] ?? info['correo'] ?? '').trim();
  }

  private collectTicketRecipients(ticket: Ticket, actorId?: string): Set<string> {
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
    recipientId?: string | null;
    senderId?: string | null;
    meta?: Record<string, any>;
  }): Promise<void> {
    if (!data.recipientId) return;
    const recipientId: string = data.recipientId;
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
