import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Shared state for ChatGateway — Redis-backed so every PM2 instance sees the
// same advisor statuses, queue, presence, etc.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientPresenceData {
  online: boolean;
  active: boolean;
  socketId: string | null;
  lastSeen: number;
}

export interface RateLimitData {
  count: number;
  resetAt: number;
}

export interface PendingLunchData {
  inicioOriginal: string;
  finOriginal: string;
  duracionMs: number;
  inicioReal: string; // ISO string, serialized
}

// Keys
const K = {
  CONNECTED_ADVISORS: 'chat:connected-advisors', // SET
  ADVISOR_STATUSES: 'chat:advisor-statuses', // HASH advisorId→status
  WAITING_QUEUE: 'chat:waiting-queue', // LIST of sessionIds
  SESSION_TO_SOCKET: 'chat:session-to-socket', // HASH sessionId→socketId
  CLIENT_PRESENCE: 'chat:client-presence', // HASH sessionId→JSON
  RATE_LIMIT: 'chat:rate-limit', // HASH sessionId→JSON
  AI_ACTIVE: 'chat:ai-active', // SET of sessionIds
  ON_LUNCH: 'chat:on-lunch', // HASH advisorId→finHora
  PENDING_LUNCH: 'chat:pending-lunch', // HASH advisorId→JSON
  LUNCH_NOTIFIED: 'chat:lunch-notified', // SET of advisorIds
  ASSIGN_LOCK: 'chat:assign-lock', // STRING (SETNX for distributed lock)
} as const;

@Injectable()
export class RedisStateService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisStateService.name);

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 5,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTED ADVISORS (SET)
  // ═══════════════════════════════════════════════════════════════════════════

  async addConnectedAdvisor(advisorId: string): Promise<void> {
    await this.redis.sadd(K.CONNECTED_ADVISORS, advisorId);
  }

  async removeConnectedAdvisor(advisorId: string): Promise<void> {
    await this.redis.srem(K.CONNECTED_ADVISORS, advisorId);
  }

  async getConnectedAdvisorIds(): Promise<string[]> {
    return this.redis.smembers(K.CONNECTED_ADVISORS);
  }

  async getConnectedAdvisorCount(): Promise<number> {
    return this.redis.scard(K.CONNECTED_ADVISORS);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVISOR STATUSES (HASH)
  // ═══════════════════════════════════════════════════════════════════════════

  async setAdvisorStatus(advisorId: string, status: string): Promise<void> {
    await this.redis.hset(K.ADVISOR_STATUSES, advisorId, status);
  }

  async getAdvisorStatus(advisorId: string): Promise<string | null> {
    return this.redis.hget(K.ADVISOR_STATUSES, advisorId);
  }

  async getAdvisorStatuses(): Promise<Record<string, string>> {
    return this.redis.hgetall(K.ADVISOR_STATUSES);
  }

  async removeAdvisorStatus(advisorId: string): Promise<void> {
    await this.redis.hdel(K.ADVISOR_STATUSES, advisorId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAITING QUEUE (LIST — FIFO)
  // ═══════════════════════════════════════════════════════════════════════════

  async addToQueue(sessionId: string): Promise<void> {
    // Avoid duplicates: only lpush if not already in queue
    const exists = await this.redis.lpos(K.WAITING_QUEUE, sessionId);
    if (exists === null) {
      await this.redis.rpush(K.WAITING_QUEUE, sessionId);
    }
  }

  async removeFromQueue(sessionId: string): Promise<void> {
    await this.redis.lrem(K.WAITING_QUEUE, 1, sessionId);
  }

  async getQueue(): Promise<string[]> {
    return this.redis.lrange(K.WAITING_QUEUE, 0, -1);
  }

  async getQueuePosition(sessionId: string): Promise<number> {
    const pos = await this.redis.lpos(K.WAITING_QUEUE, sessionId);
    return pos ?? -1;
  }

  async getQueueLength(): Promise<number> {
    return this.redis.llen(K.WAITING_QUEUE);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION → SOCKET (HASH)
  // ═══════════════════════════════════════════════════════════════════════════

  async setSessionSocket(sessionId: string, socketId: string): Promise<void> {
    await this.redis.hset(K.SESSION_TO_SOCKET, sessionId, socketId);
  }

  async getSessionSocket(sessionId: string): Promise<string | null> {
    return this.redis.hget(K.SESSION_TO_SOCKET, sessionId);
  }

  async deleteSessionSocket(sessionId: string): Promise<void> {
    await this.redis.hdel(K.SESSION_TO_SOCKET, sessionId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT PRESENCE (HASH — JSON serialized)
  // ═══════════════════════════════════════════════════════════════════════════

  async setClientPresence(
    sessionId: string,
    data: ClientPresenceData,
  ): Promise<void> {
    await this.redis.hset(K.CLIENT_PRESENCE, sessionId, JSON.stringify(data));
  }

  async getClientPresence(
    sessionId: string,
  ): Promise<ClientPresenceData | null> {
    const raw = await this.redis.hget(K.CLIENT_PRESENCE, sessionId);
    return raw ? JSON.parse(raw) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE RATE LIMIT (HASH — JSON serialized)
  // ═══════════════════════════════════════════════════════════════════════════

  async setRateLimit(
    sessionId: string,
    data: RateLimitData,
  ): Promise<void> {
    await this.redis.hset(K.RATE_LIMIT, sessionId, JSON.stringify(data));
  }

  async getRateLimit(sessionId: string): Promise<RateLimitData | null> {
    const raw = await this.redis.hget(K.RATE_LIMIT, sessionId);
    return raw ? JSON.parse(raw) : null;
  }

  async deleteRateLimit(sessionId: string): Promise<void> {
    await this.redis.hdel(K.RATE_LIMIT, sessionId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI ACTIVE SESSIONS (SET)
  // ═══════════════════════════════════════════════════════════════════════════

  async addAiActive(sessionId: string): Promise<void> {
    await this.redis.sadd(K.AI_ACTIVE, sessionId);
  }

  async removeAiActive(sessionId: string): Promise<void> {
    await this.redis.srem(K.AI_ACTIVE, sessionId);
  }

  async isAiActive(sessionId: string): Promise<boolean> {
    return (await this.redis.sismember(K.AI_ACTIVE, sessionId)) === 1;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ON LUNCH (HASH advisorId→finHora)
  // ═══════════════════════════════════════════════════════════════════════════

  async setOnLunch(advisorId: string, finHora: string): Promise<void> {
    await this.redis.hset(K.ON_LUNCH, advisorId, finHora);
  }

  async getOnLunch(advisorId: string): Promise<string | null> {
    return this.redis.hget(K.ON_LUNCH, advisorId);
  }

  async isOnLunch(advisorId: string): Promise<boolean> {
    return (await this.redis.hexists(K.ON_LUNCH, advisorId)) === 1;
  }

  async removeOnLunch(advisorId: string): Promise<void> {
    await this.redis.hdel(K.ON_LUNCH, advisorId);
  }

  async getAllOnLunch(): Promise<Record<string, string>> {
    return this.redis.hgetall(K.ON_LUNCH);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PENDING LUNCH (HASH advisorId→JSON)
  // ═══════════════════════════════════════════════════════════════════════════

  async setPendingLunch(
    advisorId: string,
    data: PendingLunchData,
  ): Promise<void> {
    await this.redis.hset(K.PENDING_LUNCH, advisorId, JSON.stringify(data));
  }

  async getPendingLunch(
    advisorId: string,
  ): Promise<PendingLunchData | null> {
    const raw = await this.redis.hget(K.PENDING_LUNCH, advisorId);
    return raw ? JSON.parse(raw) : null;
  }

  async isPendingLunch(advisorId: string): Promise<boolean> {
    return (await this.redis.hexists(K.PENDING_LUNCH, advisorId)) === 1;
  }

  async removePendingLunch(advisorId: string): Promise<void> {
    await this.redis.hdel(K.PENDING_LUNCH, advisorId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LUNCH NOTIFIED (SET)
  // ═══════════════════════════════════════════════════════════════════════════

  async addLunchNotified(advisorId: string): Promise<void> {
    await this.redis.sadd(K.LUNCH_NOTIFIED, advisorId);
  }

  async isLunchNotified(advisorId: string): Promise<boolean> {
    return (await this.redis.sismember(K.LUNCH_NOTIFIED, advisorId)) === 1;
  }

  async removeLunchNotified(advisorId: string): Promise<void> {
    await this.redis.srem(K.LUNCH_NOTIFIED, advisorId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTED LOCK (for assignPendingSessions)
  // ═══════════════════════════════════════════════════════════════════════════

  async acquireAssignLock(ttlMs = 5000): Promise<boolean> {
    const result = await this.redis.set(
      K.ASSIGN_LOCK,
      '1',
      'PX',
      ttlMs,
      'NX',
    );
    return result === 'OK';
  }

  async releaseAssignLock(): Promise<void> {
    await this.redis.del(K.ASSIGN_LOCK);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP — remove stale advisor data on disconnect
  // ═══════════════════════════════════════════════════════════════════════════

  async cleanupAdvisor(advisorId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.srem(K.CONNECTED_ADVISORS, advisorId);
    pipeline.hdel(K.ADVISOR_STATUSES, advisorId);
    pipeline.hdel(K.ON_LUNCH, advisorId);
    pipeline.hdel(K.PENDING_LUNCH, advisorId);
    pipeline.srem(K.LUNCH_NOTIFIED, advisorId);
    await pipeline.exec();
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.lrem(K.WAITING_QUEUE, 0, sessionId);
    pipeline.hdel(K.SESSION_TO_SOCKET, sessionId);
    pipeline.hdel(K.CLIENT_PRESENCE, sessionId);
    pipeline.hdel(K.RATE_LIMIT, sessionId);
    pipeline.srem(K.AI_ACTIVE, sessionId);
    await pipeline.exec();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
