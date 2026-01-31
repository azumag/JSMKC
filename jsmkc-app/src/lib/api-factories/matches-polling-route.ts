/**
 * Matches Polling Route Factory
 *
 * Generates a GET handler for token-authenticated match polling endpoints.
 * Used by participant-facing pages to poll for match status updates
 * without requiring OAuth session authentication.
 *
 * This eliminates duplicated code across BM, MR, and GP matches routes
 * while preserving identical API response shapes for each event type.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { paginate } from '@/lib/pagination';
import { createLogger } from '@/lib/logger';

export interface MatchesPollingConfig {
  matchModel: string;
  loggerName: string;
  errorMessage: string;
}

export function createMatchesPollingHandlers(config: MatchesPollingConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchModel = (p: any) => p[config.matchModel];

  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const logger = createLogger(config.loggerName);
    const { id: tournamentId } = await params;

    try {
      const { searchParams } = new URL(request.url);
      const token = searchParams.get('token');
      const page = Number(searchParams.get('page')) || 1;
      const limit = Number(searchParams.get('limit')) || 50;

      if (!token) {
        return NextResponse.json(
          { error: 'Token required' },
          { status: 401 }
        );
      }

      const tokenValidation = await prisma.tournament.findFirst({
        where: {
          id: tournamentId,
          token,
          tokenExpiresAt: { gt: new Date() },
        },
      });

      if (!tokenValidation) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      const model = matchModel(prisma);
      const result = await paginate(
        {
          findMany: model.findMany.bind(model),
          count: model.count.bind(model),
        },
        { tournamentId },
        { matchNumber: 'asc' },
        { page, limit }
      );

      return NextResponse.json(result);
    } catch (error) {
      logger.error(config.errorMessage, { error, tournamentId });
      return NextResponse.json(
        { error: config.errorMessage },
        { status: 500 }
      );
    }
  }

  return { GET };
}
