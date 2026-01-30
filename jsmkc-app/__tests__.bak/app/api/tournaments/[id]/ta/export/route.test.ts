// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';



jest.mock('@/lib/excel', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createCSV: jest.fn((headers, _data) => 'mock,csv,content'),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formatTime: jest.fn((ms) => '1:23.456'),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import * as taExportRoute from '@/app/api/tournaments/[id]/ta/export/route';

const excelMock = jest.requireMock('@/lib/excel') as {
  createCSV: jest.Mock;
  formatTime: jest.Mock;
};

describe('GET /api/tournaments/[id]/ta/export', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should export TA entries as CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-01'),
      };

      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          rank: 1,
          totalTime: 83456,
          lives: 1,
          eliminated: false,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
        {
          id: 'entry2',
          tournamentId: 't1',
          rank: 2,
          totalTime: 91234,
          lives: 2,
          eliminated: false,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'player2',
          },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      excelMock.createCSV.mockReturnValue('mock,csv,content');
      excelMock.formatTime.mockReturnValue('1:23.456');

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { name: true, date: true },
      });

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: { rank: 'asc' },
      });

      expect(excelMock.createCSV).toHaveBeenCalledWith(
        [
          'Rank',
          'Player Name',
          'Nickname',
          'Total Time (ms)',
          'Total Time',
          'Lives',
          'Eliminated',
        ],
        expect.arrayContaining([
          expect.arrayContaining([
            '1',
            'Player 1',
            'player1',
            '83456',
            '1:23.456',
            '1',
            'No',
          ]),
        ])
      );

      expect(NextResponse.json).not.toHaveBeenCalled();
      const responseCall = (NextResponse.constructor as jest.Mock).mock.calls[0];
      expect(responseCall[0]).toBe('mock,csv,content');
      expect(responseCall[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': expect.stringContaining('Test Tournament 2024_TA_'),
          }),
        })
      );
    });

    it('should handle tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    });

    it('should handle empty entries', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Empty Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      excelMock.createCSV.mockReturnValue('mock,csv,empty');

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(excelMock.createCSV).toHaveBeenCalledWith(
        expect.arrayContaining(['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Lives', 'Eliminated']),
        [[]]
      );

      const responseCall = (NextResponse.constructor as jest.Mock).mock.calls[0];
      expect(responseCall[0]).toBe('mock,csv,empty');
      expect(responseCall[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': expect.stringContaining('Empty_TA_'),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database error');
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(mockError);

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      const logger = createLogger('ta-export-test');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to export tournament',
        { error: mockError, tournamentId: 't1' }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to export tournament' },
        { status: 500 }
      );
    });
  });
});
