import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3001';

const sessionCreated = new Counter('sessions_created');
const wsConnected = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages_sent');
const errorRate = new Rate('errors');
const sessionDuration = new Trend('session_creation_duration', true);
const aiChatDuration = new Trend('ai_chat_duration', true);

const COLEGIOS = [
  'Colegio San José', 'Instituto Nuevo Mundo', 'Colegio La Salle',
  'Colegio Mariano', 'Institución Educativa Kennedy', 'Colegio San Pedro',
  'Institución Educativa Popular', 'Colegio Santa María',
];

const ROLES = ['estudiante', 'padre', 'docente'];
const SOLICITUDES = [
  'Consulta académica', 'Soporte técnico', 'Información de matrícula',
  'Problema con plataforma', 'Solicitud de documentos', 'Queja o reclamo',
  'Información de horarios', 'Soporte financiero',
];

const AI_MESSAGES = [
  '¿Cuáles son los horarios de atención?',
  'Necesito información sobre matrícula',
  '¿Cómo puedo pagar mi deuda?',
  'Tengo un problema con mi cuenta',
  '¿Cuándo empieza el próximo.semestre?',
  '¿Qué documentos necesito para inscribirme?',
  'Necesito hablar con un asesor',
  '¿Dónde puedo ver mis calificaciones?',
];

let adminToken = '';
let advisorToken = '';

// ── Helpers ────────────────────────────────────────────────────────────
function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login' } },
  );
  if (res.status === 200) {
    return res.json('access_token');
  }
  return '';
}

function randomId() {
  return `${randomIntBetween(100000, 999999)}`;
}

function randomName() {
  const names = [
    'Carlos', 'María', 'Juan', 'Ana', 'Pedro', 'Laura', 'Miguel', 'Sofía',
    'Andrés', 'Camila', 'Diego', 'Valentina', 'Luis', 'Isabella', 'Fernando', 'Luciana',
    'Roberto', 'Gabriela', 'Alejandro', 'Daniela',
  ];
  return randomItem(names);
}

function randomLastName() {
  const last = [
    'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández',
    'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez',
    'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Gutiérrez', 'Castillo',
  ];
  return randomItem(last);
}

// ── Scenarios ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    client_sessions: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 32 },
        { duration: '1m', target: 80 },
        { duration: '1m', target: 80 },
        { duration: '30s', target: 0 },
      ],
      exec: 'clientFlow',
    },
    public_reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 16 },
        { duration: '1m', target: 40 },
        { duration: '1m', target: 40 },
        { duration: '30s', target: 0 },
      ],
      exec: 'publicReadFlow',
    },
    advisor_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'advisorFlow',
    },
    ai_chat: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 8 },
        { duration: '1m', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      exec: 'aiChatFlow',
    },
    websocket_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 4 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
      exec: 'websocketFlow',
    },
  },
  thresholds: {
    http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: false }],
    errors: [{ threshold: 'rate<0.5', abortOnFail: false }],
  },
};

// ── Setup (runs once) ──────────────────────────────────────────────────
export function setup() {
  adminToken = login('admin@innovacloud.co', 'Admin@123456');
  advisorToken = login('asesor@innovacloud.com', 'Asesor@123456');

  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Backend not healthy: ${healthRes.status}`);
  }

  return { adminToken, advisorToken };
}

// ── Scenario 1: Client creates session ─────────────────────────────────
export function clientFlow() {
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'client_session' },
  };

  group('Client → Create Session', () => {
    const payload = {
      clientName: randomName(),
      identificacion: randomId(),
      apellido: randomLastName(),
      rol: randomItem(ROLES),
      colegio: randomItem(COLEGIOS),
      tipoSolicitud: randomItem(SOLICITUDES),
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/sessions`, JSON.stringify(payload), params);
    const elapsed = Date.now() - start;
    sessionDuration.add(elapsed);

    const ok = check(res, {
      'session created': (r) => r.status === 201 || r.status === 200,
    });
    errorRate.add(!ok);

    if (ok) {
      sessionCreated.add(1);
      const sessionId = res.json('id');

      sleep(randomIntBetween(1, 3));

      if (sessionId) {
        group('Client → Read Session', () => {
          const readRes = http.get(`${BASE_URL}/sessions/${sessionId}`, {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'client_read_session' },
          });
          check(readRes, { 'session readable': (r) => r.status === 200 || r.status === 401 });
        });

        sleep(randomIntBetween(2, 5));

        group('Client → Rate Session', () => {
          const ratingRes = http.post(`${BASE_URL}/sessions/${sessionId}/rating`,
            JSON.stringify({
              score: randomIntBetween(1, 5),
              comentario: 'Prueba de carga - comentario automatizado',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              tags: { name: 'client_rate' },
            },
          );
          check(ratingRes, { 'rating submitted': (r) => r.status < 500 });
        });
      }
    }
  });

  sleep(randomIntBetween(1, 4));
}

// ── Scenario 2: Public reads (no auth) ─────────────────────────────────
export function publicReadFlow() {
  const headers = { 'Content-Type': 'application/json' };

  group('Public → Health', () => {
    const res = http.get(`${BASE_URL}/health`, { headers, tags: { name: 'public_health' } });
    check(res, { 'health ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 2));

  group('Public → FAQ', () => {
    const res = http.get(`${BASE_URL}/faq`, { headers, tags: { name: 'public_faq' } });
    check(res, { 'faq ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 2));

  group('Public → FAQ Categorias', () => {
    const res = http.get(`${BASE_URL}/faq/categorias`, { headers, tags: { name: 'public_faq_cat' } });
    check(res, { 'faq categorias ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 2));

  group('Public → Horario', () => {
    const res = http.get(`${BASE_URL}/configuracion/horario-hoy`, { headers, tags: { name: 'public_horario' } });
    check(res, { 'horario ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 2));

  group('Public → Widget Config', () => {
    const res = http.get(`${BASE_URL}/widget-config`, { headers, tags: { name: 'public_widget' } });
    check(res, { 'widget ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 2));

  group('Public → Colegios', () => {
    const res = http.get(`${BASE_URL}/sessions/colegios/list`, { headers, tags: { name: 'public_colegios' } });
    check(res, { 'colegios ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));
}

// ── Scenario 3: Advisor flow ───────────────────────────────────────────
export function advisorFlow(data) {
  const token = data.advisorToken || advisorToken;
  if (!token) {
    errorRate.add(true);
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  group('Advisor → Login', () => {
    const res = http.post(`${BASE_URL}/auth/login`,
      JSON.stringify({ email: 'asesor@innovacloud.com', password: 'Asesor@123456' }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'advisor_login' } },
    );
    check(res, { 'advisor login ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → List Sessions', () => {
    const res = http.get(`${BASE_URL}/sessions`, { headers: authHeaders, tags: { name: 'advisor_sessions' } });
    check(res, { 'sessions list ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → Waiting Sessions', () => {
    const res = http.get(`${BASE_URL}/sessions/waiting`, { headers: authHeaders, tags: { name: 'advisor_waiting' } });
    check(res, { 'waiting ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → Advisors List', () => {
    const res = http.get(`${BASE_URL}/sessions/advisors`, { headers: authHeaders, tags: { name: 'advisor_list' } });
    check(res, { 'advisors list ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → Metrics', () => {
    const res = http.get(`${BASE_URL}/sessions/metrics`, { headers: authHeaders, tags: { name: 'advisor_metrics' } });
    check(res, { 'metrics ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → Config', () => {
    const res = http.get(`${BASE_URL}/configuracion`, { headers: authHeaders, tags: { name: 'advisor_config' } });
    check(res, { 'config ok': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → Tickets', () => {
    const res = http.get(`${BASE_URL}/tickets?page=1&limit=20`, { headers: authHeaders, tags: { name: 'advisor_tickets' } });
    check(res, { 'tickets ok': (r) => r.status < 500 });
  });

  sleep(randomIntBetween(0.5, 1));

  group('Advisor → All Sessions (paginated)', () => {
    const res = http.get(`${BASE_URL}/sessions/admin/all/paginated?page=1&limit=50`, {
      headers: authHeaders,
      tags: { name: 'advisor_all_sessions' },
    });
    check(res, { 'admin sessions ok': (r) => r.status < 500 });
  });

  sleep(randomIntBetween(2, 5));
}

// ── Scenario 4: AI Chat ────────────────────────────────────────────────
export function aiChatFlow() {
  const headers = { 'Content-Type': 'application/json' };

  group('AI → Chat', () => {
    const payload = {
      message: randomItem(AI_MESSAGES),
      sessionId: `loadtest-${randomIntBetween(1, 99999)}`,
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/ai/chat`, JSON.stringify(payload), {
      headers,
      tags: { name: 'ai_chat' },
      timeout: '30s',
    });
    const elapsed = Date.now() - start;
    aiChatDuration.add(elapsed);

    check(res, { 'ai chat ok': (r) => r.status === 200 || r.status === 201 });
    if (res.status >= 500) errorRate.add(true);
  });

  sleep(randomIntBetween(2, 6));
}

// ── Scenario 5: WebSocket (Socket.IO) ──────────────────────────────────
export function websocketFlow(data) {
  const token = data.adminToken || adminToken;
  if (!token) {
    errorRate.add(true);
    return;
  }

  const wsUrl = BASE_URL.replace('http', 'ws');

  group('WebSocket → Connect & Chat', () => {
    const url = `${wsUrl}/socket.io/?EIO=4&transport=websocket&token=${token}`;
    const res = ws.connect(url, {}, (socket) => {
      socket.on('open', () => {
        wsConnected.add(1);
        socket.send('40');
      });

      socket.on('message', (msg) => {
        const data = msg.toString();

        if (data.startsWith('0')) {
          socket.send('40');
        }

        if (data === '40' || data.startsWith('40{\"')) {
          const sessionId = `ws-loadtest-${randomIntBetween(1, 99999)}`;

          sleep(1);

          socket.send(JSON.stringify({
            type: '42',
            event: 'join_session',
            data: { sessionId },
          }));

          sleep(2);

          for (let i = 0; i < 3; i++) {
            socket.send(JSON.stringify({
              type: '42',
              event: 'send_message',
              data: {
                sessionId,
                content: `Mensaje de prueba WebSocket #${i + 1}`,
                sender: 'loadtest-user',
              },
            }));
            wsMessages.add(1);
            sleep(randomIntBetween(1, 3));
          }

          socket.send(JSON.stringify({
            type: '42',
            event: 'client_close_session',
            data: { sessionId },
          }));
        }
      });

      socket.on('error', (e) => {
        errorRate.add(true);
      });

      socket.close();
    });

    check(res, { 'ws connected': (r) => r && r.status === 101 });
  });

  sleep(randomIntBetween(3, 8));
}

// ── Teardown ───────────────────────────────────────────────────────────
export function teardown() {
  http.get(`${BASE_URL}/health`);
}
