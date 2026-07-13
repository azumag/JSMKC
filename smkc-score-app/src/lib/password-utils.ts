/**
 * Bcrypt Password Utilities
 *
 * Provides secure password hashing and verification using bcrypt,
 * the industry standard for password storage.
 *
 * bcrypt is preferred over SHA-256 or other fast hash functions because:
 * - It's intentionally slow (configurable via salt rounds)
 * - It incorporates a salt automatically (no separate salt storage needed)
 * - It's resistant to GPU-based and ASIC brute-force attacks
 * - The cost factor can be increased over time as hardware improves
 *
 * These utilities are used for:
 * - Player credential authentication (the "player-credentials" provider)
 * - Password generation for new player accounts
 *
 * IMPORTANT: Passwords in this system are used for both player sessions
 * and administrator sessions. Admin access is granted by allowlisting
 * specific player nicknames after credential login.
 *
 * Usage:
 *   import { hashPassword, verifyPassword } from '@/lib/password-utils';
 *   const hash = await hashPassword('plaintext');
 *   const isValid = await verifyPassword('plaintext', hash);
 */

import bcrypt from 'bcryptjs';
import { createLogger } from '@/lib/logger';

const logger = createLogger('password-utils');

/**
 * Number of bcrypt salt rounds (cost factor).
 *
 * 10 rounds provides strong security within Cloudflare Workers constraints:
 * - Each additional round doubles the computation time
 * - 10 rounds takes ~65ms on modern hardware, ~200ms on Workers WASM
 * - 12 rounds caused frequent Workers 1101 crashes (CPU/memory pressure)
 * - NIST recommends at least 10 rounds; this is the recommended minimum
 * - bcryptjs on WASM is significantly slower than native, so 10 is optimal
 */
export const BCRYPT_ROUNDS = 10;

/**
 * Human-readable character set for generated temporary passwords.
 *
 * Ambiguous glyphs are intentionally excluded so passwords remain easy to
 * transcribe even when rendered with fonts where similar characters are hard
 * to distinguish:
 * - Uppercase: I, O
 * - Lowercase: l, o
 * - Digits: 0, 1
 */
export const READABLE_PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';

/**
 * Generates a cryptographically secure random password.
 *
 * Used when creating player accounts programmatically (e.g., batch
 * player import) where the admin needs a temporary password that
 * players can use for initial login.
 *
 * The generated password contains uppercase letters, lowercase letters,
 * digits, and special characters while excluding visually ambiguous glyphs.
 *
 * @param length - Desired password length (default: 12 characters)
 * @returns A random password string of the specified length
 */
export function generateSecurePassword(length: number = 12): string {
  // Use the Web Crypto API for cryptographically secure randomness.
  // globalThis.crypto is available in browsers, Node.js, and
  // Cloudflare Workers, unlike the Node-specific crypto module import.
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generation is unavailable');
  }

  const randomValues = new Uint32Array(length);
  cryptoApi.getRandomValues(randomValues);

  // Build the password by mapping each random value to a character.
  // Using modulo to index into the charset. While modulo can introduce
  // slight bias, the charset is small enough relative to Uint32 range
  // that the bias is negligible.
  let password = '';
  for (let i = 0; i < length; i++) {
    password += READABLE_PASSWORD_CHARSET[randomValues[i] % READABLE_PASSWORD_CHARSET.length];
  }

  return password;
}

/**
 * Hashes a plain text password using bcrypt.
 *
 * The resulting hash includes the algorithm version, cost factor,
 * salt, and hash in a single string (e.g., "$2b$12$...").
 * This means no separate salt storage is needed.
 *
 * @param plainPassword - The plain text password to hash
 * @returns The bcrypt hash string (60 characters)
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  // bcrypt.hash generates a random salt and computes the hash in one step.
  // The BCRYPT_ROUNDS parameter controls the computational cost:
  // higher values are more secure but slower.
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Verifies a plain text password against a stored bcrypt hash.
 *
 * Uses bcrypt.compare which is designed to be timing-safe,
 * preventing timing side-channel attacks that could reveal
 * information about the password.
 *
 * Returns false (rather than throwing) when verification fails
 * or when an error occurs, following the fail-safe principle.
 *
 * @param plainPassword - The plain text password to verify
 * @param hashedPassword - The stored bcrypt hash to verify against
 * @returns true if the password matches the hash, false otherwise
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  try {
    // bcrypt.compare extracts the salt from the stored hash and
    // re-computes the hash with the plain password to check for a match.
    // This operation is intentionally slow (matching the cost of hashing)
    // to prevent timing-based password enumeration.
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    // If comparison fails (e.g., malformed hash string), return false.
    // Logging the error for diagnostics but NOT the passwords.
    // Returning false instead of throwing follows the fail-safe principle:
    // authentication failures should never crash the application.
    logger.error('Password verification error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return false;
  }
}
