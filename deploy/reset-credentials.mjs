#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// reset-credentials.mjs — Restablece contraseñas de admin y asesores
// a valores fuertes generados al azar (una sola ejecución).
//
// USO:
//   node deploy/reset-credentials.mjs            # admin + todos los asesores
//   node deploy/reset-credentials.mjs --advisor  # solo asesores (rol advisor)
//   node deploy/reset-credentials.mjs --email a@b.co   # solo ese email
//
// Lee la config de backend/.env. Imprime las nuevas credenciales en stdout.
// ═══════════════════════════════════════════════════════════════════════════

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const pg = require('pg');
const bcrypt = require('bcrypt');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'backend', '.env');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function generateStrongPassword(len = 16) {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = require('crypto').randomBytes(len);
  let pw = '';
  for (let i = 0; i < bytes.length; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyEmail = args
    .find((a) => a.startsWith('--email='))
    ?.split('=')[1];
  const onlyAdvisors = args.includes('--advisor');

  const env = loadEnv(envPath);
  const dbHost = env.DB_HOST || 'localhost';
  const dbPort = Number(env.DB_PORT || 5433);
  const dbUser = env.DB_USER || 'postgres';
  const dbPass = env.DB_PASS || 'postgres';
  const dbName = env.DB_NAME || 'app';

  const pool = new pg.Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass,
    database: dbName,
  });

  const where = onlyEmail
    ? 'email = $1'
    : onlyAdvisors
      ? "role = 'advisor'"
      : "role IN ('admin','advisor')";
  const params = onlyEmail ? [onlyEmail] : [];

  const { rows } = await pool.query(
    `SELECT id, email, name, role, active FROM users WHERE ${where} ORDER BY role, email`,
    params,
  );

  if (rows.length === 0) {
    console.error('No se encontraron usuarios para restablecer.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  NUEVAS CREDENCIALES (guardarlas y borrar esta salida)');
  console.log('═══════════════════════════════════════════════════════════');

  for (const user of rows) {
    const password = generateStrongPassword();
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, refresh_token = NULL WHERE id = $2',
      [hash, user.id],
    );
    const estado = user.active ? 'ACTIVO' : 'DESACTIVADO';
    console.log(`  [${user.role.toUpperCase()}] ${user.email} (${estado})`);
    console.log(`      nombre: ${user.name}`);
    console.log(`      password: ${password}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
