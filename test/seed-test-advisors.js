#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SEED — Crear 8 asesores de prueba + 1 admin para pruebas de carga
// ═══════════════════════════════════════════════════════════════════════════
// Ejecutar:  node test/seed-test-advisors.js
// Requiere:  backend corriendo en BASE_URL (default http://localhost:3001)
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const PASSWORD = 'Asesor@123456';

const ADVISORS = [
  { name: 'Asesor Test 1',  email: 'loadtest-asesor-1@test.com' },
  { name: 'Asesor Test 2',  email: 'loadtest-asesor-2@test.com' },
  { name: 'Asesor Test 3',  email: 'loadtest-asesor-3@test.com' },
  { name: 'Asesor Test 4',  email: 'loadtest-asesor-4@test.com' },
  { name: 'Asesor Test 5',  email: 'loadtest-asesor-5@test.com' },
  { name: 'Asesor Test 6',  email: 'loadtest-asesor-6@test.com' },
  { name: 'Asesor Test 7',  email: 'loadtest-asesor-7@test.com' },
  { name: 'Asesor Test 8',  email: 'loadtest-asesor-8@test.com' },
];

const ADMIN = { name: 'Admin Test', email: 'loadtest-admin@test.com' };

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function registerUser(user, role = 'advisor') {
  try {
    const res = await axios.post(`${BASE_URL}/auth/register`, {
      name: user.name,
      email: user.email,
      password: PASSWORD,
    }, { validateStatus: () => true });

    if (res.status === 201) {
      console.log(`  [OK] ${user.name} (${user.email}) — ID: ${res.data?.id ?? 'creado'}`);
      return { ...user, id: res.data?.id, password: PASSWORD };
    }
    if (res.status === 409 || res.data?.message?.includes('existe')) {
      console.log(`  [SKIP] ${user.email} ya existe en la BD`);
      return { ...user, id: null, password: PASSWORD };
    }
    console.log(`  [WARN] ${user.email} — status ${res.status}: ${JSON.stringify(res.data)}`);
    return null;
  } catch (err) {
    console.log(`  [ERR]  ${user.email} — ${err.message}`);
    return null;
  }
}

async function loginUser(email, password) {
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email,
      password,
    }, { validateStatus: () => true });

    if (res.status === 200 && res.data?.access_token) {
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SEED — Asesores de prueba para pruebas de carga');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Backend: ${BASE_URL}`);
  console.log('');

  // Verificar que el backend está arriba
  try {
    await axios.get(`${BASE_URL}/health`);
    console.log('  Backend detectado ✓\n');
  } catch {
    console.error('  ✗ No se pudo conectar al backend en ' + BASE_URL);
    console.error('    Asegúrate de que docker compose está corriendo.');
    process.exit(1);
  }

  // Registrar asesores (con pausa para evitar throttler de 3/min en register)
  console.log('─ Registrando asesores ─');
  const advisors = [];
  for (let i = 0; i < ADVISORS.length; i++) {
    const u = ADVISORS[i];
    const result = await registerUser(u, 'advisor');
    if (result) advisors.push(result);
    // Pausa: register tiene throttle de 3/min
    if (i < ADVISORS.length - 1) await wait(22000);
  }

  // Registrar admin (sin pausa extra al final)
  console.log('\n─ Registrando admin ─');
  const admin = await registerUser(ADMIN, 'admin');
  if (admin) advisors.push(admin);

  // Login y generar tokens
  console.log('\n─ Generando tokens de prueba ─');
  const tokens = [];
  for (const a of advisors) {
    const loginResult = await loginUser(a.email, PASSWORD);
    if (loginResult) {
      tokens.push({
        name: a.name,
        email: a.email,
        accessToken: loginResult.access_token,
        refreshToken: loginResult.refresh_token,
      });
      console.log(`  [OK] ${a.email} → token generado`);
    } else {
      console.log(`  [SKIP] ${a.email} → no se pudo loguear (¿usuario no existe en BD?)`);
    }
    await wait(1200); // pausa para no pegarle al throttler de login
  }

  // Guardar tokens en archivo para que load-test-full.js los use
  const fs = await import('fs');
  const output = {
    baseUrl: BASE_URL,
    wsUrl: BASE_URL.replace('http', 'ws'),
    createdAt: new Date().toISOString(),
    advisors: tokens.map(t => ({
      name: t.name,
      email: t.email,
      token: t.accessToken,
    })),
  };

  fs.writeFileSync(
    new URL('./test-tokens.json', import.meta.url),
    JSON.stringify(output, null, 2),
  );
  console.log(`\n  Tokens guardados en test/test-tokens.json`);

  // Resumen
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${tokens.length}/${ADVISORS.length + 1} usuarios listos`);
  console.log('═══════════════════════════════════════════════════════');

  if (tokens.length === 0) {
    console.error('\n  No se generó ningún token. Causas posibles:');
    console.error('  1. El throttler de register (3/min) bloqueó todo');
    console.error('  2. Los usuarios ya existen con contraseña diferente');
    console.error('  3. La BD no tiene la tabla users');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
