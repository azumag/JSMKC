import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createCSV } from '@/lib/excel';
import { createLogger } from '@/lib/logger';

interface ExportPlayer {
  name: string;
  nickname: string;
}

export interface ExportQualification {
  player: ExportPlayer;
  [key: string]: unknown;
}

export interface ExportMatch {
  matchNumber: number;
  stage: string;
  player1: ExportPlayer;
  player2: ExportPlayer;
  completed: boolean;
  cup?: string;
  [key: string]: unknown;
}

export interface ExportConfig {
  loggerName: string;
  qualificationModel: string;
  matchModel: string;
  eventCode: string;
  qualificationHeaders: string[];
  qualificationRowMapper: (q: ExportQualification, index: number) => string[];
  matchHeaders: string[];
  matchRowMapper: (m: ExportMatch) => string[];
  /** Custom orderBy for qualification query. Defaults to [{ score: 'desc' }, { points: 'desc' }].
   *  GP should use [{ points: 'desc' }, { score: 'desc' }] per requirements.md Section 4.1. */
  qualificationOrderBy?: Record<string, string>[];
}

export function createExportHandlers(config: ExportConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchModel = (p: any) => p[config.matchModel];

  async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const logger = createLogger(config.loggerName);
    const { id: tournamentId } = await params;

    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { name: true, date: true },
      });

      if (!tournament) {
        return NextResponse.json({ success: false, error: 'Tournament not found' }, { status: 404 });
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: config.qualificationOrderBy ?? [{ score: 'desc' }, { points: 'desc' }],
      });

      const matches = await matchModel(prisma).findMany({
        where: { tournamentId },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      const bom = '\uFEFF';
      let csvContent = bom;

      const qualificationData = qualifications.map(config.qualificationRowMapper);
      csvContent += 'QUALIFICATIONS\n';
      csvContent += createCSV(config.qualificationHeaders, qualificationData);

      const matchData = matches.map(config.matchRowMapper);
      csvContent += '\nMATCHES\n';
      csvContent += createCSV(config.matchHeaders, matchData);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const csvFilename = `${tournament.name}_${config.eventCode}_${timestamp}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${csvFilename}"`,
        },
      });
    } catch (error) {
      logger.error('Failed to export tournament', { error, tournamentId });
      return NextResponse.json({ success: false, error: 'Failed to export tournament' }, { status: 500 });
    }
  }

  return { GET };
}
