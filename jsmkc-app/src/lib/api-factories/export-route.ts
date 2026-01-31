import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createCSV } from '@/lib/excel';
import { createLogger } from '@/lib/logger';

export interface ExportConfig {
  loggerName: string;
  qualificationModel: string;
  matchModel: string;
  eventCode: string;
  qualificationHeaders: string[];
  qualificationRowMapper: (q: any, index: number) => string[];
  matchHeaders: string[];
  matchRowMapper: (m: any) => string[];
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
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
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
      return NextResponse.json({ error: 'Failed to export tournament' }, { status: 500 });
    }
  }

  return { GET };
}
