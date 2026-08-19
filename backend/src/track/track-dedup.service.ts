import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class TrackDedupService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly prefix = 'track:';

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async registrarSiNuevo(
    tipo: 'open' | 'click',
    comunicadoId: string,
    email: string,
    ttlSeconds = 7 * 24 * 3600,
  ): Promise<boolean> {
    // Validate inputs to prevent Redis key abuse
    if (!comunicadoId || comunicadoId.length > 128) return true;
    const emailNorm = email?.toLowerCase().trim();
    if (!emailNorm || emailNorm.length > 254 || !emailNorm.includes('@'))
      return true;
    const key = `${this.prefix}${tipo}:${comunicadoId}:${emailNorm}`;
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return true;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
