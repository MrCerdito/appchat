import http from 'k6/http';
import { check, sleep } from 'k6';
import { WebSocket } from 'k6/ws';
import { Counter, Trend, Rate } from 'k6/metrics';

// ── Métricas ───────────────────────────────────────────────────────────────
const sessionCreated = new Counter('sessions_created');
const wsConnected    = new Counter('ws_connected');
const messagesSent   = new Counter('messages_sent');
const httpErrors     = new Counter('http_errors');
const errorRate      = new Rate('error_rate');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const ROLES    = ['Estudiante', 'Docente', 'Padre de familia'];
const COLEGIOS = ['Colegio San Jose', 'Colegio La Salle', 'Colegio Santa Maria'];

export const options = {
  scenarios: {
    rest_api: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 5  },
        { duration: '15s', target: 10 },
        { duration: '15s', target: 20 },
        { duration: '1m',  target: 20 },
        { duration: '15s', target: 0  },
      ],
      exec: 'restTest',
    },
  },
  thresholds: {
    error_rate: ['rate<0.10'],
    http_req_duration: ['p(95)<2000'],
  },
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Prueba REST: Sesiones + Socket.IO WebSocket ────────────────────────────

export function restTest() {
  // 1. Crear sesión
  const body = JSON.stringify({
    clientName: `Carga_${__VU}_${Date.now() % 10000}`,
    identificacion: String(10000000 + __VU),
    apellido: `Test_${__VU}`,
    rol: rand(ROLES),
    colegio: rand(COLEGIOS),
    tipoSolicitud: 'Prueba de carga',
  });

  const r1 = http.post(`${BASE_URL}/sessions`, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'create_session' },
  });

  if (r1.status !== 201) {
    httpErrors.add(1); errorRate.add(true);
    sleep(3); return;
  }
  sessionCreated.add(1);
  const session = JSON.parse(r1.body);
  const sessionId = session.id;

  // 2. Verificar sesión creada
  const r2 = http.get(`${BASE_URL}/sessions/${sessionId}`, {
    tags: { name: 'get_session' },
  });
  if (r2.status !== 200) {
    httpErrors.add(1); errorRate.add(true);
  }

  // 3. Simular actividad: verificar la sesión varias veces
  for (let i = 0; i < 3; i++) {
    http.get(`${BASE_URL}/sessions/${sessionId}`, {
      tags: { name: 'poll_session' },
    });
    sleep(1);
  }

  // 4. Cerrar sesión
  const r3 = http.post(`${BASE_URL}/sessions/${sessionId}/close`, null, {
    tags: { name: 'close_session' },
  });
  if (r3.status !== 200 && r3.status !== 201) {
    httpErrors.add(1); errorRate.add(true);
  }
}
