import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WidgetConfig } from './entities/widget-config.entity';

@Injectable()
export class WidgetConfigService {

  constructor(
    @InjectRepository(WidgetConfig)
    private readonly repo: Repository<WidgetConfig>,
  ) {}

  // ── Obtener config activa ─────────────────────────────────────────────────
  // Siempre hay una sola fila — si no existe, la crea con defaults.
  async get(): Promise<WidgetConfig> {
    const existing = await this.repo.findOne({ where: {} });
    if (existing) return existing;

    const nueva = this.repo.create();
    return this.repo.save(nueva);
  }

  // ── Guardar/actualizar config ─────────────────────────────────────────────
  async save(data: Partial<WidgetConfig>): Promise<WidgetConfig> {
    const existing = await this.repo.findOne({ where: {} });

    if (existing) {
      Object.assign(existing, data);
      return this.repo.save(existing);
    }

    const nueva = this.repo.create(data);
    return this.repo.save(nueva);
  }

  // ── Reset a defaults ──────────────────────────────────────────────────────
  async reset(): Promise<WidgetConfig> {
    const existing = await this.repo.findOne({ where: {} });
    if (existing) {
      await this.repo.remove(existing);
    }
    const nueva = this.repo.create();
    return this.repo.save(nueva);
  }
}