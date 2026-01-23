import { NextRequest, NextResponse } from 'next/server';

import { isTokenValid, isValidTokenFormat } from '@/lib/token-utils';
import { getClientIdentifier, getUserAgent } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';

import prisma from '@/lib/prisma';

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
}

export interface TournamentValidationResult {
  valid: boolean;
  error?: string;
  tournament?: {
    id: string;
    name: string;
  };
}

export function validateToken(token: string | null): TokenValidationResult {
  if (token === null || token === undefined) {
    return { valid: false, error: 'Token is required' };
  }

  if (token === '') {
    return { valid: false, error: 'Token is required' };
  }

  const validCharacters = /^[a-zA-Z0-9._-]+$/;
  if (!validCharacters.test(token)) {
    return { valid: false, error: 'Invalid token format' };
  }

  if (token === '....') {
    return { valid: false, error: 'Invalid token format' };
  }

  return { valid: true };
}

export function getAccessTokenExpiry(isRefresh: boolean = false): number {
  const hours = isRefresh ? 168 : 24;
  return Date.now() + hours * 60 * 60 * 1000;
}

/**
 * Validate tournament token from request
 * Returns tournament data if valid, null otherwise
 */
export async function validateTournamentToken(
  request: NextRequest,
  tournamentId: string
): Promise<TournamentValidationResult> {
  const clientIp = getClientIdentifier(request);
  const userAgent = getUserAgent(request);

  const token = request.nextUrl.searchParams.get('token') ||
                request.headers.get('x-tournament-token');

  if (!token) {
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, null, 'MISSING_TOKEN');
    return { valid: false, error: 'Token required' };
  }

  if (!isValidTokenFormat(token)) {
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'INVALID_FORMAT');
    return { valid: false, error: 'Invalid token format' };
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        token: true,
        tokenExpiresAt: true,
        status: true,
        date: true,
      },
    });

    if (!tournament) {
      await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'TOURNAMENT_NOT_FOUND');
      return { valid: false, error: 'Tournament not found' };
    }

    if (!isTokenValid(tournament.token, tournament.tokenExpiresAt)) {
      const reason = !tournament.token ? 'NO_TOKEN' :
                     new Date() > (tournament.tokenExpiresAt || new Date()) ? 'EXPIRED' :
                     'INVALID';
      await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, reason);
      return { valid: false, error: 'Token invalid or expired' };
    }

    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'SUCCESS');

    return {
      valid: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
      },
    };

  } catch (error) {
    const log = createLogger('token-validation')
    log.error('Token validation error', error instanceof Error ? { message: error.message, stack: error.stack } : { error });
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'SERVER_ERROR');
    return { valid: false, error: 'Validation failed' };
  }
}

export interface TournamentContext extends Record<string, unknown> {
  tournament: { id: string; name: string };
  params: Promise<Record<string, string>>;
}

/**
 * Create middleware that requires valid tournament token
 */
export function requireTournamentToken(handler: (request: NextRequest, context: TournamentContext) => Promise<NextResponse>) {
  return async (request: NextRequest, context: TournamentContext) => {
    const { id: tournamentId } = await context.params;

    const validation = await validateTournamentToken(request, tournamentId);

    if (!validation.valid || !validation.tournament) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 401 }
      );
    }

    context.tournament = validation.tournament;

    return handler(request, context);
  };
}

/**
 * Log token validation attempts for security monitoring
 */
async function logTokenValidationAttempt(
  ipAddress: string,
  userAgent: string,
  tournamentId: string,
  token: string | null,
  result: 'SUCCESS' | 'MISSING_TOKEN' | 'INVALID_FORMAT' | 'TOURNAMENT_NOT_FOUND' | 'EXPIRED' | 'INVALID' | 'NO_TOKEN' | 'SERVER_ERROR'
) {
  try {
    await createAuditLog({
      ipAddress,
      userAgent,
      action: 'TOKEN_VALIDATION',
      targetId: tournamentId,
      targetType: 'Tournament',
      details: {
        tokenPresent: !!token,
        tokenFormat: token ? (token.length === 32 ? 'valid_length' : 'invalid_length') : null,
        result,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const log = createLogger('token-validation')
    log.error('Failed to log token validation', error instanceof Error ? { message: error.message, stack: error.stack } : { error });
  }
}