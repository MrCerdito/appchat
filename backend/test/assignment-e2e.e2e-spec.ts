/**
 * PRUEBA END-TO-END DE ASIGNACIÓN AUTOMÁTICA DE ASESORES
 *
 * Correr AISLADO (evita el flushdb del e2e-full):
 *   npx jest --config ./test/jest-e2e.json --runInBand assignment-e2e
 *
 * Requiere el backend corriendo en :3001 (start:dev:local) con la BD y Redis
 * de desarrollo locales.
 *
 * Reglas que valida (flujo real por socket → request_advisor → autoAssign):
 *  1. Colegio con asesor asignado + asesor online → se asigna al asesor del colegio.
 *  2. Asesor del colegio desconectado + hay disponible → se asigna a cualquier disponible.
 *  3. Colegio sin asesor asignado → se asigna a cualquier asesor disponible.
 *  4. Colegio "asignado" a un desarrollador → NUNCA se asigna al desarrollador.
 *  5. Nadie disponible → la sesión queda en "waiting" encolada.
 *  6. Asesor en almuerzo no recibe la sesión (va para otro disponible).
 *
 * Usa los asesores reales existentes: Asesor 1 (A) y Asesor 3 (B), con JWTs
 * firmados localmente (sin contraseñas). Crea/borra colegios y sesiones
 * temporales (prefijo ZZZ).
 */

jest.setTimeout(90_000);

const { io } = require('socket.io-client') as any;
const Redis = require('ioredis') as any;
const jwt = require('jsonwebtoken') as any;
const { Client: PgClient } = require('pg') as any;
const { randomUUID } = require('crypto') as any;
const path = require('path') as any;
const fs = require('fs') as any;

const WS = 'http://localhost:3001';
const BASE = 'http://localhost:3001';

const DB = {
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'postgres',
  database: 'app',
};

// Asesores reales de desarrollo (no se modifican ni se borran).
const ADVISOR_A = {
  id: '53d0f70d-dc07-425f-a303-8d499972a688',
  name: 'Asesor 1',
  email: 'asesor1@innovacloud.co',
};
const ADVISOR_B = {
  id: '78244b7c-d5da-430f-8676-59d1f50fb798',
  name: 'Asesor 3',
  email: 'asesor3@innovacloud.co',
};
const DEVELOPER = {
  id: '5c318483-8913-4655-9aaa-a922236d181f',
  name: 'Jean Munoz',
  email: 'jean.munozd@gmail.com',
};

// Estado compartido del suite
let JWT_SECRET = '';
let pg: any;
let redis: any;
let sockA: any = null;
let sockB: any = null;
let coleA = '';
let coleB = '';
let coleSin = '';
let coleDev = '';
const createdSessionIds: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mintToken(u: { id: string; email: string; name: string }): string {
  return jwt.sign({ sub: u.id, email: u.email, name: u.name }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

function openSocket(auth?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = io(WS, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      ...(auth ? { auth } : {}),
    });
    const t = setTimeout(() => {
      try { sock.close(); } catch {}
      reject(new Error('socket connect timeout'));
    }, 10_000);
    sock.once('connect', () => {
      clearTimeout(t);
      resolve(sock);
    });
    sock.once('connect_error', (e: any) => {
      clearTimeout(t);
      try { sock.close(); } catch {}
      reject(e);
    });
  });
}

function destroySocket(sock: any): void {
  if (sock) {
    try { sock.disconnect(); sock.close(); } catch {}
  }
}

async function insertColegio(nombre: string, advisorId: string | null): Promise<string> {
  const id = randomUUID();
  await pg.query(
    `INSERT INTO colegios (id, nombre, link, email, advisor_id, activo)
     VALUES ($1, $2, $3, '', $4, true)`,
    [id, nombre, 'https://example.com/zzz', advisorId],
  );
  return id;
}

async function createClientSession(colegio: string): Promise<{ id: string; codigo: string }> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientName: 'Test Asignacion',
      identificacion: '1234567890',
      apellido: 'Prueba',
      rol: 'estudiante',
      colegio,
      tipoSolicitud: 'info',
    }),
  });
  const body: any = await res.json();
  expect(res.status).toBe(201);
  expect(body.id).toBeDefined();
  createdSessionIds.push(body.id);
  return body;
}

/** Flujo real del widget: socket cliente → join_session → request_advisor */
async function clientePideAsesor(colegio: string): Promise<{ sid: string; sock: any }> {
  const { id: sid } = await createClientSession(colegio);
  const sock = await openSocket();
  sock.emit('join_session', { sessionId: sid, clientName: 'Test Asignacion' });
  await sleep(500);
  sock.emit('request_advisor', sid);
  return { sid, sock };
}

async function waitSession(
  sid: string,
  timeout = 12_000,
): Promise<{ status: string; advisor: string | null }> {
  const deadline = Date.now() + timeout;
  let cur = { status: 'ai', advisor: null as string | null };
  for (;;) {
    const r = await pg.query(
      'SELECT status, advisor_id FROM sessions WHERE id = $1',
      [sid],
    );
    if (r.rows.length) {
      cur = { status: r.rows[0].status, advisor: r.rows[0].advisor_id ?? null };
    }
    if (cur.status === 'active' && cur.advisor) return cur;
    if (Date.now() >= deadline) return cur;
    await sleep(250);
  }
}

async function waitQueue(sid: string, timeout = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const items: string[] = await redis.lrange('chat:waiting-queue', 0, -1);
    if (items.includes(sid)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(250);
  }
}

async function advisorConectadoRedis(id: string): Promise<boolean> {
  const ids: string[] = await redis.smembers('chat:connected-advisors');
  return ids.includes(id);
}

async function eventoRegistrado(sid: string, tipo: string): Promise<boolean> {
  const r = await pg.query(
    'SELECT COUNT(*)::int AS n FROM session_events WHERE session_id = $1 AND tipo = $2',
    [sid, tipo],
  );
  return r.rows[0].n > 0;
}

function waitEvent(sock: any, eventName: string, timeout = 8_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`evento "${eventName}" no llegó`)), timeout);
    sock.once(eventName, (data: any) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

const limpia = async (): Promise<void> => {
  destroySocket(sockB); sockB = null;
  destroySocket(sockA); sockA = null;
  // restaura: A queda online de nuevo
  try { sockA = await openSocket({ token: mintToken(ADVISOR_A) }); await sleep(500); } catch {}
  try { await redis.hdel('chat:on-lunch', ADVISOR_A.id); } catch {}
  try { await redis.sadd('chat:connected-advisors', ADVISOR_A.id); } catch {}
  try { await pg.query('UPDATE users SET status = \'online\' WHERE id = $1', [ADVISOR_A.id]); } catch {}
};

describe('Asignación automática de asesores (e2e)', () => {
  beforeAll(async () => {
    const envPath = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const m = raw.match(/^JWT_SECRET=(.+)$/m);
    JWT_SECRET = (m ? m[1] : '').trim();
    expect(JWT_SECRET).toBeTruthy();

    pg = new PgClient(DB);
    await pg.connect();
    redis = new Redis({
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: 3,
    });

    coleA = await insertColegio(`ZZZ Asignacion Con Asesor A ${randomUUID().slice(0, 6)}`, ADVISOR_A.id);
    coleB = await insertColegio(`ZZZ Asignacion Con Asesor B ${randomUUID().slice(0, 6)}`, ADVISOR_B.id);
    coleSin = await insertColegio(`ZZZ Asignacion Sin Asesor ${randomUUID().slice(0, 6)}`, null);
    coleDev = await insertColegio(`ZZZ Asignacion Desarrollador ${randomUUID().slice(0, 6)}`, DEVELOPER.id);

    // Conectar A (asesor del colegio + disponible) y esperar a que quede online
    // y registrado en Redis. B se DEJA desconectado.
    sockA = await openSocket({ token: mintToken(ADVISOR_A) });
    const deadline = Date.now() + 10_000;
    for (;;) {
      const online = await advisorConectadoRedis(ADVISOR_A.id);
      if (online) break;
      if (Date.now() >= deadline) throw new Error('Asesor A no quedó conectado en Redis');
      await sleep(250);
    }
    expect(await advisorConectadoRedis(ADVISOR_B.id)).toBe(false);
  });

  afterAll(async () => {
    try {
      await limpia();
      // Borrar datos temporales (en orden para respetar FK)
      if (createdSessionIds.length) {
        await pg.query(
          'DELETE FROM session_events WHERE session_id = ANY($1)',
          [createdSessionIds],
        );
        await pg.query('DELETE FROM messages WHERE session_id = ANY($1)', [
          createdSessionIds,
        ]);
        await pg.query('DELETE FROM sessions WHERE id = ANY($1)', [
          createdSessionIds,
        ]);
      }
      for (const cid of [coleA, coleB, coleSin, coleDev]) {
        if (cid) await pg.query('DELETE FROM colegios WHERE id = $1', [cid]);
      }
    } catch (e) {
      console.error('[cleanup] ', e);
    }
    try { await redis.quit(); } catch {}
    try { await pg.end(); } catch {}
  });

  test('1) Colegio con asesor asignado y ONLINE → se asigna al asesor del colegio (A)', async () => {
    const { sid, sock } = await clientePideAsesor(coleA);
    try {
      const evtP = waitEvent(sockA, 'session_assigned');
      const res = await waitSession(sid);
      expect(res.status).toBe('active');
      expect(res.advisor).toBe(ADVISOR_A.id);
      const evt = await evtP;
      expect(evt.sessionId).toBe(sid);
      expect(await eventoRegistrado(sid, 'solicitud_asesor')).toBe(true);
    } finally {
      destroySocket(sock);
    }
  });

  test('2) Asesor del colegio DESCONECTADO + hay disponible → se asigna a cualquier (A)', async () => {
    const { sid, sock } = await clientePideAsesor(coleB);
    try {
      const res = await waitSession(sid);
      expect(res.status).toBe('active');
      expect(res.advisor).toBe(ADVISOR_A.id); // B (primario del colegio) está offline
    } finally {
      destroySocket(sock);
    }
  });

  test('3) Colegio SIN asesor asignado → se asigna a cualquier disponible (A)', async () => {
    const { sid, sock } = await clientePideAsesor(coleSin);
    try {
      const res = await waitSession(sid);
      expect(res.status).toBe('active');
      expect([ADVISOR_A.id, ADVISOR_B.id]).toContain(res.advisor);
    } finally {
      destroySocket(sock);
    }
  });

  test('4) Colegio "asignado" a un desarrollador → nunca al desarrollador, sí a un asesor', async () => {
    const { sid, sock } = await clientePideAsesor(coleDev);
    try {
      const res = await waitSession(sid);
      expect(res.status).toBe('active');
      expect(res.advisor).not.toBe(DEVELOPER.id);
      expect([ADVISOR_A.id, ADVISOR_B.id]).toContain(res.advisor);
    } finally {
      destroySocket(sock);
    }
  });

  test('5) Nadie disponible → la sesión queda en "waiting" y encolada', async () => {
    // Simular "nadie disponible": quitar temporalmente a A de Redis (B ya está
    // offline). Se restaura en el finally.
    const estabaA = await advisorConectadoRedis(ADVISOR_A.id);
    await redis.srem('chat:connected-advisors', ADVISOR_A.id);
    const { sid, sock } = await clientePideAsesor(coleA);
    try {
      const res = await waitSession(sid, 8000);
      expect(res.status).toBe('waiting');
      expect(res.advisor).toBeNull();
      expect(await waitQueue(sid, 8000)).toBe(true);
    } finally {
      destroySocket(sock);
      if (estabaA) await redis.sadd('chat:connected-advisors', ADVISOR_A.id);
      const r = await pg.query('SELECT status FROM sessions WHERE id=$1', [sid]);
      if (r.rows[0]?.status === 'waiting') {
        await pg.query('UPDATE sessions SET status = \'closed\' WHERE id = $1', [sid]);
        await redis.lrem('chat:waiting-queue', 0, sid);
      }
    }
  });

  test('6) Asesor en ALMUERZO no recibe → se asigna al otro disponible (B)', async () => {
    // B pasa a disponible (conectado). A en almuerzo (Redis).
    sockB = await openSocket({ token: mintToken(ADVISOR_B) });
    const deadline = Date.now() + 10_000;
    for (;;) {
      if (await advisorConectadoRedis(ADVISOR_B.id)) break;
      if (Date.now() >= deadline) throw new Error('Asesor B no quedó conectado');
      await sleep(250);
    }
    await redis.hset('chat:on-lunch', ADVISOR_A.id, JSON.stringify({}));

    const { sid, sock } = await clientePideAsesor(coleA);
    try {
      const res = await waitSession(sid);
      expect(res.status).toBe('active');
      expect(res.advisor).toBe(ADVISOR_B.id);
    } finally {
      destroySocket(sock);
      try { await redis.hdel('chat:on-lunch', ADVISOR_A.id); } catch {}
    }
  });
});