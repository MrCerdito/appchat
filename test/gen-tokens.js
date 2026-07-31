#!/usr/bin/env node
// Genera tokens JWT directamente (bypass throttler) usando el secret del backend
import jwt from 'jsonwebtoken';
import fs from 'fs';
import axios from 'axios';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    const envFile = fs.readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
    const m = envFile.split('\n').find((l) => l.startsWith('JWT_SECRET='));
    if (m) return m.split('=').slice(1).join('=').trim();
  } catch {}
  console.error('JWT_SECRET no encontrado. Pasa JWT_SECRET=... por env o configura backend/.env');
  process.exit(1);
}
const JWT_SECRET = loadSecret();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const USERS = [
  { name: 'Asesor Test 1', email: 'loadtest-asesor-1@test.com', role: 'advisor' },
  { name: 'Asesor Test 2', email: 'loadtest-asesor-2@test.com', role: 'advisor' },
  { name: 'Asesor Test 3', email: 'loadtest-asesor-3@test.com', role: 'advisor' },
  { name: 'Asesor Test 4', email: 'loadtest-asesor-4@test.com', role: 'advisor' },
  { name: 'Asesor Test 5', email: 'loadtest-asesor-5@test.com', role: 'advisor' },
  { name: 'Asesor Test 6', email: 'loadtest-asesor-6@test.com', role: 'advisor' },
  { name: 'Asesor Test 7', email: 'loadtest-asesor-7@test.com', role: 'advisor' },
  { name: 'Asesor Test 8', email: 'loadtest-asesor-8@test.com', role: 'advisor' },
  { name: 'Admin Test',   email: 'loadtest-admin@test.com',   role: 'admin' },
];

async function getUserIdByEmail(email) {
  try {
    // Use a valid token to query users
    const token = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000000', email: 'seed@local', name: 'seed', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '30s' }
    );

    // We need real user IDs. Let's just query the DB via backend or generate with known IDs
    const res = await axios.get(`${BASE_URL}/sessions/advisors`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
      validateStatus: () => true,
    });

    if (res.status === 200) {
      const advisors = Array.isArray(res.data) ? res.data : [];
      const map = {};
      for (const a of advisors) {
        map[a.email] = a.id;
      }
      return map;
    }
  } catch {}
  return {};
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Generador de tokens JWT (bypass throttler)');
  console.log('═══════════════════════════════════════════════════════\n');

  // First, get user IDs by logging in just one user to get an admin token
  // Then query the advisors list

  // Alternative: just try to login one at a time with longer delays
  // Or: query the DB for user IDs directly

  // Best approach: generate tokens with fake IDs, then verify which ones work
  // Actually we need real IDs. Let's try login with enough delay

  console.log('Fetching user IDs from API...');
  const emailToId = {};

  // Try each login with long delays to avoid throttler
  for (const user of USERS) {
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email: user.email,
        password: 'Asesor@123456',
      }, { timeout: 8000, validateStatus: () => true });

      if (res.status === 200 && res.data?.user?.id) {
        emailToId[user.email] = res.data.user.id;
        console.log(`  [ID] ${user.email} → ${res.data.user.id}`);
      } else if (res.status === 429) {
        console.log(`  [WAIT] Throttled on ${user.email}, waiting 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        // Retry once
        const res2 = await axios.post(`${BASE_URL}/auth/login`, {
          email: user.email,
          password: 'Asesor@123456',
        }, { timeout: 8000, validateStatus: () => true });
        if (res2.status === 200 && res2.data?.user?.id) {
          emailToId[user.email] = res2.data.user.id;
          console.log(`  [ID] ${user.email} → ${res2.data.user.id} (retry OK)`);
        } else {
          console.log(`  [FAIL] ${user.email} — retry also failed: ${res2.status}`);
        }
      }
    } catch (err) {
      console.log(`  [ERR] ${user.email} — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 13000));
  }

  console.log(`\nGot ${Object.keys(emailToId).length}/${USERS.length} user IDs`);

  // Generate tokens with real IDs
  const tokens = [];
  for (const user of USERS) {
    const userId = emailToId[user.email];
    if (!userId) {
      console.log(`  [SKIP] No ID for ${user.email}`);
      continue;
    }

    const token = jwt.sign(
      { sub: userId, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    tokens.push({
      name: user.name,
      email: user.email,
      token,
    });
    console.log(`  [OK] ${user.email} → token generado`);
  }

  // Verify one token works
  if (tokens.length > 0) {
    try {
      const verifyRes = await axios.get(`${BASE_URL}/sessions/advisors`, {
        headers: { Authorization: `Bearer ${tokens[0].token}` },
        timeout: 5000,
        validateStatus: () => true,
      });
      console.log(`\nVerificación: ${verifyRes.status === 200 ? '✓ Token válido' : '✗ Token inválido (' + verifyRes.status + ')'}`);
    } catch (err) {
      console.log(`\nVerificación falló: ${err.message}`);
    }
  }

  const output = {
    baseUrl: BASE_URL,
    wsUrl: BASE_URL.replace('http', 'ws'),
    createdAt: new Date().toISOString(),
    advisors: tokens,
  };

  fs.writeFileSync(
    new URL('./test-tokens.json', import.meta.url),
    JSON.stringify(output, null, 2),
  );
  console.log(`\n${tokens.length} tokens guardados en test/test-tokens.json`);
}

main().catch(console.error);
