import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Changelog, ChangelogCategoria } from './changelog.entity';
import { ChangelogSeen } from './changelog-seen.entity';
import { NotificationsGateway, CHANGELOG_ROLES } from '../notifications/notifications.gateway';

export interface ChangelogData {
  titulo: string;
  categoria?: ChangelogCategoria;
  version?: string | null;
  cuerpo: string;
  design?: unknown[] | null;
  publicar?: boolean;
  publicadoEl?: string | null;
}

export interface ChangelogPublico {
  id: string;
  titulo: string;
  categoria: ChangelogCategoria;
  version: string | null;
  cuerpo: string;
  design: unknown[] | null;
  publicadoEl: Date | null;
  createdAt: Date;
}

@Injectable()
export class ChangelogsService {
  constructor(
    @InjectRepository(Changelog)
    private readonly changelogRepo: Repository<Changelog>,
    @InjectRepository(ChangelogSeen)
    private readonly seenRepo: Repository<ChangelogSeen>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /** Actualizaciones publicadas que el usuario aún no ha visto. */
  async pendientes(userId: string, role?: string): Promise<ChangelogPublico[]> {
    if (!role || !CHANGELOG_ROLES.includes(role)) return [];
    const rows = await this.changelogRepo
      .createQueryBuilder('c')
      .where('c.publicado = true')
      .andWhere('c.publicado_el <= NOW()')
      .andWhere(
        (qb) =>
          'NOT EXISTS ' +
          qb
            .subQuery()
            .select('1')
            .from(ChangelogSeen, 's')
            .where('s.changelog_id = c.id')
            .andWhere('s.user_id = :userId')
            .getQuery(),
      )
      .orderBy('c.publicado_el', 'DESC')
      .addOrderBy('c.created_at', 'DESC')
      .setParameter('userId', userId)
      .take(20)
      .getMany();

    return rows.map((c) => this.toPublico(c));
  }

  async marcarVisto(
    changelogId: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const changelog = await this.changelogRepo.findOne({
      where: { id: changelogId },
    });
    if (!changelog) {
      throw new NotFoundException('Actualización no encontrada');
    }
    const exists = await this.seenRepo.findOne({
      where: { changelogId, userId },
    });
    if (!exists) {
      await this.seenRepo.insert({ changelogId, userId });
    }
    return { ok: true };
  }

  /** Lista de gestión (incluye borradores). */
  async listarAdmin(): Promise<
    Array<Changelog & { visto: number }>
  > {
    const rows = await this.changelogRepo.find({
      order: { createdAt: 'DESC' },
      relations: { creadoPor: true },
    });
    const seenCounts = await this.seenRepo
      .createQueryBuilder('s')
      .select('s.changelog_id', 'changelogId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('s.changelog_id')
      .getRawMany<{ changelogId: string; cnt: string }>();
    const counts = new Map(
      seenCounts.map((s) => [s.changelogId, Number(s.cnt) || 0]),
    );
    return rows.map((c) => ({
      ...c,
      visto: counts.get(c.id) ?? 0,
    }));
  }

  async crear(
    data: ChangelogData,
    creadoPorId: string,
  ): Promise<ChangelogPublico> {
    if (!data.titulo?.trim()) {
      throw new BadRequestException('El título es requerido');
    }
    if (!data.cuerpo?.trim()) {
      throw new BadRequestException('El contenido es requerido');
    }
    const publicar = !!data.publicar;
    const row = this.changelogRepo.create({
      titulo: data.titulo.trim(),
      categoria: data.categoria ?? 'mejora',
      version: data.version?.trim() || null,
      cuerpo: data.cuerpo,
      design: data.design ?? null,
      publicado: publicar,
      publicadoEl: publicar ? this.fechaPublicacion(data.publicadoEl) : null,
      creadoPor: { id: creadoPorId } as any,
    });
    const saved = await this.changelogRepo.save(row);
    if (publicar) {
      this.notificationsGateway.broadcastChangelog(this.toPublico(saved));
    }
    return this.toPublico(saved);
  }

  async editar(
    id: string,
    data: ChangelogData,
  ): Promise<ChangelogPublico> {
    const changelog = await this.changelogRepo.findOne({ where: { id } });
    if (!changelog) {
      throw new NotFoundException('Actualización no encontrada');
    }
    changelog.titulo = data.titulo?.trim() || changelog.titulo;
    changelog.categoria = data.categoria ?? changelog.categoria;
    changelog.version =
      data.version === null || data.version === undefined
        ? changelog.version
        : data.version.trim() || null;
    if (typeof data.cuerpo === 'string') changelog.cuerpo = data.cuerpo;
    changelog.design = data.design ?? null;
    const publicar = !!data.publicar;
    if (publicar) {
      changelog.publicado = true;
      changelog.publicadoEl =
        data.publicadoEl !== undefined && data.publicadoEl !== null
          ? this.fechaPublicacion(data.publicadoEl)
          : changelog.publicadoEl ?? new Date();
    }
    const saved = await this.changelogRepo.save(changelog);
    if (publicar) {
      this.notificationsGateway.broadcastChangelog(this.toPublico(saved));
    }
    return this.toPublico(saved);
  }

  private fechaPublicacion(val?: string | null): Date {
    if (val) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  async eliminar(id: string): Promise<{ ok: boolean }> {
    const changelog = await this.changelogRepo.findOne({ where: { id } });
    if (!changelog) {
      throw new NotFoundException('Actualización no encontrada');
    }
    await this.changelogRepo.remove(changelog);
    return { ok: true };
  }

  private toPublico(c: Changelog): ChangelogPublico {
    return {
      id: c.id,
      titulo: c.titulo,
      categoria: c.categoria,
      version: c.version,
      cuerpo: c.cuerpo,
      design: c.design,
      publicadoEl: c.publicadoEl,
      createdAt: c.createdAt,
    };
  }
}