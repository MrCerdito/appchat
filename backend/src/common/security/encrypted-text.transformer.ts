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

function getPbkdf2CacheKey(raw: string, salt: Buffer): string {
  const keyFingerprint = createHash('sha256').update(raw).digest('hex');
  return `${keyFingerprint}:${salt.toString('base64')}`;
}

function deriveKeyV2Sync(raw: string, salt: Buffer): Buffer {
  const cacheKey = getPbkdf2CacheKey(raw, salt);
  let cached = pbkdf2Cache.get(cacheKey);
  if (cached) return cached;
  cached = pbkdf2Sync(
    raw,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  pbkdf2Cache.set(cacheKey, cached);
  return cached;
}

const UNAVAILABLE = '[Mensaje no disponible]';

function getKey(): Buffer | null {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    logKeyWarning();
    return null;
  }
  return deriveKeyV1(raw);
}

function getFallbackKey(): Buffer | null {
  const raw = process.env.CHAT_ENCRYPTION_KEY_FALLBACK?.trim();
  if (!raw) return null;
  return deriveKeyV1(raw);
}

// ── Parse a v2 encrypted value into its parts ─────────────────────────────
function parseV2(
  value: string,
): { salt: Buffer; iv: Buffer; tag: Buffer; encrypted: Buffer } | null {
  const payload = value.slice(PREFIX_V2.length);
  const [saltB64, ivB64, tagB64, encryptedB64] = payload.split(':');
  if (!saltB64 || !ivB64 || !tagB64) return null;
  return {
    salt: Buffer.from(saltB64, 'base64'),
    iv: Buffer.from(ivB64, 'base64'),
    tag: Buffer.from(tagB64, 'base64'),
    encrypted: Buffer.from(encryptedB64, 'base64'),
  };
}

function decryptV2(
  raw: string,
  parsed: { salt: Buffer; iv: Buffer; tag: Buffer; encrypted: Buffer },
): string {
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
    const isEnc = value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2);

    if (!raw) {
      if (isEnc) {
        logKeyWarning();
        return UNAVAILABLE;
      }
      return value;
    }

    const doDecrypt = (key: string): string | null => {
      if (value.startsWith(PREFIX_V2)) {
        const cached = decryptCache.get(value);
        if (cached !== undefined) return cached;

        const parsed = parseV2(value);
        if (!parsed) return null;
        const decrypted = decryptV2(key, parsed);
        decryptCache.set(value, decrypted);
        return decrypted;
      }

      if (value.startsWith(PREFIX_V1)) {
        const derivedKey = deriveKeyV1(key);
        const payload = value.slice(PREFIX_V1.length);
        const [ivB64, tagB64, encryptedB64] = payload.split(':');
        if (!ivB64 || !tagB64) return null;

        const decipher = createDecipheriv(
          'aes-256-gcm',
          derivedKey,
          Buffer.from(ivB64, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(encryptedB64, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      }

      return null;
    };

    if (!isEnc) return value;

    const fallback = process.env.CHAT_ENCRYPTION_KEY_FALLBACK?.trim();
    const keys =
      process.env.CHAT_ENCRYPTION_KEY_FALLBACK_FIRST === 'true'
        ? [fallback, raw].filter((key): key is string => Boolean(key))
        : [raw, fallback].filter((key): key is string => Boolean(key));
    for (const key of keys) {
      try {
        const result = doDecrypt(key);
        if (result !== null) return result;
      } catch {}
    }

    logger.error(
      `No se pudo desencriptar valor (intentadas key primaria y fallback): ${value.slice(0, 40)}...`,
    );
    return UNAVAILABLE;
  },
};

// ── Async warmup: pre-compute all decrypted values at startup ─────────────
const BATCH_SIZE = 10;

export async function warmupEncryptedCache(
  dataSource: DataSource,
): Promise<void> {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) return;
  if (
    process.env.CHAT_ENCRYPTION_KEY_FALLBACK_FIRST === 'true' &&
    process.env.CHAT_ENCRYPTION_KEY_FALLBACK?.trim()
  ) {
    logger.log('Warmup skipped: historical fallback is tried first on demand');
    return;
  }
  const rawKeys = [raw, process.env.CHAT_ENCRYPTION_KEY_FALLBACK?.trim()].filter(
    (key): key is string => Boolean(key),
  );

  // Ejecutar de forma completamente asíncrona fuera del ciclo de arranque crítico principal
  setImmediate(async () => {
    try {
      // Intentar realizar una consulta simple de prueba para verificar conectividad con la BD
      await dataSource.query(`SELECT 1`).catch(() => {});

      const tables = [
        {
          table: 'sessions',
          columns: ['client_name', 'identificacion', 'apellido'],
        },
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
            // tabla o columna no existe aún
          }
        }
      }

      if (allValues.size === 0) {
        logger.log('Warmup: no encrypted values found — cache empty');
        return;
      }

      const uniqueSalts = new Map<string, { rawKey: string; salt: Buffer }>();
      for (const value of allValues) {
        const parsed = parseV2(value);
        if (!parsed) continue;
        for (const rawKey of rawKeys) {
          const cacheKey = getPbkdf2CacheKey(rawKey, parsed.salt);
          if (!uniqueSalts.has(cacheKey) && !pbkdf2Cache.has(cacheKey)) {
            uniqueSalts.set(cacheKey, { rawKey, salt: parsed.salt });
          }
        }
      }

      const saltEntries = [...uniqueSalts.entries()];
      for (let i = 0; i < saltEntries.length; i += BATCH_SIZE) {
        const batch = saltEntries.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async ([cacheKey, { rawKey, salt }]) => {
            const key = await new Promise<Buffer>((resolve, reject) =>
              pbkdf2(
                rawKey,
                salt,
                PBKDF2_ITERATIONS,
                PBKDF2_KEYLEN,
                PBKDF2_DIGEST,
                (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)),
              ),
            );
            pbkdf2Cache.set(cacheKey, key);
          }),
        );
        await new Promise((r) => setImmediate(r));
      }

      for (const value of allValues) {
        if (decryptCache.has(value)) continue;
        const parsed = parseV2(value);
        if (!parsed) continue;
        for (const rawKey of rawKeys) {
          try {
            const decrypted = decryptV2(rawKey, parsed);
            decryptCache.set(value, decrypted);
            break;
          } catch {
            // Intentar la siguiente clave configurada.
          }
        }
      }

      logger.log(
        `Warmup complete: ${decryptCache.size} decrypted values, ${pbkdf2Cache.size} derived keys cached`,
      );
    } catch (err) {
      logger.warn(`Warmup skipped/failed safely: ${(err as Error).message}`);
    }
  });
}
