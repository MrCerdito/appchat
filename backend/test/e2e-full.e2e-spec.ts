import request from 'supertest';
import Redis from 'ioredis';

const BASE = 'http://localhost:3001';

const ADMIN = { email: 'admin@innovacloud.co', password: 'Admin@123456' };
const ASESOR = { email: 'asesor@innovacloud.com', password: 'Asesor@123456' };

let adminToken = '';
let asesorToken = '';

// ── Health ─────────────────────────────────────────────────────────────
describe('Health', () => {
  it('GET /health → 200 with status ok', async () => {
    const res = await request(BASE).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ── Auth ───────────────────────────────────────────────────────────────
describe('Auth', () => {
  it('POST /auth/login → 200 with tokens (admin)', async () => {
    const res = await request(BASE)
      .post('/auth/login')
      .send(ADMIN)
      .expect(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.access_token;
  });

  it('POST /auth/login → 200 with tokens (advisor)', async () => {
    const res = await request(BASE)
      .post('/auth/login')
      .send(ASESOR)
      .expect(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.role).toBe('advisor');
    asesorToken = res.body.access_token;
  });

  it('POST /auth/login → 400 with wrong password', async () => {
    const res = await request(BASE)
      .post('/auth/login')
      .send({ email: ADMIN.email, password: 'wrong' });
    expect([400, 401]).toContain(res.status);
  });

  it('POST /auth/login → 401 with non-existent user', async () => {
    const res = await request(BASE)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'Test@12345' });
    expect(res.status).toBe(401);
  });
});

// ── Sessions ───────────────────────────────────────────────────────────
describe('Sessions', () => {
  it('GET /sessions → 200 (admin sees all)', async () => {
    const res = await request(BASE)
      .get('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /sessions → 401 without token', async () => {
    await request(BASE).get('/sessions').expect(401);
  });

  it('GET /sessions → 401 with invalid token', async () => {
    await request(BASE)
      .get('/sessions')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
  });

  it('GET /sessions/waiting → 200 (waiting sessions)', async () => {
    const res = await request(BASE)
      .get('/sessions/waiting')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Advisors ───────────────────────────────────────────────────────────
describe('Advisors', () => {
  it('GET /advisors → 200 (admin)', async () => {
    const res = await request(BASE)
      .get('/advisors')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /advisors → 403 (advisor role)', async () => {
    await request(BASE)
      .get('/advisors')
      .set('Authorization', `Bearer ${asesorToken}`)
      .expect(403);
  });
});

// ── Configuracion ──────────────────────────────────────────────────────
describe('Configuracion', () => {
  it('GET /configuracion → 200', async () => {
    const res = await request(BASE)
      .get('/configuracion')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toBeDefined();
  });
});

// ── FAQs ───────────────────────────────────────────────────────────────
describe('FAQs', () => {
  it('GET /faq → 200', async () => {
    const res = await request(BASE).get('/faq').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Throttler (Redis) ──────────────────────────────────────────────────
// MUST be last: triggers 5-min blockDuration on /auth/login
describe('Throttler', () => {
  it('Returns 429 after exceeding rate limit', async () => {
    const requests = Array.from({ length: 7 }, () =>
      request(BASE)
        .post('/auth/login')
        .send({ email: 'throttletest@test.com', password: 'Wrong@12345' }),
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(429);
  });

  it('Flushes Redis throttle keys after test', async () => {
    const redis = new Redis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: 3 });
    await redis.flushdb();
    await redis.quit();
  });
});
