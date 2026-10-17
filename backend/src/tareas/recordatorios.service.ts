import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull, LessThanOrEqual } from 'typeorm';
import { Tarea } from './tarea.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

/** Cada cuanto se revisan los vencimientos. */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Ventana de aviso antes del vencimiento. Pasada la fecha, la tarea se considera
 * vencida y entra en el segundo tramo.
 */
const AVISO_PREVIO_MS = 2 * 3600_000;

/**
 * Antiguedad maxima del antirrebote. Sin esto, una tarea `bloqueada` con fecha
 * en el futuro que va y viene entre estados volveria a notificar cada 2 horas
 * indefinidamente; el tope lo deja en un aviso por ventana de 24h.
 */
const REENVIO_MS = 24 * 3600_000;

/**
 * Recordatorios de vencimiento de tareas.
 *
 * Calcado del `SlaService`: el unico detalle imprescindible es implementar
 * `OnModuleDestroy`, porque Nest solo invoca `onDestroy()` si el metodo existe
 * con ESE nombre. Si no, el `setInterval` sobrevive al apagado del proceso.
 */
@Injectable()
export class TareasRecordatoriosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TareasRecordatoriosService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private corriendo = false;

  constructor(
    @InjectRepository(Tarea) private readonly tareaRepo: Repository<Tarea>,
    @InjectRepository(TaskAssignee) private readonly assigneeRepo: Repository<TaskAssignee>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.revisarVencimientos();
    }, CHECK_INTERVAL_MS);
    this.logger.log('Tareas recordatorios started (60s interval)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async revisarVencimientos(): Promise<void> {
    // El tick anterior podia seguir vivo si la consulta tardo mas de 60s: sin
    // este cerrojo se solaparian dos barridos y se notificaria dos veces.
    if (this.corriendo) return;
    this.corriendo = true;

    try {
      const ahora = new Date();
      const limiteProximo = new Date(ahora.getTime() + AVISO_PREVIO_MS);
      const reenvioAntiguo = new Date(ahora.getTime() - REENVIO_MS);

      // Solo se miran tareas sin resolver con fecha, y cuyo antirrebote permita
      // volver a avisar. El filtro por `reminder_sent_at` va en SQL para no
      // traer el historico entero y descartar en memoria.
      const candidatas = await this.tareaRepo.find({
        where: [
          {
            status: In(['pendiente', 'en_progreso', 'bloqueada', 'revision']),
            dueDate: Not(IsNull()),
            reminderSentAt: IsNull(),
          },
          {
            status: In(['pendiente', 'en_progreso', 'bloqueada', 'revision']),
            dueDate: Not(IsNull()),
            reminderSentAt: LessThanOrEqual(reenvioAntiguo),
          },
        ],
        relations: { asignees: true, createdBy: true },
      });

      for (const tarea of candidatas) {
        const vencePronto = tarea.dueDate!.getTime() <= limiteProximo.getTime();
        if (!vencePronto) continue;

        // Se marca ANTES de notificar. Si el envio falla, la tarea no se
        // reintenta cada 60s, que es lo que pasaria marcando despues.
        tarea.reminderSentAt = ahora;
        await this.tareaRepo.save(tarea);

        await this.notificarVencimiento(tarea);
      }
    } catch (err: any) {
      this.logger.error(`Fallo el barrido de recordatorios: ${err?.message ?? err}`);
    } finally {
      this.corriendo = false;
    }
  }

  private async notificarVencimiento(tarea: Tarea): Promise<void> {
    const vencida = (tarea.dueDate?.getTime() ?? 0) <= Date.now();
    const cuando = vencida ? 'vencio' : 'vence';

    const titulo = vencida
      ? `${tarea.codigo} esta vencida`
      : `${tarea.codigo} vence pronto`;

    // A los responsables. Si no hay ninguno, al autor: una tarea sin duenos
    // sigue siendo trabajo de alguien y el aviso debe llegar a alguien.
    const targets = new Set<string>(tarea.asignees.map((a) => a.userId));
    if (!targets.size && tarea.createdById) targets.add(tarea.createdById);

    if (!targets.size) return;

    const fechas = tarea.dueDate
      ? tarea.dueDate.toLocaleString('es-CO', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const users = await this.userRepo.find({
      where: { id: In([...targets]) },
      select: { id: true },
    });
    const conAcceso = new Set(users.map((u) => u.id));

    for (const uid of targets) {
      if (!conAcceso.has(uid)) continue;
      try {
        await this.notifications.create({
          type: 'tarea_vencimiento',
          title: titulo,
          message: `"${tarea.titulo}" ${cuando}${fechas ? ` el ${fechas}` : ''}.`,
          entityType: 'tarea',
          entityId: tarea.id,
          entityCodigo: tarea.codigo,
          recipientId: uid,
          meta: {
            tareaId: tarea.id,
            codigo: tarea.codigo,
            vencida,
            dueDate: tarea.dueDate?.toISOString() ?? null,
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `No se pudo avisar del vencimiento a ${uid}: ${err?.message ?? err}`,
        );
      }
    }
  }
}