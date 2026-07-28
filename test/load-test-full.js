#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PRUEBA DE CARGA COMPLETA — Socket.IO + REST + WhatsApp Namespace
// ═══════════════════════════════════════════════════════════════════════════
// Ejecutar:  node test/load-test-full.js
// Requiere:  test/test-tokens.json generado por seed-test-advisors.js
//            Backend corriendo (docker compose up -d)
// ═══════════════════════════════════════════════════════════════════════════

import { io } from 'socket.io-client';
import axios from 'axios';
import fs from 'fs';

// ── Configuración ───────────────────────────────────────────────────────────
const BASE_URL  = process.env.BASE_URL  || 'http://localhost:3001';
const WS_URL    = process.env.WS_URL    || BASE_URL;
const SCENARIO  = process.env.SCENARIO  || 'all';   // all | api | advisors | clients | fullflow | stress | whatsapp | disconnect
const RESULTS_DIR = new URL('./results/', import.meta.url);

// ── Métricas globales ───────────────────────────────────────────────────────
const metrics = {
  api: {
    totalRequests: 0,
    errors: 0,
    latencies: [],
    byEndpoint: {},
  },
  ws: {
    totalConnections: 0,
    disconnections: 0,
    connectErrors: 0,
    messageLatencies: [],
    assignLatencies: [],
    messagesSent: 0,
    messagesReceived: 0,
  },
  whatsapp: {
    totalConnections: 0,
    disconnections: 0,
    connectErrors: 0,
  },
  sessions: {
    created: 0,
    closed: 0,
    active: 0,
  },
  memory: [],
  errors: [],
  startTime: Date.now(),
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(tag, msg) {
  const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
  const mem = process.memoryUsage();
  const mb = (mem.heapUsed / 1024 / 1024).toFixed(1);
  console.log(`  [${elapsed}s] [${mb}MB] [${tag}] ${msg}`);
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Cargar tokens ───────────────────────────────────────────────────────────
function loadTokens() {
  const tokensFile = new URL('./test-tokens.json', import.meta.url);
  if (!fs.existsSync(tokensFile)) {
    console.error('  ✗ No existe test/test-tokens.json. Ejecuta primero: node test/seed-test-advisors.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO A: API REST bajo carga
// ════════════════════════════════════════════════════════════════════════════
async function scenarioAPI() {
  log('API', '═══ Escenario A: API REST bajo carga ═══');
  const CONCURRENCY = 10;
  const DURATION_MS = 60_000;

  let running = true;
  setTimeout(() => { running = false; }, DURATION_MS);

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (running) {
        const start = Date.now();
        try {
          const endpoint = rand([
            { method: 'get',  url: '/health' },
            { method: 'get',  url: '/health' },
            { method: 'get',  url: '/health' },
            { method: 'post', url: '/sessions', data: {
              clientName: `Carga_${i}_${Date.now() % 10000}`,
              identificacion: String(10000000 + i + Math.floor(Math.random() * 1000)),
              apellido: `Test_${i}`,
              rol: rand(['Estudiante', 'Docente', 'Padre de familia']),
              colegio: rand(['Colegio San Jose', 'Colegio La Salle', 'Colegio Santa Maria']),
              tipoSolicitud: 'Prueba de carga REST',
            }},
          ]);

          let res;
          if (endpoint.method === 'get') {
            res = await axios.get(`${BASE_URL}${endpoint.url}`, { timeout: 10000, validateStatus: () => true });
          } else {
            res = await axios.post(`${BASE_URL}${endpoint.url}`, endpoint.data, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000,
              validateStatus: () => true,
            });
          }

          const latency = Date.now() - start;
          metrics.api.totalRequests++;
          metrics.api.latencies.push(latency);

          const key = `${endpoint.method.toUpperCase()} ${endpoint.url}`;
          if (!metrics.api.byEndpoint[key]) metrics.api.byEndpoint[key] = { count: 0, errors: 0, latencies: [] };
          metrics.api.byEndpoint[key].count++;
          metrics.api.byEndpoint[key].latencies.push(latency);

          if (res.status >= 400) {
            metrics.api.errors++;
            metrics.api.byEndpoint[key].errors++;
          }

          if (res.status === 201) metrics.sessions.created++;
          if (res.status === 200 && endpoint.url === '/health' && Math.random() < 0.01) {
            log('API', `Health OK (${latency}ms)`);
          }
        } catch (err) {
          metrics.api.errors++;
          metrics.errors.push({ time: Date.now(), scenario: 'api', error: err.message });
        }

        // Pausa para respetar throttler global de 60 req/min
        await wait(200 + Math.random() * 800);
      }
    })());
  }

  await Promise.all(workers);
  log('API', `Completado: ${metrics.api.totalRequests} req, ${metrics.api.errors} errores, p95=${percentile(metrics.api.latencies, 95)}ms`);
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO B: 8 Asesores conectados vía WebSocket
// ════════════════════════════════════════════════════════════════════════════
async function scenarioAdvisors(tokenData) {
  log('ADV', '═══ Escenario B: 8 Asesores WebSocket ═══');
  const advisorSockets = [];

  for (let i = 0; i < 8; i++) {
    const token = tokenData.advisors[i]?.token;
    if (!token) {
      log('ADV', `No hay token para asesor ${i + 1}, saltando`);
      continue;
    }

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    socket.on('connect', () => {
      metrics.ws.totalConnections++;
      log('ADV', `Asesor ${i + 1} conectado (socket ${socket.id})`);
      socket.emit('advisor_ready');
      socket.emit('set_advisor_status', 'online');
    });

    socket.on('disconnect', (reason) => {
      metrics.ws.disconnections++;
      log('ADV', `Asesor ${i + 1} desconectado: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      metrics.ws.connectErrors++;
      metrics.errors.push({ time: Date.now(), scenario: 'advisor', error: err.message });
    });

    // Escuchar eventos de asignación
    socket.on('session_assigned', (data) => {
      log('ADV', `Asesor ${i + 1} asignado a sesión ${data.sessionId}`);
      metrics.ws.assignLatencies.push(Date.now() - metrics.startTime);
    });

    socket.on('new_message', () => {
      metrics.ws.messagesReceived++;
    });

    socket.on('advisor_status_changed', () => {});
    socket.on('session_updated', () => {});
    socket.on('metrics_updated', () => {});

    advisorSockets.push(socket);
    await wait(300); // escalonar conexiones
  }

  log('ADV', `${advisorSockets.length} asesores conectados`);
  return advisorSockets;
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO C: Clientes concurrentes
// ════════════════════════════════════════════════════════════════════════════
async function scenarioClients(totalClients, durationMs) {
  log('CLI', `═══ Escenario C: ${totalClients} clientes concurrentes (${durationMs / 1000}s) ═══`);

  const clientSockets = [];
  let running = true;
  setTimeout(() => { running = false; }, durationMs);

  // Crear clientes secuencialmente para evitar throttler
  const SESSION_THROTTLE_MS = 1200;

  for (let idx = 0; idx < totalClients && running; idx++) {
    try {
      // 1. Crear sesión vía REST
      const sessRes = await axios.post(`${BASE_URL}/sessions`, {
        clientName: `Cliente_${idx}_${Date.now() % 10000}`,
        identificacion: String(20000000 + idx),
        apellido: `TestC_${idx}`,
        rol: rand(['Estudiante', 'Docente', 'Padre de familia']),
        colegio: rand(['Colegio San Jose', 'Colegio La Salle', 'Colegio Santa Maria']),
        tipoSolicitud: 'Prueba de carga',
      }, { timeout: 10000, validateStatus: () => true });

      if (sessRes.status !== 201) {
        metrics.api.errors++;
        await wait(SESSION_THROTTLE_MS);
        continue;
      }

      const sessionId = sessRes.data.id;
      metrics.sessions.created++;

      // 2. Conectar WebSocket
      const socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000,
      });

      socket.on('connect', () => {
        metrics.ws.totalConnections++;

        // Join session
        socket.emit('join_session', {
          sessionId,
          clientName: `Cliente_${idx}`,
        });

        // Solicitar asesor
        setTimeout(() => {
          socket.emit('request_advisor', sessionId);
        }, 500 + Math.random() * 2000);

        // Enviar mensajes periódicamente
        const msgInterval = setInterval(() => {
          if (!running || socket.disconnected) {
            clearInterval(msgInterval);
            return;
          }
          const start = Date.now();
          socket.emit('send_message', {
            sessionId,
            content: `Mensaje de prueba ${idx} - ${Date.now()}`,
            senderName: `Cliente_${idx}`,
          });
          metrics.ws.messagesSent++;
          metrics.ws.messageLatencies.push(Date.now() - start);
        }, 2000 + Math.random() * 5000);

        // Marcar como activo
        socket.emit('set_active', { sessionId, active: true });
      });

      socket.on('new_message', () => {
        metrics.ws.messagesReceived++;
      });

      socket.on('disconnect', () => {
        metrics.ws.disconnections++;
      });

      socket.on('connect_error', (err) => {
        metrics.ws.connectErrors++;
        metrics.errors.push({ time: Date.now(), scenario: 'client', error: err.message });
      });

      socket.on('session_closed', () => {
        metrics.sessions.closed++;
      });

      socket.on('timer_update', () => {});
      socket.on('typing_start', () => {});
      socket.on('typing_stop', () => {});
      socket.on('user_joined', () => {});
      socket.on('advisor_joined', () => {});
      socket.on('client_presence', () => {});
      socket.on('ai_mode_changed', () => {});
      socket.on('messages_read', () => {});

      clientSockets.push(socket);
    } catch (err) {
      metrics.errors.push({ time: Date.now(), scenario: 'client-create', error: err.message });
    }

    if (idx % 10 === 9) {
      log('CLI', `Lote ${Math.floor(idx / 10) + 1}: ${clientSockets.length} clientes conectados`);
    }
    await wait(SESSION_THROTTLE_MS);
  }

  // Mantener vivos hasta que termine
  while (running) await wait(1000);

  // Cerrar todos los sockets
  for (const s of clientSockets) {
    try { s.disconnect(); } catch {}
  }

  log('CLI', `Completado: ${clientSockets.length} clientes, ${metrics.ws.messagesSent} msgs enviados`);
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO D: Flujo completo con asignación
// ════════════════════════════════════════════════════════════════════════════
async function scenarioFullFlow(tokenData) {
  log('FLOW', '═══ Escenario D: Flujo completo con asignación ═══');

  // 1. Conectar 8 asesores
  const advisors = [];
  for (let i = 0; i < 8; i++) {
    const token = tokenData.advisors[i]?.token;
    if (!token) continue;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    await new Promise((resolve) => {
      socket.on('connect', () => {
        socket.emit('advisor_ready');
        socket.emit('set_advisor_status', 'online');
        advisors.push(socket);
        resolve();
      });
      socket.on('connect_error', () => {
        metrics.ws.connectErrors++;
        resolve();
      });
      setTimeout(resolve, 5000);
    });

    await wait(200);
  }

  log('FLOW', `${advisors.length} asesores conectados`);

  // 2. Crear clientes en oleadas y verificar asignación
  const TOTAL_CLIENTS = 40;
  const assignedSessions = [];
  const unassignedSessions = [];

  for (let i = 0; i < TOTAL_CLIENTS; i++) {
    try {
      // Crear sesión
      const sessRes = await axios.post(`${BASE_URL}/sessions`, {
        clientName: `Flow_${i}`,
        identificacion: String(30000000 + i),
        apellido: `FlowTest_${i}`,
        rol: rand(['Estudiante', 'Docente', 'Padre de familia']),
        colegio: 'Colegio San Jose',
        tipoSolicitud: 'Prueba flujo completo',
      }, { timeout: 10000, validateStatus: () => true });

      if (sessRes.status !== 201) continue;
      const sessionId = sessRes.data.id;
      metrics.sessions.created++;

      // Conectar WebSocket
      const socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000,
      });

      const sessionInfo = { sessionId, socket, idx: i, assigned: false, startTime: Date.now() };

      socket.on('connect', () => {
        socket.emit('join_session', { sessionId, clientName: `Flow_${i}` });
        setTimeout(() => socket.emit('request_advisor', sessionId), 300);
      });

      socket.on('advisor_joined', () => {
        sessionInfo.assigned = true;
        const latency = Date.now() - sessionInfo.startTime;
        metrics.ws.assignLatencies.push(latency);
        log('FLOW', `Cliente ${i} asignado en ${latency}ms`);

        // Enviar mensajes
        let msgCount = 0;
        const msgInterval = setInterval(() => {
          msgCount++;
          if (msgCount > 5 || socket.disconnected) {
            clearInterval(msgInterval);
            return;
          }
          socket.emit('send_message', {
            sessionId,
            content: `Mensaje flow ${i} #${msgCount}`,
            senderName: `Flow_${i}`,
          });
          metrics.ws.messagesSent++;
        }, 1500);
      });

      socket.on('new_message', () => { metrics.ws.messagesReceived++; });
      socket.on('disconnect', () => { metrics.ws.disconnections++; });
      socket.on('connect_error', () => { metrics.ws.connectErrors++; });
      socket.on('timer_update', () => {});
      socket.on('session_assigned', () => {});
      socket.on('typing_start', () => {});
      socket.on('user_joined', () => {});
      socket.on('client_presence', () => {});
      socket.on('ai_mode_changed', () => {});

      if (sessionInfo.assigned) assignedSessions.push(sessionInfo);
      else unassignedSessions.push(sessionInfo);

      await wait(1200 + Math.random() * 400);
    } catch (err) {
      metrics.errors.push({ time: Date.now(), scenario: 'fullflow', error: err.message });
    }
  }

  // Esperar a que se resuelvan asignaciones
  await wait(10000);

  // Contar asignados vs no
  const totalAssigned = unassignedSessions.filter(s => s.assigned).length + assignedSessions.length;
  log('FLOW', `Resultado: ${totalAssigned}/${TOTAL_CLIENTS} sesiones asignadas`);

  // Cerrar todo
  for (const s of [...advisors, ...unassignedSessions.map(s => s.socket), ...assignedSessions.map(s => s.socket)]) {
    try { s.disconnect(); } catch {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO E: Stress test — ramp hasta rupture
// ════════════════════════════════════════════════════════════════════════════
async function scenarioStress(tokenData) {
  log('STRESS', '═══ Escenario E: Stress test progresivo ═══');

  const STEPS = [
    { clients: 20,  duration: 30_000, label: '20 clientes' },
    { clients: 50,  duration: 30_000, label: '50 clientes' },
    { clients: 100, duration: 30_000, label: '100 clientes' },
    { clients: 150, duration: 30_000, label: '150 clientes' },
    { clients: 200, duration: 30_000, label: '200 clientes' },
  ];

  // Conectar 8 asesores primero
  const advisors = [];
  for (let i = 0; i < 8; i++) {
    const token = tokenData.advisors[i]?.token;
    if (!token) continue;
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });
    await new Promise((resolve) => {
      socket.on('connect', () => { socket.emit('advisor_ready'); socket.emit('set_advisor_status', 'online'); advisors.push(socket); resolve(); });
      socket.on('connect_error', () => resolve());
      setTimeout(resolve, 5000);
    });
    await wait(150);
  }

  log('STRESS', `${advisors.length} asesores listos`);

  for (const step of STEPS) {
    log('STRESS', `─── Subiendo a ${step.label} (${step.duration / 1000}s) ───`);

    const preErrors = metrics.ws.connectErrors + metrics.api.errors;
    const preConnections = metrics.ws.totalConnections;

    const sockets = [];
    const SESSION_THROTTLE_MS = 1200;

    for (let idx = 0; idx < step.clients; idx++) {
      try {
        const sessRes = await axios.post(`${BASE_URL}/sessions`, {
          clientName: `Stress_${idx}`,
          identificacion: String(40000000 + idx),
          apellido: `Stress_${idx}`,
          rol: 'Estudiante',
          colegio: 'Colegio San Jose',
          tipoSolicitud: 'Stress test',
        }, { timeout: 8000, validateStatus: () => true });

        if (sessRes.status !== 201) {
          log('STRESS', `Sesión ${idx} falló (${sessRes.status}), esperando...`);
          await wait(SESSION_THROTTLE_MS);
          continue;
        }

        const socket = io(WS_URL, {
          transports: ['websocket'],
          reconnection: false,
          timeout: 8000,
        });

        socket.on('connect', () => {
          metrics.ws.totalConnections++;
          socket.emit('join_session', { sessionId: sessRes.data.id, clientName: `Stress_${idx}` });
          socket.emit('request_advisor', sessRes.data.id);
        });
        socket.on('new_message', () => { metrics.ws.messagesReceived++; });
        socket.on('disconnect', () => { metrics.ws.disconnections++; });
        socket.on('connect_error', () => { metrics.ws.connectErrors++; });
        socket.on('timer_update', () => {});
        socket.on('session_assigned', () => {});
        socket.on('advisor_joined', () => {});
        socket.on('typing_start', () => {});
        socket.on('user_joined', () => {});
        socket.on('session_closed', () => {});
        socket.on('client_presence', () => {});
        socket.on('ai_mode_changed', () => {});

        sockets.push(socket);

        if (idx % 10 === 9) {
          log('STRESS', `  ${idx + 1}/${step.clients} sesiones creadas, ${sockets.length} sockets abiertos`);
        }
      } catch {}

      await wait(SESSION_THROTTLE_MS);
    }

    await wait(step.duration / 1000);

    const postErrors = metrics.ws.connectErrors + metrics.api.errors;
    const newErrors = postErrors - preErrors;
    const totalConns = metrics.ws.totalConnections - preConnections;

    log('STRESS', `${step.label}: ${totalConns} conexiones nuevas, ${newErrors} errores nuevos`);

    // Cerrar clientes de este paso
    for (const s of sockets) { try { s.disconnect(); } catch {} }
    await wait(3000);

    // Si >30% de error rate, parar
    if (totalConns > 0 && newErrors / totalConns > 0.3) {
      log('STRESS', `⚠ 30%+ error rate — punto de ruptura alcanzado en ${step.label}`);
      break;
    }
  }

  for (const s of advisors) { try { s.disconnect(); } catch {} }
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO F+G: WhatsApp Namespace
// ════════════════════════════════════════════════════════════════════════════
async function scenarioWhatsApp(tokenData) {
  log('WA', '═══ Escenarios F+G: WhatsApp Namespace ═══');

  const sockets = [];

  // Conectar 8 asesores al namespace /advisors-whatsapp
  for (let i = 0; i < 8; i++) {
    const token = tokenData.advisors[i]?.token;
    if (!token) continue;

    const socket = io(`${WS_URL}/advisors-whatsapp`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    socket.on('connect', () => {
      metrics.whatsapp.totalConnections++;
      log('WA', `Asesor ${i + 1} conectado a WhatsApp namespace`);
      socket.emit('aw_join', tokenData.advisors[i]?.name || `asesor-${i}`);
    });

    socket.on('disconnect', (reason) => {
      metrics.whatsapp.disconnections++;
      log('WA', `Asesor ${i + 1} desconectado: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      metrics.whatsapp.connectErrors++;
      metrics.errors.push({ time: Date.now(), scenario: 'whatsapp', error: err.message });
    });

    socket.on('aw_connected', () => {});
    socket.on('aw_connection_update', () => {});
    socket.on('aw_advisors_online', () => {});
    socket.on('aw_chat_assigned', (data) => {
      log('WA', `Chat asignado a asesor ${i + 1}: ${data.chat?.id || 'unknown'}`);
    });
    socket.on('aw_chat_updated', () => {});
    socket.on('aw_new_message', () => {});
    socket.on('aw_message_status', () => {});
    socket.on('aw_queue_updated', () => {});
    socket.on('aw_chat_assigned', () => {});

    sockets.push(socket);
    await wait(400);
  }

  log('WA', `${sockets.length} asesores conectados al namespace WhatsApp`);

  // Mantener vivos 30s
  await wait(30000);

  log('WA', `Desconectando ${sockets.length} sockets WhatsApp...`);
  for (const s of sockets) { try { s.disconnect(); } catch {} }

  log('WA', `Resultado: ${metrics.whatsapp.totalConnections} conn, ${metrics.whatsapp.disconnections} disc, ${metrics.whatsapp.connectErrors} err`);
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIO H: Desconexión masiva
// ════════════════════════════════════════════════════════════════════════════
async function scenarioDisconnect(tokenData) {
  log('DISC', '═══ Escenario H: Desconexión masiva ═══');

  // Conectar 8 asesores
  const advisors = [];
  for (let i = 0; i < 8; i++) {
    const token = tokenData.advisors[i]?.token;
    if (!token) continue;
    const socket = io(WS_URL, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
    await new Promise((resolve) => {
      socket.on('connect', () => { socket.emit('advisor_ready'); socket.emit('set_advisor_status', 'online'); advisors.push(socket); resolve(); });
      socket.on('connect_error', () => resolve());
      setTimeout(resolve, 5000);
    });
    await wait(150);
  }

  // Conectar 50 clientes secuencialmente para evitar throttler
  const clients = [];
  for (let i = 0; i < 50; i++) {
    try {
      const sessRes = await axios.post(`${BASE_URL}/sessions`, {
        clientName: `Disc_${i}`, identificacion: String(50000000 + i),
        apellido: `Disc_${i}`, rol: 'Estudiante', colegio: 'Colegio San Jose', tipoSolicitud: 'Disconnect test',
      }, { timeout: 8000, validateStatus: () => true });
      if (sessRes.status !== 201) {
        await wait(1200);
        continue;
      }

      const socket = io(WS_URL, { transports: ['websocket'], reconnection: false, timeout: 8000 });
      socket.on('connect', () => { socket.emit('join_session', { sessionId: sessRes.data.id, clientName: `Disc_${i}` }); });
      socket.on('timer_update', () => {});
      socket.on('new_message', () => {});
      socket.on('user_joined', () => {});
      socket.on('client_presence', () => {});
      socket.on('session_assigned', () => {});
      socket.on('advisor_joined', () => {});
      socket.on('session_closed', () => {});
      socket.on('ai_mode_changed', () => {});

      clients.push(socket);
      await wait(1200);
    } catch {
      await wait(1200);
    }
  }

  log('DISC', `${advisors.length} asesores + ${clients.length} clientes conectados`);
  await wait(3000);

  // Desconexión masiva simultánea
  log('DISC', '⚡ Desconexión masiva...');
  const discStart = Date.now();

  for (const s of [...clients, ...advisors]) {
    try { s.disconnect(); } catch {}
  }

  const discTime = Date.now() - discStart;
  log('DISC', `Desconexión completada en ${discTime}ms`);

  // Verificar que el backend sigue vivo
  await wait(2000);
  try {
    const healthRes = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    log('DISC', `Backend vivo después de desconexión masiva: ${JSON.stringify(healthRes.data)}`);
  } catch (err) {
    log('DISC', `⚠ Backend NO responde después de desconexión: ${err.message}`);
    metrics.errors.push({ time: Date.now(), scenario: 'disconnect', error: 'backend_unreachable_after_mass_disconnect' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// REPORTE FINAL
// ════════════════════════════════════════════════════════════════════════════
function generateReport() {
  const totalSeconds = ((Date.now() - metrics.startTime) / 1000).toFixed(1);

  const report = `
═══════════════════════════════════════════════════════════════════
  REPORTE DE PRUEBA DE CARGA
  Fecha: ${new Date().toISOString()}
  Duración: ${totalSeconds}s
  Backend: ${BASE_URL}
═══════════════════════════════════════════════════════════════════

── API REST ──────────────────────────────────────────────────────
  Total requests:     ${metrics.api.totalRequests}
  Errores:            ${metrics.api.errors} (${metrics.api.totalRequests ? ((metrics.api.errors / metrics.api.totalRequests) * 100).toFixed(1) : 0}%)
  Latencia avg:       ${avg(metrics.api.latencies).toFixed(0)}ms
  Latencia p50:       ${percentile(metrics.api.latencies, 50)}ms
  Latencia p95:       ${percentile(metrics.api.latencies, 95)}ms
  Latencia p99:       ${percentile(metrics.api.latencies, 99)}ms
  Latencia max:       ${Math.max(0, ...metrics.api.latencies)}ms

  Por endpoint:
${Object.entries(metrics.api.byEndpoint).map(([k, v]) =>
  `    ${k.padEnd(30)} ${String(v.count).padStart(6)} req  ${String(v.errors).padStart(4)} err  p95=${percentile(v.latencies, 95)}ms`
).join('\n')}

── WebSocket Chat ────────────────────────────────────────────────
  Conexiones totales:  ${metrics.ws.totalConnections}
  Desconexiones:       ${metrics.ws.disconnections}
  Conexiones con error:${metrics.ws.connectErrors}
  Mensajes enviados:   ${metrics.ws.messagesSent}
  Mensajes recibidos:  ${metrics.ws.messagesReceived}
  Latencia msg avg:    ${avg(metrics.ws.messageLatencies).toFixed(1)}ms
  Latencia msg p95:    ${percentile(metrics.ws.messageLatencies, 95)}ms
  Latencia asignación avg: ${avg(metrics.ws.assignLatencies).toFixed(0)}ms
  Latencia asignación p95: ${percentile(metrics.ws.assignLatencies, 95)}ms

── WhatsApp Namespace ────────────────────────────────────────────
  Conexiones totales:  ${metrics.whatsapp.totalConnections}
  Desconexiones:       ${metrics.whatsapp.disconnections}
  Conexiones con error:${metrics.whatsapp.connectErrors}

── Sesiones ──────────────────────────────────────────────────────
  Creadas:             ${metrics.sessions.created}
  Cerradas:            ${metrics.sessions.closed}

── Errores ───────────────────────────────────────────────────────
  Total errores:       ${metrics.errors.length}
${metrics.errors.slice(0, 10).map(e => `  [${e.scenario}] ${e.error}`).join('\n')}

── Evaluación ────────────────────────────────────────────────────
  ${metrics.api.errors / Math.max(1, metrics.api.totalRequests) < 0.05 ? '✅' : '⚠'} Error rate API: ${((metrics.api.errors / Math.max(1, metrics.api.totalRequests)) * 100).toFixed(1)}% (objetivo <5%)
  ${percentile(metrics.api.latencies, 95) < 2000 ? '✅' : '⚠'} Latencia API p95: ${percentile(metrics.api.latencies, 95)}ms (objetivo <2000ms)
  ${metrics.ws.connectErrors < metrics.ws.totalConnections * 0.1 ? '✅' : '⚠'} WS connect errors: ${metrics.ws.connectErrors} (objetivo <10%)
  ${metrics.errors.filter(e => e.error === 'backend_unreachable_after_mass_disconnect').length === 0 ? '✅' : '❌'} Backend sobrevive desconexión masiva
═══════════════════════════════════════════════════════════════════
`;

  console.log(report);

  // Guardar reporte
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const filename = `report-${Date.now()}.txt`;
  fs.writeFileSync(new URL(`./results/${filename}`, import.meta.url), report);
  fs.writeFileSync(new URL('./results/latest.json', import.meta.url), JSON.stringify(metrics, null, 2));
  log('REPORT', `Guardado en test/results/${filename}`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PRUEBA DE CARGA — ReportaCasos / appchat');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Backend: ${BASE_URL}`);
  console.log(`  Escenario: ${SCENARIO}`);
  console.log('');

  // Verificar backend
  try {
    await axios.get(`${BASE_URL}/health`);
    log('INIT', 'Backend detectado ✓');
  } catch {
    console.error('  ✗ Backend no disponible en ' + BASE_URL);
    console.error('    Ejecuta: docker compose up -d');
    process.exit(1);
  }

  const tokenData = loadTokens();
  log('INIT', `Tokens cargados: ${tokenData.advisors.length} asesores`);

  // Ejecutar escenarios
  if (SCENARIO === 'all' || SCENARIO === 'api') {
    await scenarioAPI();
    await wait(2000);
  }

  if (SCENARIO === 'all' || SCENARIO === 'clients' || SCENARIO === 'fullflow') {
    const advisors = await scenarioAdvisors(tokenData);
    await wait(2000);

    if (SCENARIO === 'all' || SCENARIO === 'clients') {
      await scenarioClients(50, 60_000);
      await wait(2000);
    }

    if (SCENARIO === 'all' || SCENARIO === 'fullflow') {
      await scenarioFullFlow(tokenData);
      await wait(2000);
    }

    for (const s of advisors) { try { s.disconnect(); } catch {} }
  }

  if (SCENARIO === 'all' || SCENARIO === 'stress') {
    await scenarioStress(tokenData);
    await wait(2000);
  }

  if (SCENARIO === 'all' || SCENARIO === 'whatsapp') {
    await scenarioWhatsApp(tokenData);
    await wait(2000);
  }

  if (SCENARIO === 'all' || SCENARIO === 'disconnect') {
    await scenarioDisconnect(tokenData);
    await wait(2000);
  }

  generateReport();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
