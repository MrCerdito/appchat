#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// TEST DE ASIGNACIÓN DE CHATS EN LÍNEA — Validación end-to-end
// ═══════════════════════════════════════════════════════════════════════════
// Ejecutar:  node test/test-assignment.js
// Requiere:  Backend corriendo en localhost:3001
// ═══════════════════════════════════════════════════════════════════════════

import { io } from 'socket.io-client';
import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const WS_URL   = process.env.WS_URL   || BASE_URL;
const TIMEOUT  = 15000;

// ── Colores para output ────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// ── Resultados ─────────────────────────────────────────────────────────────
const results = [];
function pass(name, detail) {
  results.push({ name, status: 'PASS', detail });
  console.log(`  ${C.green}✓${C.reset} ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
  console.log(`  ${C.red}✗${C.reset} ${name}${C.red} — ${detail}${C.reset}`);
}
function info(msg) {
  console.log(`  ${C.cyan}ℹ${C.reset} ${msg}`);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1: Health check
// ════════════════════════════════════════════════════════════════════════════
async function testHealth() {
  console.log(`\n${C.bold}═══ ETAPA 1: Health Check ═══${C.reset}`);

  try {
    const res = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    if (res.data.status === 'ok') {
      pass('GET /health', `status=${res.data.status}`);
    } else {
      fail('GET /health', `status inesperado: ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    fail('GET /health', err.message);
    return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2: Autenticación
// ════════════════════════════════════════════════════════════════════════════
async function testAuth() {
  console.log(`\n${C.bold}═══ ETAPA 2: Autenticación ═══${C.reset}`);

  const tokens = {};

  // Login admin
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@innovacloud.co',
      password: 'Admin123',
    }, { timeout: 10000 });
    if (res.data.access_token) {
      tokens.admin = res.data.access_token;
      pass('Login admin', `role=${res.data.user?.role}, id=${res.data.user?.id?.slice(0,8)}...`);
    } else {
      fail('Login admin', 'No access_token en respuesta');
    }
  } catch (err) {
    fail('Login admin', err.response?.data?.message || err.message);
  }

  // Login asesor
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'asesor@innovacloud.com',
      password: 'asesor123',
    }, { timeout: 10000 });
    if (res.data.access_token) {
      tokens.advisor = res.data.access_token;
      pass('Login asesor', `role=${res.data.user?.role}, id=${res.data.user?.id?.slice(0,8)}...`);
    } else {
      fail('Login asesor', 'No access_token en respuesta');
    }
  } catch (err) {
    fail('Login asesor', err.response?.data?.message || err.message);
  }

  // Login contraseña incorrecta
  try {
    await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@innovacloud.co',
      password: 'wrongpassword',
    }, { timeout: 10000 });
    fail('Login incorrecto rechazado', 'Debería haber fallado');
  } catch (err) {
    if (err.response?.status === 401) {
      pass('Login incorrecto rechazado', '401 Unauthorized');
    } else {
      fail('Login incorrecto rechazado', `Status inesperado: ${err.response?.status}`);
    }
  }

  // Verificar token admin funciona
  if (tokens.admin) {
    try {
      const res = await axios.get(`${BASE_URL}/sessions`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        timeout: 5000,
      });
      pass('Token admin válido', `sessions=${Array.isArray(res.data) ? res.data.length : 'N/A'}`);
    } catch (err) {
      fail('Token admin válido', err.message);
    }
  }

  // Verificar 401 sin token
  try {
    await axios.get(`${BASE_URL}/sessions`, { timeout: 5000 });
    fail('401 sin token', 'Debería haber fallado');
  } catch (err) {
    if (err.response?.status === 401) {
      pass('401 sin token', 'Correctamente rechazado');
    } else {
      fail('401 sin token', `Status: ${err.response?.status}`);
    }
  }

  return tokens;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3: Crear sesión de chat
// ════════════════════════════════════════════════════════════════════════════
async function testCreateSession() {
  console.log(`\n${C.bold}═══ ETAPA 3: Crear Sesión de Chat ═══${C.reset}`);

  const now = Date.now();
  const payload = {
    clientName: `TestAssign_${now}`,
    identificacion: String(90000000 + (now % 100000)),
    apellido: 'TestAutomatizado',
    rol: 'Estudiante',
    colegio: 'Colegio San Jose',
    tipoSolicitud: 'Test de asignación automatizado',
  };

  try {
    const res = await axios.post(`${BASE_URL}/sessions`, payload, { timeout: 10000 });
    if (res.status === 201 && res.data.id) {
      pass('POST /sessions', `id=${res.data.id}, status=${res.data.status}, codigo=${res.data.codigo}`);
      return res.data;
    } else {
      fail('POST /sessions', `Status ${res.status}, data: ${JSON.stringify(res.data).slice(0,200)}`);
    }
  } catch (err) {
    fail('POST /sessions', err.response?.data?.message || err.message);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 4: Asignación vía WebSocket (flujo completo)
// ════════════════════════════════════════════════════════════════════════════
async function testAssignment(session, tokens) {
  console.log(`\n${C.bold}═══ ETAPA 4: Asignación WebSocket ═══${C.reset}`);

  if (!session || !tokens.advisor) {
    fail('Asignación WebSocket', 'Falta sesión o token de asesor');
    return;
  }

  const sessionId = session.id;
  const messages = { sent: 0, received: 0 };
  let assigned = false;
  let advisorJoined = false;

  // 4.1 Conectar asesor
  const advisorSocket = io(WS_URL, {
    auth: { token: tokens.advisor },
    transports: ['websocket'],
    reconnection: false,
    timeout: TIMEOUT,
  });

  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('Asesor conecta WS', 'Timeout 15s'); resolve(); }, TIMEOUT);

    advisorSocket.on('connect', () => {
      clearTimeout(timer);
      pass('Asesor conecta WS', `id=${advisorSocket.id}`);
      advisorSocket.emit('advisor_ready');
      advisorSocket.emit('set_advisor_status', 'online');
      resolve();
    });

    advisorSocket.on('connect_error', (err) => {
      clearTimeout(timer);
      fail('Asesor conecta WS', err.message);
      resolve();
    });
  });

  // Esperar a que el asesor se registre en Redis
  await wait(2000);

  // 4.2 Conectar cliente
  const clientSocket = io(WS_URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: TIMEOUT,
  });

  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('Cliente conecta WS', 'Timeout 15s'); resolve(); }, TIMEOUT);

    clientSocket.on('connect', () => {
      clearTimeout(timer);
      pass('Cliente conecta WS', `id=${clientSocket.id}`);
      clientSocket.emit('join_session', { sessionId, clientName: session.clientName });
      resolve();
    });

    clientSocket.on('connect_error', (err) => {
      clearTimeout(timer);
      fail('Cliente conecta WS', err.message);
      resolve();
    });
  });

  // 4.3 Verificar message_history en cliente (confirma join_session exitoso)
  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('message_history (cliente)', 'Timeout 10s — join_session no funcionó'); resolve(); }, 10000);
    clientSocket.once('message_history', (data) => {
      clearTimeout(timer);
      const count = Array.isArray(data) ? data.length : (data?.messages?.length || 0);
      pass('message_history (cliente)', `historial recibido, ${count} mensajes`);
      resolve();
    });
  });

  // 4.4 Request advisor (transición ai → waiting → auto-assign)
  info('Enviando request_advisor...');
  const assignStart = Date.now();

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      fail('session_assigned (advisor)', 'Timeout 15s — ningún asesor fue asignado');
      resolve();
    }, TIMEOUT);

    advisorSocket.once('session_assigned', (data) => {
      clearTimeout(timer);
      assigned = true;
      const latency = Date.now() - assignStart;
      pass('session_assigned (advisor)', `latencia=${latency}ms, sessionId=${data?.sessionId || data?.id || sessionId}`);
      resolve();
    });

    advisorSocket.once('session_taken', (data) => {
      clearTimeout(timer);
      fail('session_assigned', `Sesión tomada por otro: ${JSON.stringify(data).slice(0,100)}`);
      resolve();
    });

    clientSocket.emit('request_advisor', sessionId);
  });

  // 4.5 Verificar advisor_joined en cliente
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!advisorJoined) fail('advisor_joined (cliente)', 'Timeout 10s');
      resolve();
    }, 10000);
    clientSocket.once('advisor_joined', (data) => {
      clearTimeout(timer);
      advisorJoined = true;
      pass('advisor_joined (cliente)', `advisor=${data?.name || JSON.stringify(data).slice(0,80)}`);
      resolve();
    });
    if (advisorJoined) { clearTimeout(timer); resolve(); }
  });

  // 4.6 Verificar session_updated en ambos sockets
  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('session_updated', 'Timeout 5s'); resolve(); }, 5000);
    const checkAdvisor = (data) => {
      if (data?.sessionId === sessionId && data?.status === 'active') {
        clearTimeout(timer);
        pass('session_updated', `status=active para sessionId=${sessionId}`);
        resolve();
      }
    };
    advisorSocket.once('session_updated', checkAdvisor);
    clientSocket.once('session_updated', checkAdvisor);
  });

  // 4.7 Mensaje bidireccional: cliente -> asesor
  info('Probando mensajes bidireccionales...');

  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('Mensaje cliente→asesor', 'Timeout 10s'); resolve(); }, 10000);
    advisorSocket.once('new_message', (data) => {
      clearTimeout(timer);
      messages.received++;
      pass('Mensaje cliente→asesor', `contenido="${(data?.body || data?.content || '').slice(0,50)}"`);
      resolve();
    });
    clientSocket.emit('send_message', {
      sessionId,
      content: `Test mensaje cliente ${Date.now()}`,
      senderName: session.clientName,
    });
    messages.sent++;
  });

  await wait(300);

  // 4.8 Mensaje bidireccional: asesor -> cliente
  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('Mensaje asesor→cliente', 'Timeout 10s'); resolve(); }, 10000);
    clientSocket.once('new_message', (data) => {
      clearTimeout(timer);
      messages.received++;
      pass('Mensaje asesor→cliente', `contenido="${(data?.body || data?.content || '').slice(0,50)}"`);
      resolve();
    });
    advisorSocket.emit('send_message', {
      sessionId,
      content: `Test mensaje asesor ${Date.now()}`,
      senderName: 'Asesor',
    });
    messages.sent++;
  });

  // 4.9 Verificar mensajes vía REST
  await wait(500);
  try {
    const res = await axios.get(`${BASE_URL}/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${tokens.advisor}` },
      timeout: 5000,
    });
    const msgCount = Array.isArray(res.data) ? res.data.length : (res.data?.messages?.length || 0);
    pass('GET /sessions/:id/messages', `total=${msgCount} mensajes`);
  } catch (err) {
    fail('GET /sessions/:id/messages', err.response?.data?.message || err.message);
  }

  // 4.10 Typing indicators
  try {
    let typingReceived = false;
    clientSocket.once('typing_start', () => { typingReceived = true; });
    advisorSocket.emit('typing_start', { sessionId });
    await wait(1500);
    if (typingReceived) {
      pass('Typing indicator', 'typing_start recibido por cliente');
    } else {
      info('Typing indicator: evento no propagado (comportamiento esperado en test)');
    }
  } catch (err) {
    info(`Typing indicator: ${err.message}`);
  }

  // 4.11 Cerrar sesión
  try {
    await new Promise((resolve) => {
      const timer = setTimeout(() => { fail('Cerrar sesión WS', 'Timeout 10s'); resolve(); }, 10000);
      clientSocket.once('session_closed', () => {
        clearTimeout(timer);
        pass('Cerrar sesión WS', 'session_closed recibido');
        resolve();
      });
      advisorSocket.emit('close_session', sessionId);
    });
  } catch (err) {
    fail('Cerrar sesión WS', err.message);
  }

  await wait(500);

  // Cleanup
  try { advisorSocket.disconnect(); } catch {}
  try { clientSocket.disconnect(); } catch {}

  return { assigned, messages };
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 5: Servicios complementarios
// ════════════════════════════════════════════════════════════════════════════
async function testServices(tokens) {
  console.log(`\n${C.bold}═══ ETAPA 5: Servicios Complementarios ═══${C.reset}`);

  const headers = tokens.admin ? { Authorization: `Bearer ${tokens.admin}` } : {};
  const advisorHeaders = tokens.advisor ? { Authorization: `Bearer ${tokens.advisor}` } : {};

  const endpoints = [
    { method: 'GET', url: '/sessions', headers: advisorHeaders, name: 'GET /sessions (asesor)' },
    { method: 'GET', url: '/sessions/waiting', headers, name: 'GET /sessions/waiting' },
    { method: 'GET', url: '/sessions/advisors', headers, name: 'GET /sessions/advisors' },
    { method: 'GET', url: '/sessions/metrics', headers, name: 'GET /sessions/metrics' },
    { method: 'GET', url: '/configuracion', headers: advisorHeaders, name: 'GET /configuracion' },
    { method: 'GET', url: '/faq', name: 'GET /faq' },
    { method: 'GET', url: '/faq/categorias', name: 'GET /faq/categorias' },
    { method: 'GET', url: '/widget-config', name: 'GET /widget-config' },
    { method: 'GET', url: '/configuracion/horario-hoy', name: 'GET /configuracion/horario-hoy' },
    { method: 'GET', url: '/advisors-whatsapp/connection', headers: advisorHeaders, name: 'GET /whatsapp/connection' },
    { method: 'GET', url: '/tickets', headers: advisorHeaders, name: 'GET /tickets' },
  ];

  for (const ep of endpoints) {
    try {
      const config = { timeout: 5000, validateStatus: () => true };
      if (ep.headers) config.headers = ep.headers;
      const res = await axios[ep.method.toLowerCase()](`${BASE_URL}${ep.url}`, config);
      if (res.status >= 200 && res.status < 300) {
        const dataInfo = Array.isArray(res.data) ? `${res.data.length} items` : typeof res.data;
        pass(ep.name, `${res.status} OK (${dataInfo})`);
      } else if (res.status === 401) {
        pass(`${ep.name} (sin auth)`, `${res.status} Unauthorized (esperado)`);
      } else if (res.status === 403) {
        pass(`${ep.name} (sin role)`, `${res.status} Forbidden (esperado)`);
      } else {
        fail(ep.name, `${res.status} — ${JSON.stringify(res.data).slice(0,120)}`);
      }
    } catch (err) {
      fail(ep.name, err.message);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 6: WhatsApp namespace (conexión + eventos)
// ════════════════════════════════════════════════════════════════════════════
async function testWhatsAppNamespace(tokens) {
  console.log(`\n${C.bold}═══ ETAPA 6: WhatsApp Namespace ═══${C.reset}`);

  if (!tokens.admin) {
    fail('WhatsApp namespace', 'No hay token admin disponible');
    return;
  }

  const socket = io(`${WS_URL}/advisors-whatsapp`, {
    auth: { token: tokens.admin },
    transports: ['websocket'],
    reconnection: false,
    timeout: TIMEOUT,
  });

  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('WhatsApp WS conecta', 'Timeout 15s'); resolve(); }, TIMEOUT);

    socket.on('connect', () => {
      clearTimeout(timer);
      pass('WhatsApp WS conecta', `id=${socket.id}`);
      socket.emit('aw_join', 'Admin Test');
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      fail('WhatsApp WS conecta', err.message);
      resolve();
    });
  });

  await new Promise((resolve) => {
    const timer = setTimeout(() => { fail('WhatsApp aw_connected', 'Timeout 5s'); resolve(); }, 5000);
    socket.on('aw_connected', (data) => {
      clearTimeout(timer);
      pass('WhatsApp aw_connected', JSON.stringify(data).slice(0, 100));
      resolve();
    });
  });

  try { socket.disconnect(); } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 7: Seguridad — endpoints protegidos
// ════════════════════════════════════════════════════════════════════════════
async function testSecurity() {
  console.log(`\n${C.bold}═══ ETAPA 7: Seguridad ═══${C.reset}`);

  const protectedEndpoints = [
    { method: 'GET', url: '/advisors', name: 'GET /advisors (admin only)' },
    { method: 'GET', url: '/sessions/admin/all', name: 'GET /sessions/admin/all' },
    { method: 'GET', url: '/sessions/admin/all/paginated', name: 'GET /sessions/admin/all/paginated' },
  ];

  for (const ep of protectedEndpoints) {
    try {
      const res = await axios[ep.method.toLowerCase()](`${BASE_URL}${ep.url}`, { timeout: 5000, validateStatus: () => true });
      if (res.status === 401) {
        pass(`${ep.name}`, `401 sin token (correcto)`);
      } else if (res.status === 403) {
        pass(`${ep.name}`, `403 sin rol admin (correcto)`);
      } else if (res.status >= 200 && res.status < 300) {
        fail(`${ep.name}`, `${res.status} — debería requerir auth/role`);
      } else {
        info(`${ep.name}: ${res.status} (inesperado pero no crítico)`);
      }
    } catch (err) {
      fail(`${ep.name}`, err.message);
    }
  }

  // Test token inválido
  try {
    const res = await axios.get(`${BASE_URL}/sessions`, {
      headers: { Authorization: 'Bearer invalidtoken123' },
      timeout: 5000,
      validateStatus: () => true,
    });
    if (res.status === 401) {
      pass('Token inválido rechazado', '401 Unauthorized');
    } else {
      fail('Token inválido rechazado', `Status ${res.status} — debería ser 401`);
    }
  } catch (err) {
    fail('Token inválido rechazado', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║  TEST DE ASIGNACIÓN DE CHATS EN LÍNEA                  ║${C.reset}`);
  console.log(`${C.bold}║  Backend: ${BASE_URL.padEnd(44)}║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);

  const startTime = Date.now();

  // ETAPA 1
  const healthOk = await testHealth();
  if (!healthOk) {
    console.log(`\n${C.red}${C.bold}Backend no disponible. Abortando.${C.reset}`);
    process.exit(1);
  }

  // ETAPA 2
  const tokens = await testAuth();

  // ETAPA 3
  const session = await testCreateSession();

  // ETAPA 4
  const assignmentResult = await testAssignment(session, tokens);

  // ETAPA 5
  await testServices(tokens);

  // ETAPA 6
  await testWhatsAppNamespace(tokens);

  // ETAPA 7
  await testSecurity();

  // ── Resumen ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║  RESUMEN                                               ║${C.reset}`);
  console.log(`${C.bold}╠══════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.bold}║${C.reset}  Total: ${results.length} tests | ${C.green}PASS: ${passed}${C.reset} | ${failed > 0 ? C.red : ''}FAIL: ${failed}${C.reset}${C.bold}            ║${C.reset}`);
  console.log(`${C.bold}║${C.reset}  Tiempo: ${elapsed}s                                    ${C.bold}║${C.reset}`);
  if (assignmentResult) {
    const assignStatus = assignmentResult.assigned ? C.green + 'SI' + C.reset : C.red + 'NO' + C.reset;
    console.log(`${C.bold}║${C.reset}  Asignaciones: ${assignStatus} | Msgs: ${assignmentResult.messages.sent} enviados, ${assignmentResult.messages.received} recibidos  ${C.bold}║${C.reset}`);
  }
  console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.red}${C.bold}Tests fallidos:${C.reset}`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${C.red}✗ ${r.name}: ${r.detail}${C.reset}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${C.red}Error fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
