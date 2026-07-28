import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { WidgetConfig } from './entities/widget-config.entity';

@Injectable()
export class WidgetConfigService {
  private readonly CACHE_KEY = 'widget:config';
  private readonly CACHE_TTL = 60_000;

  constructor(
    @InjectRepository(WidgetConfig)
    private readonly repo: Repository<WidgetConfig>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async get(): Promise<WidgetConfig> {
    const cached = await this.cache.get<WidgetConfig>(this.CACHE_KEY);
    if (cached) return cached;

    let existing = await this.repo.findOne({ where: {} });
    if (existing) {
      if (existing.chatUrl === '/') {
        existing.chatUrl = 'https://ia.innovacloud.co';
        existing = await this.repo.save(existing);
      }
      await this.cache.set(this.CACHE_KEY, existing, this.CACHE_TTL);
      return existing;
    }

    const nueva = this.repo.create();
    const saved = await this.repo.save(nueva);
    await this.cache.set(this.CACHE_KEY, saved, this.CACHE_TTL);
    return saved;
  }

  async save(data: Partial<WidgetConfig>): Promise<WidgetConfig> {
    if (data.chatUrl === '/') {
      data.chatUrl = 'https://ia.innovacloud.co';
    }

    const existing = await this.repo.findOne({ where: {} });

    let saved: WidgetConfig;
    if (existing) {
      Object.assign(existing, data);
      saved = await this.repo.save(existing);
    } else {
      const nueva = this.repo.create(data);
      saved = await this.repo.save(nueva);
    }

    await this.cache.set(this.CACHE_KEY, saved, this.CACHE_TTL);
    return saved;
  }

  async reset(): Promise<WidgetConfig> {
    const existing = await this.repo.findOne({ where: {} });
    if (existing) {
      await this.repo.remove(existing);
    }
    const nueva = this.repo.create();
    const saved = await this.repo.save(nueva);
    await this.cache.set(this.CACHE_KEY, saved, this.CACHE_TTL);
    return saved;
  }
}
