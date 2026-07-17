import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
import { Logger } from '@nestjs/common';
import { ValueTransformer } from 'typeorm';

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

function deriveKeyV2(raw: string, salt: Buffer): Buffer {
  return pbkdf2Sync(raw, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
}

function getKey(): Buffer | null {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    logKeyWarning();
    return null;
  }
  return deriveKeyV1(raw);
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
    const key = deriveKeyV2(raw, salt);
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
        const payload = value.slice(PREFIX_V2.length);
        const [saltB64, ivB64, tagB64, encryptedB64] = payload.split(':');
        if (!saltB64 || !ivB64 || !tagB64 || !encryptedB64) return value;

        const salt = Buffer.from(saltB64, 'base64');
        const key = deriveKeyV2(raw, salt);
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
