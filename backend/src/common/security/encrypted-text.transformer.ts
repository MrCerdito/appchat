import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
import { Logger } from '@nestjs/common';
import { DataSource, ValueTransformer } from 'typeorm';

const PREFIX_V1 = 'enc:v1:';
const PREFIX_V2 = 'enc:v2:';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

const logger = new Logger('Encryption');
let keyWarningLogged = false;

// ── Two separate globalThis caches (survives double module loads) ──────────
const g = globalThis as any;
if (!g.__pbkdf2Cache) g.__pbkdf2Cache = new Map<string, Buffer>();
if (!g.__decryptCache) g.__decryptCache = new Map<string, string>();
const pbkdf2Cache: Map<string, Buffer> = g.__pbkdf2Cache;
const decryptCache: Map<string, string> = g.__decryptCache;

function logKeyWarning(): void {
  if (!keyWarningLogged) {
    logger.warn(
      'CHAT_ENCRYPTION_KEY no está configurada. ' +
        'Los mensajes se guardarán en TEXTO PLANO sin cifrado. ' +
        'Configúrala en el archivo .env (64 caracteres hexadecimales).',
    );
    keyWarningLogged = true;
  }
}

function deriveKeyV1(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}

function deriveKeyV2Sync(raw: string, salt: Buffer): Buffer {
  const cacheKey = salt.toString('base64');
  let cached = pbkdf2Cache.get(cacheKey);
  if (cached) return cached;
  cached = pbkdf2Sync(raw, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  pbkdf2Cache.set(cacheKey, cached);
  return cached;
}

function getKey(): Buffer | null {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    logKeyWarning();
    return null;
  }
  return deriveKeyV1(raw);
}

// ── Parse a v2 encrypted value into its parts ─────────────────────────────
function parseV2(value: string): { salt: Buffer; iv: Buffer; tag: Buffer; encrypted: Buffer } | null {
  const payload = value.slice(PREFIX_V2.length);
  const [saltB64, ivB64, tagB64, encryptedB64] = payload.split(':');
  if (!saltB64 || !ivB64 || !tagB64 || !encryptedB64) return null;
  return {
    salt: Buffer.from(saltB64, 'base64'),
    iv: Buffer.from(ivB64, 'base64'),
    tag: Buffer.from(tagB64, 'base64'),
    encrypted: Buffer.from(encryptedB64, 'base64'),
  };
}

function decryptV2(raw: string, parsed: { salt: Buffer; iv: Buffer; tag: Buffer; encrypted: Buffer }): string {
  const key = deriveKeyV2Sync(raw, parsed.salt);
  const decipher = createDecipheriv('aes-256-gcm', key, parsed.iv);
  decipher.setAuthTag(parsed.tag);
  return Buffer.concat([
    decipher.update(parsed.encrypted),
    decipher.final(),
  ]).toString('utf8');
}

export const encryptedTextTransformer: ValueTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2))
      return value;

    const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
    if (!raw) {
      logKeyWarning();
      return value;
    }

    const salt = randomBytes(SALT_LENGTH);
    const key = deriveKeyV2Sync(raw, salt);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${PREFIX_V2}${salt.toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  },

  from(value: string | null | undefined): string | null {
    if (value == null) return null;

    const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
    if (!raw) {
      if (value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2)) {
        logKeyWarning();
      }
      if (!value.startsWith(PREFIX_V1) && !value.startsWith(PREFIX_V2)) {
        return value;
      }
      return value;
    }

    try {
      if (value.startsWith(PREFIX_V2)) {
        const cached = decryptCache.get(value);
        if (cached !== undefined) return cached;

        const parsed = parseV2(value);
        if (!parsed) return value;
        const decrypted = decryptV2(raw, parsed);
        decryptCache.set(value, decrypted);
        return decrypted;
      }

      if (value.startsWith(PREFIX_V1)) {
        const key = deriveKeyV1(raw);
        const payload = value.slice(PREFIX_V1.length);
        const [ivB64, tagB64, encryptedB64] = payload.split(':');
        if (!ivB64 || !tagB64 || !encryptedB64) return value;

        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(ivB64, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(encryptedB64, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      }

      return value;
    } catch {
      return value;
    }
  },
};

// ── Async warmup: pre-compute all decrypted values at startup ─────────────
const BATCH_SIZE = 10;

export async function warmupEncryptedCache(dataSource: DataSource): Promise<void> {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) return;

  try {
    const tables = [
      { table: 'sessions', columns: ['client_name', 'identificacion', 'apellido'] },
      { table: 'messages', columns: ['content', 'sender_name'] },
      { table: 'whatsapp_messages', columns: ['body'] },
      { table: 'teams_tokens', columns: ['access_token', 'refresh_token'] },
    ];

    const allValues = new Set<string>();

    for (const { table, columns } of tables) {
      for (const col of columns) {
        try {
          const rows: any[] = await dataSource.query(
            `SELECT DISTINCT "${col}" FROM "${table}" WHERE "${col}"::text LIKE 'enc:v2:%' AND "${col}" IS NOT NULL`,
          );
          for (const row of rows) {
            const v = row[col];
            if (typeof v === 'string' && v.startsWith(PREFIX_V2)) {
              allValues.add(v);
            }
          }
        } catch {
          // table or column might not exist yet
        }
      }
    }

    if (allValues.size === 0) {
      logger.log('Warmup: no encrypted values found — cache empty');
      return;
    }

    // Pre-fill the pbkdf2 key cache (salt → derived key) concurrently
    const uniqueSalts = new Map<string, Buffer>();
    for (const value of allValues) {
      const parsed = parseV2(value);
      if (!parsed) continue;
      const saltB64 = parsed.salt.toString('base64');
      if (!uniqueSalts.has(saltB64) && !pbkdf2Cache.has(saltB64)) {
        uniqueSalts.set(saltB64, parsed.salt);
      }
    }

    // Derive keys in batches of BATCH_SIZE concurrently
    const saltEntries = [...uniqueSalts.entries()];
    for (let i = 0; i < saltEntries.length; i += BATCH_SIZE) {
      const batch = saltEntries.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async ([saltB64, salt]) => {
          const key = await new Promise<Buffer>((resolve, reject) =>
            pbkdf2(raw, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) =>
              err ? reject(err) : resolve(derivedKey),
            ),
          );
          pbkdf2Cache.set(saltB64, key);
        }),
      );
      // Yield to event loop between batches
      await new Promise((r) => setImmediate(r));
    }

    // Now decrypt all values using the pre-derived keys (sync is fine — keys are cached)
    for (const value of allValues) {
      if (decryptCache.has(value)) continue;
      try {
        const parsed = parseV2(value);
        if (!parsed) continue;
        const decrypted = decryptV2(raw, parsed);
        decryptCache.set(value, decrypted);
      } catch {
        // skip corrupt values
      }
    }

    logger.log(
      `Warmup complete: ${decryptCache.size} decrypted values, ${pbkdf2Cache.size} derived keys cached`,
    );
  } catch (err) {
    logger.warn(`Warmup failed: ${err}`);
  }
}
