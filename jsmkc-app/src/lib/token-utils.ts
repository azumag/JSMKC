/**
 * Tournament Token Generation and Validation Utilities
 *
 * Provides cryptographically secure token generation and validation
 * for the tournament participant score entry system.
 *
 * Tokens are used to authenticate players who need to submit scores
 * during live tournaments without requiring full OAuth login.
 * Each tournament can have one active token at a time.
 *
 * Token format: 32-character hexadecimal string (16 random bytes)
 * Example: "a1b2c3d4e5f6789012345678abcdef00"
 *
 * Token lifecycle:
 * 1. Admin generates a token for a tournament
 * 2. Token is shared with participants (displayed on screen, QR code, etc.)
 * 3. Participants enter the token to access score entry page
 * 4. Token expires after a configurable duration (default 24 hours)
 * 5. Admin can regenerate or invalidate tokens at any time
 *
 * Usage:
 *   import { generateTournamentToken, isTokenValid } from '@/lib/token-utils';
 *   const token = generateTournamentToken();
 *   const expiry = getTokenExpiry(24);
 *   const valid = isTokenValid(token, expiry);
 */

import crypto from 'crypto';

/**
 * Generates a cryptographically secure random tournament token.
 *
 * Uses Node.js crypto.randomBytes() which sources randomness from
 * the operating system's CSPRNG (Cryptographically Secure Pseudo-Random
 * Number Generator), making tokens unpredictable and safe for
 * authentication purposes.
 *
 * The token is 32 hexadecimal characters (16 bytes of randomness),
 * providing 128 bits of entropy. This is sufficient to prevent
 * brute-force attacks within the token's validity window.
 *
 * @returns A 32-character hexadecimal string token
 *
 * @example
 *   const token = generateTournamentToken();
 *   // Returns something like: "a1b2c3d4e5f6789012345678abcdef00"
 */
export function generateTournamentToken(): string {
  // Generate 16 random bytes (128 bits of entropy).
  // Converting to hex doubles the string length: 16 bytes -> 32 hex chars.
  // 128 bits of entropy means 2^128 possible tokens, making brute-force
  // attacks computationally infeasible within any reasonable timeframe.
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Validates that a token string matches the expected format.
 *
 * Checks that the token is exactly 32 hexadecimal characters.
 * This is a format-only check and does NOT verify the token against
 * the database or check expiration.
 *
 * Used as a quick pre-validation before database lookup to reject
 * obviously invalid tokens early and reduce database queries.
 *
 * @param token - The token string to validate
 * @returns true if the token matches the expected 32-char hex format
 *
 * @example
 *   isValidTokenFormat("a1b2c3d4e5f6789012345678abcdef00") // true
 *   isValidTokenFormat("short")                             // false
 *   isValidTokenFormat("not-hex-characters-here-abcdefgh!") // false
 */
export function isValidTokenFormat(token: string): boolean {
  // Regex checks for exactly 32 hexadecimal characters (0-9, a-f, A-F).
  // The ^ and $ anchors ensure the entire string matches.
  // Case-insensitive matching is not needed because tokens are generated
  // as lowercase hex, but we accept uppercase for user convenience.
  return /^[0-9a-fA-F]{32}$/.test(token);
}

/**
 * Validates a token's format AND checks that it has not expired.
 *
 * This is the primary validation function used when processing
 * participant score entry requests. It combines format validation
 * with expiration checking in a single call.
 *
 * @param token - The token string to validate
 * @param expiresAt - The token's expiration date (from database)
 * @returns true if the token format is valid AND it has not expired
 *
 * @example
 *   const tournament = await prisma.tournament.findUnique({ where: { id } });
 *   if (!isTokenValid(submittedToken, tournament.tokenExpiresAt)) {
 *     return handleAuthError('Invalid or expired token');
 *   }
 */
export function isTokenValid(token: string, expiresAt: Date | null): boolean {
  // First check format to reject obviously invalid tokens early
  if (!isValidTokenFormat(token)) {
    return false;
  }

  // If no expiration date is set, the token is considered invalid.
  // All tokens should have an expiration for security purposes.
  if (!expiresAt) {
    return false;
  }

  // Check if the current time is before the expiration.
  // Date comparison uses getTime() for precise millisecond comparison.
  const now = new Date();
  return now.getTime() < expiresAt.getTime();
}

/**
 * Calculates a token expiry date from the current time.
 *
 * Default expiry is 24 hours, which covers a full tournament day.
 * Shorter durations can be used for tighter security during
 * specific tournament phases.
 *
 * @param hours - Number of hours until expiry (default: 24)
 * @returns A Date object representing the expiry time
 *
 * @example
 *   const expiry = getTokenExpiry();      // 24 hours from now
 *   const short = getTokenExpiry(4);      // 4 hours from now
 *   const week = getTokenExpiry(24 * 7);  // 1 week from now
 */
export function getTokenExpiry(hours: number = 24): Date {
  const expiry = new Date();
  // Add the specified number of hours in milliseconds.
  // Using setTime ensures precise calculation without timezone issues.
  expiry.setTime(expiry.getTime() + hours * 60 * 60 * 1000);
  return expiry;
}

/**
 * Extends a token's expiry from its current expiration date.
 *
 * If the token has already expired, the extension is calculated
 * from the current time instead (to avoid setting an expiry in the past).
 *
 * This is used when admins want to extend a tournament session
 * without regenerating the token (which would require participants
 * to re-enter the new token).
 *
 * @param currentExpiresAt - The token's current expiration date
 * @param hours - Number of hours to extend by (default: 24)
 * @returns A new Date object representing the extended expiry time
 *
 * @example
 *   // Token expiring in 2 hours, extend by 24 more hours
 *   const newExpiry = extendTokenExpiry(tournament.tokenExpiresAt, 24);
 */
export function extendTokenExpiry(
  currentExpiresAt: Date | null,
  hours: number = 24
): Date {
  // Determine the base date for the extension.
  // If the token has already expired or has no expiry, use current time.
  // Otherwise, extend from the existing expiry date.
  const now = new Date();
  const baseDate =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? new Date(currentExpiresAt.getTime())
      : new Date();

  // Add the extension hours to the base date
  baseDate.setTime(baseDate.getTime() + hours * 60 * 60 * 1000);
  return baseDate;
}

/**
 * Calculates and formats the remaining time until a token expires.
 *
 * Returns a human-readable string suitable for display in the UI.
 * Used on the tournament admin page to show token status.
 *
 * @param expiresAt - The token's expiration date
 * @returns A human-readable string describing the remaining time
 *
 * @example
 *   getTokenTimeRemaining(futureDate)   // "2 hours 30 minutes remaining"
 *   getTokenTimeRemaining(pastDate)     // "Expired"
 *   getTokenTimeRemaining(null)         // "No expiry set"
 */
export function getTokenTimeRemaining(expiresAt: Date | null): string {
  // Handle case where no expiry is configured
  if (!expiresAt) {
    return 'No expiry set';
  }

  const now = new Date();
  const remainingMs = expiresAt.getTime() - now.getTime();

  // Token has already expired
  if (remainingMs <= 0) {
    return 'Expired';
  }

  // Convert milliseconds to hours and minutes for readable output.
  // Using Math.floor for hours and rounding for minutes gives
  // the most intuitive display (e.g., "2 hours 30 minutes").
  const totalMinutes = Math.floor(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Build the human-readable string with appropriate pluralization
  if (hours > 0 && minutes > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
  } else {
    // Less than 1 minute remaining
    return 'Less than 1 minute remaining';
  }
}
