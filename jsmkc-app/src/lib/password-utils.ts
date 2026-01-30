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
 * IMPORTANT: Passwords in this system are used for player score entry
 * authentication, NOT for admin OAuth login. Admin authentication
 * uses OAuth providers (Discord, GitHub, Google) via NextAuth.
 *
 * Usage:
 *   import { hashPassword, verifyPassword } from '@/lib/password-utils';
 *   const hash = await hashPassword('plaintext');
 *   const isValid = await verifyPassword('plaintext', hash);
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Number of bcrypt salt rounds (cost factor).
 *
 * 12 rounds provides a good balance between security and performance:
 * - Each additional round doubles the computation time
 * - 12 rounds takes approximately 250ms on modern hardware
 * - This is fast enough for login but slow enough to deter brute-force
 * - NIST recommends at least 10 rounds; 12 provides extra margin
 *
 * If performance becomes an issue on the deployment hardware, this can
 * be reduced to 10, but should never go below 10.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Generates a cryptographically secure random password.
 *
 * Used when creating player accounts programmatically (e.g., batch
 * player import) where the admin needs a temporary password that
 * players can use for initial login.
 *
 * The generated password contains a mix of uppercase letters, lowercase
 * letters, digits, and special characters to meet common password
 * policy requirements.
 *
 * @param length - Desired password length (default: 12 characters)
 * @returns A random password string of the specified length
 *
 * @example
 *   const tempPassword = generateSecurePassword();
 *   // Returns something like: "kR7$mP2xNq!f"
 *
 *   const longPassword = generateSecurePassword(20);
 *   // Returns a 20-character random password
 */
export function generateSecurePassword(length: number = 12): string {
  // Character set includes all four categories for password complexity.
  // This ensures generated passwords meet common password policy requirements:
  // - Uppercase letters (A-Z)
  // - Lowercase letters (a-z)
  // - Digits (0-9)
  // - Special characters (!@#$%^&*)
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

  // Use crypto.getRandomValues for cryptographically secure randomness.
  // This is more secure than Math.random() which uses a PRNG that
  // may be predictable.
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  // Build the password by mapping each random value to a character.
  // Using modulo to index into the charset. While modulo can introduce
  // slight bias, the charset length (70) is small enough relative to
  // Uint32 range (4 billion) that the bias is negligible.
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
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
 *
 * @example
 *   const hash = await hashPassword('myPassword123');
 *   // Store hash in database: "$2b$12$LJ3m4/V..."
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
 *
 * @example
 *   const isValid = await verifyPassword(submittedPassword, storedHash);
 *   if (!isValid) {
 *     return handleAuthError('Invalid credentials');
 *   }
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
    console.error('Password verification error:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}
