import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In, Not, IsNull } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { NotificationsService } from '../notifications/notifications.service';

const SLA_CHECK_INTERVAL_MS = 60_000;
const SLA_WARNING_BUFFER_MS = 60 * 60 * 1000;

@Injectable()
export class SlaService implements OnModuleInit {
  private readonly logger = new Logger(SlaService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Configuracion)
    private readonly configRepo: Repository<Configuracion>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(
      () => this.checkSla(),
      SLA_CHECK_INTERVAL_MS,
    );
    this.logger.log('SLA checker started (60s interval)');
  }

  onDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  async calculateDeadline(priority: string): Promise<Date | null> {
    const config = await this.configRepo.findOne({ where: {} });
    if (!config?.ticketSlaEnabled) return null;

    const hours = config.ticketSlaHours?.[priority];
    if (!hours || hours <= 0) return null;

    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  async recalculateDeadline(ticket: Ticket): Promise<Date | null> {
    const deadline = await this.calculateDeadline(ticket.priority);
    if (deadline) {
      const effectiveElapsed =
        Date.now() - ticket.createdAt.getTime() - (ticket.totalPausedMs ?? 0);
      ticket.slaDeadline = new Date(Date.now() + (deadline.getTime() - Date.now()));
    } else {
      ticket.slaDeadline = null;
    }
    return ticket.slaDeadline;
  }

  getEffectiveElapsedMs(ticket: Ticket): number {
    const now = ticket.pausedAt ? ticket.pausedAt.getTime() : Date.now();
    return now - ticket.createdAt.getTime() - (ticket.totalPausedMs ?? 0);
  }

  getTimeRemainingMs(ticket: Ticket): number | null {
    if (!ticket.slaDeadline) return null;
    const elapsed = this.getEffectiveElapsedMs(ticket);
    const deadlineMs = ticket.slaDeadline.getTime() - ticket.createdAt.getTime();
    return deadlineMs - elapsed;
  }

  async checkSla(): Promise<void> {
    try {
      const config = await this.configRepo.findOne({ where: {} });
      if (!config?.ticketSlaEnabled) return;

      const openTickets = await this.ticketRepo.find({
        where: {
          status: In(['open', 'in_progress']),
          slaDeadline: Not(IsNull()),
        },
        relations: ['createdBy', 'assignedTo'],
      });

      for (const ticket of openTickets) {
        const remainingMs = this.getTimeRemainingMs(ticket);
        if (remainingMs === null) continue;

        const now = Date.now();
        const oneHourAgo = new Date(now - 3600000);

        if (remainingMs <= 0) {
          if (
            !ticket.slaAlertedAt ||
            ticket.slaAlertedAt < oneHourAgo
          ) {
            await this.sendSlaNotification(ticket, 'expired');
            ticket.slaAlertedAt = new Date();
            await this.ticketRepo.save(ticket);
          }
        } else if (remainingMs <= SLA_WARNING_BUFFER_MS) {
          if (
            !ticket.slaAlertedAt ||
            ticket.slaAlertedAt < oneHourAgo
          ) {
            await this.sendSlaNotification(ticket, 'warning');
            ticket.slaAlertedAt = new Date();
            await this.ticketRepo.save(ticket);
          }
        }
      }
    } catch (err) {
      this.logger.error('SLA check failed', err);
    }
  }

  private async sendSlaNotification(
    ticket: Ticket,
    kind: 'warning' | 'expired',
  ): Promise<void> {
    const recipientIds = new Set<string>();

    if (ticket.createdBy?.id) recipientIds.add(ticket.createdBy.id);

    const ADMIN_ROLE = 'admin';
    const { User } = await import('../auth/entities/user.entity');
    const userRepo = this.ticketRepo.manager.getRepository(User);
    const admins = await userRepo.find({ where: { role: ADMIN_ROLE } });
    for (const admin of admins) recipientIds.add(admin.id);

    const type =
      kind === 'expired' ? 'ticket_sla_expired' : 'ticket_sla_warning';
    const title =
      kind === 'expired'
        ? `SLA vencido: ${ticket.codigo}`
        : `SLA por vencer: ${ticket.codigo}`;
    const message =
      kind === 'expired'
        ? `El ticket ${ticket.codigo} "${ticket.titulo}" ha superado el tiempo limite de resolucion.`
        : `El ticket ${ticket.codigo} "${ticket.titulo}" esta por vencer el SLA (menos de 1 hora).`;

    for (const recipientId of recipientIds) {
      if (recipientId === (ticket as any)._skipUserId) continue;
      await this.notifications.create({
        type,
        title,
        message,
        entityType: 'ticket',
        entityId: ticket.id,
        entityCodigo: ticket.codigo,
        recipientId,
        meta: {
          priority: ticket.priority,
          slaDeadline: ticket.slaDeadline?.toISOString(),
          kind,
        },
      });
    }
  }
}
