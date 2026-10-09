import { encryptedTextTransformer } from './encrypted-text.transformer';

describe('encryptedTextTransformer', () => {
  const originalPrimary = process.env.CHAT_ENCRYPTION_KEY;
  const originalFallback = process.env.CHAT_ENCRYPTION_KEY_FALLBACK;
  const globalCache = globalThis as typeof globalThis & {
    __pbkdf2Cache?: Map<string, Buffer>;
    __decryptCache?: Map<string, string>;
  };

  beforeEach(() => {
    globalCache.__pbkdf2Cache?.clear();
    globalCache.__decryptCache?.clear();
  });

  afterAll(() => {
    if (originalPrimary === undefined) delete process.env.CHAT_ENCRYPTION_KEY;
    else process.env.CHAT_ENCRYPTION_KEY = originalPrimary;

    if (originalFallback === undefined)
      delete process.env.CHAT_ENCRYPTION_KEY_FALLBACK;
    else process.env.CHAT_ENCRYPTION_KEY_FALLBACK = originalFallback;

    globalCache.__pbkdf2Cache?.clear();
    globalCache.__decryptCache?.clear();
  });

  it('uses a distinct PBKDF2 cache entry for fallback keys', () => {
    const previousKey = 'a'.repeat(64);
    const currentKey = 'b'.repeat(64);
    const plaintext = 'mensaje histórico';

    process.env.CHAT_ENCRYPTION_KEY = previousKey;
    const encrypted = encryptedTextTransformer.to(plaintext);

    // Simulate warmup deriving and caching this ciphertext salt with the
    // current primary key before the fallback key is tried.
    globalCache.__pbkdf2Cache?.clear();
    globalCache.__decryptCache?.clear();
    process.env.CHAT_ENCRYPTION_KEY = currentKey;
    process.env.CHAT_ENCRYPTION_KEY_FALLBACK = previousKey;

    expect(encryptedTextTransformer.from(encrypted)).toBe(plaintext);
  });
});
