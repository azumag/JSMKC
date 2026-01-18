import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isTokenValid, isValidTokenFormat } from '@/lib/token-utils';
import { createAuditLog } from '@/lib/audit-log';
import { getClientIdentifier, getUserAgent } from '@/lib/rate-limit';

/**
 * Validate tournament token from request
 * Returns tournament data if valid, null otherwise
 */
export async function validateTournamentToken(
  request: NextRequest,
  tournamentId: string
): Promise<{ tournament: { id: string; name: string; token: string | null; tokenExpiresAt: Date | null; status: string; date: Date } | null; error?: string }> {
  const clientIp = getClientIdentifier(request);
  const userAgent = getUserAgent(request);
  
  // Extract token from query parameter or header
  const token = request.nextUrl.searchParams.get('token') || 
                request.headers.get('x-tournament-token');
  
  if (!token) {
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, null, 'MISSING_TOKEN');
    return { tournament: null, error: 'Token required' };
  }
  
  if (!isValidTokenFormat(token)) {
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'INVALID_FORMAT');
    return { tournament: null, error: 'Invalid token format' };
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
      return { tournament: null, error: 'Tournament not found' };
    }
    
    if (!isTokenValid(tournament.token, tournament.tokenExpiresAt)) {
      const reason = !tournament.token ? 'NO_TOKEN' : 
                     new Date() > (tournament.tokenExpiresAt || new Date()) ? 'EXPIRED' : 
                     'INVALID';
      await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, reason);
      return { tournament: null, error: 'Token invalid or expired' };
    }
    
    // Log successful validation
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'SUCCESS');
    
    return { tournament };
    
  } catch (error) {
    console.error('Token validation error:', error);
    await logTokenValidationAttempt(clientIp, userAgent, tournamentId, token, 'SERVER_ERROR');
    return { tournament: null, error: 'Validation failed' };
  }
}

interface TournamentContext {
  tournament: { id: string; name: string; token: string | null; tokenExpiresAt: Date | null; status: string; date: Date };
  params: Promise<Record<string, string>>;
}

/**
 * Create middleware that requires valid tournament token
 */
export function requireTournamentToken(handler: (request: NextRequest, context: TournamentContext) => Promise<NextResponse>) {
  return async (request: NextRequest, context: TournamentContext) => {
    const { id: tournamentId } = await context.params;
    
    const validation = await validateTournamentToken(request, tournamentId);
    
    if (!validation.tournament) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 401 }
      );
    }
    
    // Add tournament to context for handler
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
    console.error('Failed to log token validation:', error);
  }
}