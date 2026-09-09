import crypto from 'crypto';
import { SanitizedUser } from './types';

const HASH_ITERATIONS = 10000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export class PasswordSecurity {
  /**
   * Hashes a password using PBKDF2 with a secure random salt.
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST)
      .toString('hex');
    return `pbkdf2:${HASH_ITERATIONS}:${salt}:${hash}`;
  }

  /**
   * Verifies a password against a stored hashed or legacy plaintext string using constant-time comparison.
   */
  public static verifyPassword(password: string, storedValue: string): boolean {
    if (!password || !storedValue) {
      return false;
    }

    // Check if stored value is PBKDF2 format
    if (storedValue.startsWith('pbkdf2:')) {
      const parts = storedValue.split(':');
      if (parts.length !== 4) {
        return false;
      }
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedHash = parts[3];

      const computedHash = crypto
        .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
        .toString('hex');

      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      const computedBuffer = Buffer.from(computedHash, 'hex');

      if (expectedBuffer.length !== computedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
    }

    // Backward-compatible fallback for initial seeds (with constant-time comparison)
    const inputBuffer = Buffer.from(password);
    const storedBuffer = Buffer.from(storedValue);

    if (inputBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputBuffer, storedBuffer);
  }

  /**
   * Strips sensitive fields (passwords, passwordHash, raw tokens, private keys) from user objects.
   */
  public static sanitizeUser(user: any): SanitizedUser {
    if (!user) return user;
    const { password, passwordHash, salt, token, ...sanitized } = user;
    return {
      id: sanitized.id,
      name: sanitized.name,
      email: sanitized.email,
      username: sanitized.username,
      role: sanitized.role,
      outlet_id: sanitized.outlet_id ?? null,
      outlet_name: sanitized.outlet_name,
      status: sanitized.status,
      createdAt: sanitized.createdAt,
      lastLogin: sanitized.lastLogin
    };
  }

  /**
   * Recursively redacts sensitive keys from an object (passwords, tokens, api keys) for safe logging/display.
   */
  public static redactSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => PasswordSecurity.redactSensitiveData(item));
    }

    const redacted: Record<string, any> = {};
    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'token',
      'tokenhash',
      'secret',
      'apikey',
      'api_key',
      'gemini_api_key',
      'authorization',
      'cookie',
      'set-cookie'
    ]);

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.has(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = PasswordSecurity.redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}
