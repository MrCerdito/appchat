#!/usr/bin/env node
// Crea 6 asesores vía API admin (POST /advisors)
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const ADMIN_EMAIL = 'admin@innovacloud.co';
const ADMIN_PASS = 'admin123';

const ADVISORS = [
  { name: 'Asesor 1', email: 'asesor1@innovacloud.co', password: 'Asesor@123' },
  { name: 'Asesor 2', email: 'asesor2@innovacloud.co', password: 'Asesor@123' },
  { name: 'Asesor 3', email: 'asesor3@innovacloud.co', password: 'Asesor@123' },
  { name: 'Asesor 4', email: 'asesor4@innovacloud.co', password: 'Asesor@123' },
  { name: 'Asesor 5', email: 'asesor5@innovacloud.co', password: 'Asesor@123' },
  { name: 'Asesor 6', email: 'asesor6@innovacloud.co', password: 'Asesor@123' },
];

async function main() {
  // Login as admin
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!loginRes.ok) {
    console.error('Error al loguear admin:', loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const { access_token } = await loginRes.json();
  console.log('Admin logueado ✓\n');

  let created = 0, skipped = 0;
  for (const adv of ADVISORS) {
    const res = await fetch(`${BASE}/advisors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify(adv),
    });
    if (res.ok) {
      console.log(`  [OK] ${adv.name} (${adv.email})`);
      created++;
    } else if (res.status === 409) {
      console.log(`  [SKIP] ${adv.email} ya existe`);
      skipped++;
    } else {
      console.log(`  [ERR] ${adv.email} — ${res.status} ${await res.text()}`);
    }
  }

  console.log(`\nResultado: ${created} creados, ${skipped} omitidos`);
}

main().catch(console.error);
