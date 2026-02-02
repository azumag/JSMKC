/**
 * @module __tests__/lib/api-factories/export-route.test.ts
 *
 * Tests for the export route factory (export-route.ts).
 *
 * Covers:
 * - Tournament existence check (404 when not found)
 * - CSV response with correct Content-Type header
 * - Content-Disposition header with dynamic filename
 * - UTF-8 BOM prefix in CSV content
 * - qualificationRowMapper and matchRowMapper callback invocations
 * - createCSV called twice (qualifications section + matches section)
 * - Database error handling (500)
 *
 * Note: This is a public endpoint — no auth mock is needed.
 */

jest.mock('@/lib/excel', () => ({ createCSV: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

/**
 * Override the default next/server mock to support both NextResponse.json()
 * and new NextResponse(body, init) constructor. The export route uses the
 * constructor form for CSV responses (not .json()), which the global mock
 * in jest.setup.js doesn't support.
 */
jest.mock('next/server', () => {
  class MockNextResponse extends Response {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static json(body: unknown, init?: any) {
      const status = init?.status || 200;
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return {
    NextResponse: MockNextResponse,
    NextRequest: class {
      url: string;
      headers: Headers;
      method: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(url: string, init?: any) {
        this.url = url;
        this.headers = new Headers(init?.headers);
        this.method = init?.method || 'GET';
      }
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import { createCSV } from '@/lib/excel';
import { createExportHandlers } from '@/lib/api-factories/export-route';

/** Factory for creating test config with mock row mappers */
const createMockConfig = (overrides = {}) => ({
  loggerName: 'test-export-api',
  qualificationModel: 'bMQualification',
  matchModel: 'bMMatch',
  eventCode: 'BM',
  qualificationHeaders: ['Rank', 'Player', 'Score'],
  qualificationRowMapper: jest.fn((q: { player: { name: string }; score: number }, index: number) => [
    String(index + 1), q.player.name, String(q.score),
  ]),
  matchHeaders: ['Match #', 'Player 1', 'Player 2'],
  matchRowMapper: jest.fn((m: { matchNumber: number; player1: { name: string }; player2: { name: string } }) => [
    String(m.matchNumber), m.player1.name, m.player2.name,
  ]),
  ...overrides,
});

/** Mock tournament data */
const mockTournament = { name: 'TestTournament', date: new Date('2024-06-15') };

/** Mock qualification records */
const mockQualifications = [
  { id: 'q1', player: { name: 'Player 1', nickname: 'P1' }, score: 100 },
  { id: 'q2', player: { name: 'Player 2', nickname: 'P2' }, score: 80 },
];

/** Mock match records */
const mockMatches = [
  { matchNumber: 1, stage: 'qualification', player1: { name: 'Player 1' }, player2: { name: 'Player 2' }, completed: true },
];

describe('Export Route Factory', () => {
  const config = createMockConfig();
  const { GET } = createExportHandlers(config);

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: createCSV returns header + rows as CSV string
    (createCSV as jest.Mock).mockReturnValue('header1,header2\nval1,val2\n');
  });

  // Not found: Returns 404 when tournament does not exist
  it('should return 404 when tournament does not exist', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Tournament not found');
  });

  // Headers: Response has Content-Type: text/csv
  it('should return response with Content-Type text/csv', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  // Headers: Content-Disposition includes tournament name and event code
  it('should include Content-Disposition header with correct filename format', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    const disposition = response.headers.get('Content-Disposition') || '';
    // Filename format: TestTournament_BM_<timestamp>.csv
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('TestTournament_BM_');
    expect(disposition).toContain('.csv');
  });

  // BOM: CSV content starts with UTF-8 BOM bytes (EF BB BF)
  it('should start CSV content with UTF-8 BOM', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    // Read raw bytes to check BOM (TextDecoder strips BOM during .text())
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM is 3 bytes: 0xEF, 0xBB, 0xBF
    expect(bytes[0]).toBe(0xEF);
    expect(bytes[1]).toBe(0xBB);
    expect(bytes[2]).toBe(0xBF);
  });

  // Callback: qualificationRowMapper is called for each qualification
  it('should call qualificationRowMapper for each qualification record', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    await GET(request, { params });

    expect(config.qualificationRowMapper).toHaveBeenCalledTimes(2);
    // Array.map passes (element, index, array) — verify element and index
    expect(config.qualificationRowMapper).toHaveBeenCalledWith(
      mockQualifications[0], 0, expect.any(Array),
    );
    expect(config.qualificationRowMapper).toHaveBeenCalledWith(
      mockQualifications[1], 1, expect.any(Array),
    );
  });

  // Callback: matchRowMapper is called for each match
  it('should call matchRowMapper for each match record', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    await GET(request, { params });

    expect(config.matchRowMapper).toHaveBeenCalledTimes(1);
    // Array.map passes (element, index, array) — verify element
    expect(config.matchRowMapper).toHaveBeenCalledWith(
      mockMatches[0], 0, expect.any(Array),
    );
  });

  // CSV gen: createCSV is called twice (once for qualifications, once for matches)
  it('should call createCSV twice for qualifications and matches sections', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    await GET(request, { params });

    expect(createCSV).toHaveBeenCalledTimes(2);
    // First call: qualification headers + mapped data
    expect(createCSV).toHaveBeenCalledWith(
      ['Rank', 'Player', 'Score'],
      expect.any(Array),
    );
    // Second call: match headers + mapped data
    expect(createCSV).toHaveBeenCalledWith(
      ['Match #', 'Player 1', 'Player 2'],
      expect.any(Array),
    );
  });

  // Error: Returns 500 on database failure
  it('should return 500 and log error on database failure', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

    const request = new Request('http://localhost:3000/api/tournaments/t1/bm/export');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to export tournament');
  });
});
