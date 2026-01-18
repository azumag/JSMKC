import crypto from 'crypto';

/**
 * Generate a secure 32-character hex token for tournament access
 * Uses crypto.randomBytes for cryptographic security
 */
export function generateTournamentToken(): string {
  return crypto.randomBytes(16).toString('hex'); // 16 bytes = 32 hex characters
}

/**
 * Validate if a token format is correct (32-character hex string)
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[a-f0-9]{32}$/i.test(token);
}

/**
 * Check if a tournament token is valid and not expired
 */
export function isTokenValid(token: string | null | undefined, expiresAt: Date | null | undefined): boolean {
  // Token must exist and have correct format
  if (!token || !isValidTokenFormat(token)) {
    return false;
  }
  
  // Token must not be expired
  if (!expiresAt || new Date() > expiresAt) {
    return false;
  }
  
  return true;
}

/**
 * Get token expiry time (default 24 hours from now)
 */
export function getTokenExpiry(hours: number = 24): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * Extend token expiry by specified hours
 */
export function extendTokenExpiry(currentExpiresAt: Date | null, hours: number = 24): Date {
  const baseTime = currentExpiresAt && new Date() < currentExpiresAt 
    ? currentExpiresAt.getTime() 
    : Date.now();
  return new Date(baseTime + hours * 60 * 60 * 1000);
}

/**
 * Get time remaining until token expires
 */
export function getTokenTimeRemaining(expiresAt: Date | null): string {
  if (!expiresAt) {
    return 'No expiry set';
  }
  
  const now = new Date();
  if (now >= expiresAt) {
    return 'Expired';
  }
  
  const diff = expiresAt.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ${hours % 24}h remaining`;
  }
  
  return `${hours}h ${minutes}m remaining`;
}