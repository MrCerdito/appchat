#!/usr/bin/env node
import jwt from 'jsonwebtoken';
import fs from 'fs';

const JWT_SECRET = 'c8a79c0efe4098de603eb97a59df2799c50da782a530f1482d077b343037f6bd1a0e24382cadf6de6f4b5b5184fff30648b0cee3034d9f75ad7f6a66c834cde6';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const USERS = [
  { id: '4120a741-4bed-48c1-9e1d-b5b77cff01bd', name: 'Asesor Test 1', email: 'loadtest-asesor-1@test.com', role: 'advisor' },
  { id: 'f0b53fdb-b68b-44c4-ae8b-c0a28a09a25c', name: 'Asesor Test 2', email: 'loadtest-asesor-2@test.com', role: 'advisor' },
  { id: '87978bf4-4bde-426d-8142-ce2fa3282f14', name: 'Asesor Test 3', email: 'loadtest-asesor-3@test.com', role: 'advisor' },
  { id: '5922ae4b-2917-4fd4-a0c9-68685fe9b7fd', name: 'Asesor Test 4', email: 'loadtest-asesor-4@test.com', role: 'advisor' },
  { id: 'b1f49b1a-155f-4551-a124-01130b6a36cb', name: 'Asesor Test 5', email: 'loadtest-asesor-5@test.com', role: 'advisor' },
  { id: 'e217c511-196c-45f5-a293-bb1039694cf8', name: 'Asesor Test 6', email: 'loadtest-asesor-6@test.com', role: 'advisor' },
  { id: 'd7f6dd14-7b66-4b94-8c56-35b7c677465f', name: 'Asesor Test 7', email: 'loadtest-asesor-7@test.com', role: 'advisor' },
  { id: '93812ffb-59e1-4305-8771-4699c926d22b', name: 'Asesor Test 8', email: 'loadtest-asesor-8@test.com', role: 'advisor' },
  { id: 'a9cfaec1-3b28-494a-ad92-9c0c0d9f4ec9', name: 'Admin Test', email: 'loadtest-admin@test.com', role: 'admin' },
];

const tokens = USERS.map(u => ({
  name: u.name,
  email: u.email,
  token: jwt.sign({ sub: u.id, email: u.email, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '8h' }),
}));

const output = {
  baseUrl: BASE_URL,
  wsUrl: BASE_URL.replace('http', 'ws'),
  createdAt: new Date().toISOString(),
  advisors: tokens,
};

fs.writeFileSync(new URL('./test-tokens.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(`${tokens.length} tokens generados → test/test-tokens.json`);
tokens.forEach(t => console.log(`  [OK] ${t.email}`));
