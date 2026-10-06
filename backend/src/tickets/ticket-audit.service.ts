import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketAudit } from './entities/ticket-audit.entity';

export interface RegistrarAuditoriaOpts {
  ticketId: string;
  ticketCodigo: string;
  accion: string;
  campo?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: { id?: string; name?: string; role?: string } | null;
}

/**
 * Writes de auditoría de tickets.
 *
 * Deliberadamente tolerante a fallos: un error al auditar no puede tumbar la
 * operación de negocio que ya se está ejecutando (cerrar un ticket, añadir una
 * nota). Se registra el error y se sigue.
 */
@Injectable()
export class TicketAuditService {
  private readonly logger = new Logger(TicketAuditService.name);

  constructor(
    @InjectRepository(TicketAudit)
    private readonly repo: Repository<TicketAudit>,
  ) {}

  async registrar(opts: RegistrarAuditoriaOpts): Promise<void> {
    try {
      // `save` en lugar de `insert`: TypeORM no tipa bien un objeto plano en las
      // columnas jsonb con `insert`.
      await this.repo.save({
        ticketId: opts.ticketId,
        ticketCodigo: opts.ticketCodigo,
        accion: opts.accion,
        campo: opts.campo ?? null,
        before: opts.before ?? null,
        after: opts.after ?? null,
        actorId: opts.actor?.id ?? null,
        actorName: opts.actor?.name ?? null,
        actorRole: opts.actor?.role ?? null,
      } as unknown as TicketAudit);
    } catch (err) {
      this.logger.error(
        `No se pudo auditar ${opts.accion} en ${opts.ticketCodigo}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async listarPorTicket(ticketId: string): Promise<TicketAudit[]> {
    return this.repo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }
}