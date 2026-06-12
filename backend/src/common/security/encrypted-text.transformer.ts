import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { ValueTransformer } from 'typeorm';

const PREFIX = 'enc:v1:';

function getKey(): Buffer | null {
  const raw = process.env.CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

export const encryptedTextTransformer: ValueTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (value.startsWith(PREFIX)) return value;

    const key = getKey();
    if (!key) return value;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  },

  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (!value.startsWith(PREFIX)) return value;

    const key = getKey();
    if (!key) return value;

    try {
      const payload = value.slice(PREFIX.length);
      const [ivB64, tagB64, encryptedB64] = payload.split(':');
      if (!ivB64 || !tagB64 || !encryptedB64) return value;

      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return value;
    }
  },
};
