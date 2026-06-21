import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Encrypts/decrypts sensitive string fields (OAuth client secrets, API keys)
 * before they're persisted to MongoDB, so a database compromise alone does
 * not expose plaintext credentials.
 *
 * Uses AES-256-GCM (authenticated encryption — tampering is detected, not
 * just confidentiality). The key is derived from the `ENCRYPTION_KEY` env
 * var via SHA-256, so any string of any length can be supplied and still
 * yield a valid 32-byte AES-256 key.
 *
 * Encrypted output format: `<ivHex>:<authTagHex>:<ciphertextHex>`
 * This is a single self-describing string, safe to store directly in a
 * Mongoose String field.
 */

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env['ENCRYPTION_KEY'];
  if (!secret) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required to encrypt/decrypt sensitive fields. ' +
      'Generate one with: openssl rand -hex 32',
    );
  }
  // SHA-256 always yields exactly 32 bytes — correct for AES-256 regardless
  // of the raw secret's length.
  return createHash('sha256').update(secret).digest();
}

export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptField(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    // Not in our encrypted format — likely legacy plaintext data from
    // before encryption was added. Return as-is rather than throwing,
    // so existing rows keep working until they're next saved (which
    // will re-encrypt them via the pre-save hook).
    return encrypted;
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** True if the string is already in our `iv:authTag:ciphertext` encrypted format. */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}