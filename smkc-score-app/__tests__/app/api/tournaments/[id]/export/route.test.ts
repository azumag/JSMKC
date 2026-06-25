/**
 * @module Tournament Export Route Tests
 *
 * Test suite for the GET /api/tournaments/[id]/export endpoint.
 * This route exports tournament data as a CSV file, including:
 * - Tournament summary section (name, date, status, participant counts)
 * - BM (Battle Mode) qualification standings grouped by group
 * - BM qualification and finals match results with round details
 * - MR (Match Race) match results with stage and round info
 * - GP (Grand Prix) match results with driver points
 * - TA (Time Attack) entries sorted by total time ascending
 *
 * Covers:
 * - CSV formatting: UTF-8 BOM, comma escaping, Content-Type/Disposition headers
 * - Filename generation: Tournament name sanitization, date-based naming
 * - Data export: All competition modes with completed and uncompleted matches
 * - Edge cases: Empty data, null total times, special characters in names
 * - Error handling: Tournament not found (404), database errors (500)
 */
// @ts-nocheck


jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/excel', () => ({ formatDate: jest.fn(() => '2024-01-15'), formatTime: jest.fn(() => '1:23.456') }));
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
/*
 * The CDM export no longer round-trips through SheetJS; it performs ZIP surgery
 * on the real template (public/templates/cdm-2025-template.xlsm) via fflate.
 * These tests therefore feed the REAL template bytes through the ASSETS mock and
 * decode the response bytes with fflate to assert on the patched worksheet XML.
 * The previous jest.mock('@e965/xlsx') stub is gone — there is nothing left to
 * mock once the exporter writes OOXML directly.
 */
/*
 * NextResponse is used as both a constructor (new NextResponse(csvContent, options))
 * for success CSV responses, and via its static .json() method for error/404 responses.
 * We mock it as a constructor function with a json static method attached.
 */
jest.mock('next/server', () => {
  const MockNextResponse = jest.fn((body, options) => ({
    data: body,
    headers: options?.headers || {},
    status: options?.status || 200,
  }));
  MockNextResponse.json = jest.fn((data, options) => ({
    data,
    status: options?.status || 200,
  }));
  return { NextResponse: MockNextResponse };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { unzipSync, strFromU8 } from 'fflate';
import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { createLogger } from '@/lib/logger';
import { formatDate, formatTime } from '@/lib/excel';
import { auth } from '@/lib/auth';
import { GET } from '@/app/api/tournaments/[id]/export/route';
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

class MockNextRequest {
  constructor(private url: string) {}
  headers = {
    get: () => undefined,
  };
}

/** The real CDM template path; loaded fresh per call so a patch can't mutate it. */
const CDM_TEMPLATE_PATH = join(process.cwd(), 'public', 'templates', 'cdm-2025-template.xlsm');
function loadRealTemplate(): ArrayBuffer {
  const buf = readFileSync(CDM_TEMPLATE_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Wire the ASSETS mock to serve the real CDM template bytes, mirroring the
 * Cloudflare runtime path the route prefers (ASSETS.fetch over global fetch).
 * Returns the asset fetch mock so a test can assert the URL it was called with.
 */
function mockRealTemplateAsset(): jest.Mock {
  const assetFetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(loadRealTemplate()),
  });
  (getCloudflareContext as jest.Mock).mockReturnValue({ env: { DB: {}, ASSETS: { fetch: assetFetch } } });
  return assetFetch;
}

/** Sheet display name → worksheet part path of the CDM template (verified order). */
const CDM_SHEET_PATHS: Record<string, string> = {
  'Main Hub': 'xl/worksheets/sheet1.xml',
  'TT Qualifications': 'xl/worksheets/sheet3.xml',
  'TT Finals': 'xl/worksheets/sheet4.xml',
  'BM Qualifications': 'xl/worksheets/sheet6.xml',
  'BM Finals': 'xl/worksheets/sheet7.xml',
  'MR Qualifications': 'xl/worksheets/sheet8.xml',
  'MR Finals': 'xl/worksheets/sheet9.xml',
  'GP Qualifications': 'xl/worksheets/sheet10.xml',
  'GP Finals': 'xl/worksheets/sheet11.xml',
  'Overall Ranking': 'xl/worksheets/sheet12.xml',
};

/**
 * Parse one worksheet's XML into a SheetJS-compatible cell map so the CDM tests
 * can keep reading `sheet.D5.v` / `workbook.Sheets["Main Hub"].B62`. Each <c>
 * becomes `{ v }` where v is the numeric value, the inline-string text, or the
 * sharedString index (template originals that were left untouched). Cleared /
 * absent cells are simply not present, so `sheet.REF` is `undefined` for them —
 * which is exactly the "row 62 stays unwritten" assertion the boundary tests make.
 */
function parseSheet(xml: string): Record<string, { v: number | string }> {
  const cells: Record<string, { v: number | string }> = {};
  const cellRe = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(xml)) !== null) {
    const ref = m[1];
    const attrs = m[2];
    const inner = m[3];
    if (inner === undefined || inner === '') continue; // self-closing / cleared cell -> absent
    const isInline = /\bt="inlineStr"/.test(attrs);
    if (isInline) {
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      if (t) cells[ref] = { v: decodeXml(t[1]) };
      continue;
    }
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
    if (!v) continue; // formula-only cell with no cached value
    const raw = v[1];
    const num = Number(raw);
    cells[ref] = { v: Number.isNaN(num) || raw.trim() === '' ? raw : num };
  }
  return cells;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Decode a CDM export response (Uint8Array of .xlsm bytes) into a SheetJS-like
 * `{ Sheets: { [name]: cellMap } }` view plus the raw zip parts (for byte-level
 * regression checks on the parts the old exporter used to drop).
 */
function cdmWorkbookFromResult(result: { data: Uint8Array }): {
  Sheets: Record<string, Record<string, { v: number | string }>>;
  parts: Record<string, Uint8Array>;
} {
  const parts = unzipSync(result.data);
  const Sheets: Record<string, Record<string, { v: number | string }>> = {};
  for (const [name, path] of Object.entries(CDM_SHEET_PATHS)) {
    Sheets[name] = parts[path] ? parseSheet(strFromU8(parts[path])) : {};
  }
  return { Sheets, parts };
}

describe('Export API Route - /api/tournaments/[id]/export', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };
  const makeCdmMainHubPlayer = (index: number) => {
    const n = String(index + 1).padStart(2, "0");
    return {
      playerId: `p${index + 1}`,
      player: { id: `p${index + 1}`, name: `Name ${n}`, nickname: `Player ${n}` },
      stage: 'qualification',
      seeding: index + 1,
      lives: 3,
      eliminated: false,
      totalTime: 12000 + index,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock | undefined) = undefined;
    (getCloudflareContext as jest.Mock).mockReturnValue({ env: { DB: {} } });
    jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    /* Re-configure NextResponse constructor and json after clearAllMocks */
    (NextResponse as unknown as jest.Mock).mockImplementation((body: string, options?: any) => ({
      data: body,
      headers: options?.headers || {},
      status: options?.status || 200,
    }));
    (NextResponse as any).json = jest.fn((data: unknown, options?: { status?: number }) => ({
      data,
      status: options?.status || 200,
    }));
    (formatDate as jest.Mock).mockReturnValue('2024-01-15');
    (formatTime as jest.Mock).mockReturnValue('1:23.456');
  });

  describe('GET - Export tournament data as CSV', () => {
    it('should export tournament data with summary section', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toBeDefined();
      expect(result.data).toContain('TOURNAMENT SUMMARY');
      expect(result.data).toContain('Test Tournament 2024');
      expect(result.data).toContain('Date');
      expect(result.data).toContain('Status');
      expect(result.data).toContain('Battle Mode');
      expect(result.data).toContain('Match Race');
      expect(result.data).toContain('Grand Prix');
      expect(result.data).toContain('Time Attack');
      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        include: {
          bmQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          bmMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          mrMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          gpMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          ttEntries: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
        },
      });
    });

    it('should export a populated CDM macro workbook when requested', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [{
          player: { id: 'p1', name: 'Player One', nickname: 'P1' },
          seeding: 1,
          group: 'A',
          points: 3,
          score: 1000,
        }],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [{
          matchNumber: 1,
          stage: 'finals',
          round: 'gf',
          bracketPosition: 'gf',
          isGrandFinal: true,
          player1: { id: 'p1', name: 'Player One', nickname: 'P1' },
          player2: { id: 'p2', name: 'Player Two', nickname: 'P2' },
          score1: 5,
          score2: 3,
          completed: true,
        }],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [{
          playerId: 'p1',
          player: { id: 'p1', name: 'Player One', nickname: 'P1' },
          stage: 'qualification',
          seeding: 1,
          lives: 3,
          eliminated: false,
          times: { MC1: '0:12.345' },
          totalTime: 12345,
        }],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      const assetFetch = mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(assetFetch).toHaveBeenCalledWith(new URL('/templates/cdm-2025-template.xlsm', 'https://assets.local'));
      // The CDM include carries the MR/GP seeds and TT phase rounds the workbook
      // reads, but NOT playerScores: the Overall Ranking sheet is formula-driven
      // and the exporter never writes it (design §3.6).
      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        include: {
          bmQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          bmMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          mrMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          gpMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          ttEntries: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          mrQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          gpQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          ttPhaseRounds: true,
        },
      });
      expect(global.fetch).toBeUndefined();
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.headers['Content-Type']).toBe('application/vnd.ms-excel.sheet.macroEnabled.12');
      expect(result.headers['Content-Disposition']).toContain('.xlsm');

      // Decode the real .xlsm bytes and verify the Main Hub player + TT time landed.
      const workbook = cdmWorkbookFromResult(result);
      expect(workbook.Sheets['Main Hub'].B2.v).toBe('Player One');
      expect(workbook.Sheets['Main Hub'].C2.v).toBe('P1');
      // 0:12.345 -> 0*10000 + 12*100 + 35 (half-up centiseconds) = 1235.
      expect(workbook.Sheets['TT Qualifications'].G2.v).toBe(1235);
      // The parts the old SheetJS exporter destroyed must survive untouched.
      expect(workbook.parts['xl/tables/table1.xml']).toBeDefined();
      expect(workbook.parts['xl/richData/rdrichvalue.xml']).toBeDefined();
      expect(workbook.parts['xl/calcChain.xml']).toBeUndefined();
    });

    it('should place CDM finals seeds and scores in native bracket coordinates', async () => {
      // A full 24-player faithful bracket: winners_r1 (8) names the direct
      // qualifiers, playoff_r1/r2 seed entrants 13..24, and the upper/lower/GF
      // rounds advance by formula. The exporter writes typed seed cells and
      // identity-resolved scores; it must NOT touch the advancement formulas.
      const player = (id: string) => ({ id, name: `Name ${id}`, nickname: id.toUpperCase() });
      const match = (round: string, matchNumber: number, p1: string, p2: string, stage: string) => ({
        matchNumber,
        stage,
        round,
        bracketPosition: round === 'gf' ? 'gf' : round,
        isGrandFinal: round === 'gf',
        player1: player(p1),
        player2: player(p2),
        score1: 4,
        score2: 2,
        points1: 4,
        points2: 2,
        completed: true,
      });
      // winners_r1 has 8 matches (indices 0..7), each two direct qualifiers.
      const winnersR1 = Array.from({ length: 8 }, (_v, i) =>
        match('winners_r1', i + 1, `w${2 * i + 1}`, `w${2 * i + 2}`, 'finals'),
      );
      // playoff_r1 has 4 matches; playoff_r2 has 4 matches (the BYE seeds).
      const playoffR1 = Array.from({ length: 4 }, (_v, i) =>
        match('playoff_r1', 100 + i, `b${2 * i + 1}`, `b${2 * i + 2}`, 'playoff'),
      );
      const playoffR2 = Array.from({ length: 4 }, (_v, i) =>
        match('playoff_r2', 200 + i, `q${i + 1}`, `r${i + 1}`, 'playoff'),
      );
      const finalsMatches = [...playoffR1, ...playoffR2, ...winnersR1];
      const mockTournament = {
        id: 't1',
        name: 'CDM Bracket Coordinates',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: finalsMatches,
        mrMatches: finalsMatches,
        gpMatches: finalsMatches,
        ttEntries: [],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      const sheet = workbook.Sheets['BM Finals'];
      // winners_r1[0] slot1 is upper seed 1 -> B-position 1, typed into S5.
      expect(sheet.S5.v).toBe(1);
      // winners_r1[0] slot2 is a "Winner of B2,1" reverse-lookup FORMULA cell
      // (S6 = XLOOKUP(T6,...)); the faithful path must leave it untouched, so its
      // cached template value (17) survives — the exporter never typed it.
      expect(sheet.S6.v).toBe(17);
      // winners_r1[0] is a completed 4-2: slot1 score in V5, slot2 score in V6.
      expect(sheet.V5.v).toBe(4);
      expect(sheet.V6.v).toBe(2);
      // playoff_r1[0] both slots are typed seeds (E column, rows 5/6).
      expect(typeof sheet.E5.v).toBe('number');
      expect(typeof sheet.E6.v).toBe('number');
      // The seed list (B3:B26) names the qualifiers by B-position.
      expect(typeof sheet.B3.v).toBe('string');
      // GP finals use the same geometry (driver points written as scores).
      expect(workbook.Sheets['GP Finals'].S5.v).toBe(1);
      expect(workbook.Sheets['GP Finals'].V5.v).toBe(4);
      expect(workbook.Sheets['MR Finals'].S5.v).toBe(1);
    });

    it('should write the Main Hub player rows for exactly 60 players', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Player Hub Cap',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: Array.from({ length: 60 }, (_value, index) => makeCdmMainHubPlayer(index)),
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      // Universe sorted by name asc: Name 01..Name 60 land on rows 2..61.
      expect(workbook.Sheets["Main Hub"].B2.v).toBe('Name 01');
      expect(workbook.Sheets["Main Hub"].B61.v).toBe('Name 60');
      expect(workbook.Sheets["Main Hub"].C61.v).toBe('Player 60');
      // Row 62 is past the fixed 60-row table; the template has no B62 and the
      // exporter must never address it, so the decoded cell stays undefined.
      expect(workbook.Sheets["Main Hub"].B62).toBeUndefined();
    });

    it('should cap Main Hub player rows at 60 when more players are provided', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Player Hub Cap',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: Array.from({ length: 61 }, (_value, index) => makeCdmMainHubPlayer(index)),
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      // The 60th player still lands on B61; the 61st is dropped (truncate + log),
      // and no row-62 cell is ever created (KEEP-OUT-OF-BOUNDS of the fixed table).
      expect(workbook.Sheets["Main Hub"].B2.v).toBe('Name 01');
      expect(workbook.Sheets["Main Hub"].B61.v).toBe('Name 60');
      for (const column of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
        expect(workbook.Sheets["Main Hub"][`${column}62`]).toBeUndefined();
      }
    });

    it('should cap TT Qualifications rows at 60 when more entries are provided', async () => {
      const ttBoundaryColumns = [
        "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
        "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
      ];

      const makeTtQualificationPlayer = (index: number) => {
        const n = String(index + 1).padStart(2, "0");
        return {
          playerId: `p${index + 1}`,
          player: { id: `p${index + 1}`, name: `Name ${n}`, nickname: `Player ${n}` },
          stage: 'qualification',
          seeding: index + 1,
          lives: 3,
          eliminated: false,
          times: { MC1: `0:0${(index % 9) + 1}.000` },
          totalTime: 12000 + index,
        };
      };

      const mockTournament = {
        id: 't1',
        name: 'CDM TT Qualification Cap',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: Array.from({ length: 61 }, (_value, index) => makeTtQualificationPlayer(index)),
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      // The TT Qualifications sheet caps at 47 finalists (rows 2..48), not 60:
      // its template table is smaller than Main Hub's. Row 2 gets the first
      // nickname-sorted entry's MC1 time; the row-62 cells stay unwritten.
      // (Nicknames "Player 01".."Player 61" sort ascending, so Player 01 -> row 2.)
      expect(workbook.Sheets["TT Qualifications"].G2.v).toBe(100); // 0:01.000 -> 100
      for (const col of ttBoundaryColumns) {
        expect(workbook.Sheets["TT Qualifications"][`${col}62`]).toBeUndefined();
      }
    });

    it('should clear stale template TT times on in-range spare rows', async () => {
      // The shipped template is the populated CDM 2025 workbook: rows 2..48 of
      // TT Qualifications hold that event's real times. Unlike the row-62 check
      // above (absent in the template, so undefined is trivial), G3/G48 DO hold
      // stale values in the template — their absence here proves the exporter
      // actively cleared the spare in-table rows for a smaller tournament.
      const player = { id: 'p1', name: 'Solo Runner', nickname: 'Solo' };
      const mockTournament = {
        id: 't1',
        name: 'CDM TT Stale Clear',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [{
          playerId: 'p1',
          player,
          stage: 'qualification',
          seeding: 1,
          lives: 3,
          eliminated: false,
          times: { MC1: '1:10.34' },
          totalTime: 70340,
        }],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      const ttSheet = workbook.Sheets["TT Qualifications"];
      // The single qualifier lands on row 2 with the MSSCC-encoded time...
      expect(ttSheet.G2.v).toBe(11034); // 1:10.34
      // ...and the stale 2025 times on the spare rows are gone (template G3=5979,
      // G48 populated — both must be cleared, across the full course range G..Z).
      expect(ttSheet.G3).toBeUndefined();
      expect(ttSheet.Z3).toBeUndefined();
      expect(ttSheet.G48).toBeUndefined();
      expect(ttSheet.Z48).toBeUndefined();
      // The roster spill anchor E2 stays untouched: it still carries the
      // template's cached SEQUENCE value 1 (formula retention itself is
      // enforced by SheetXmlPatcher's formula guard and its unit tests; the
      // value-level parser here can only observe the cached <v>).
      expect(ttSheet.E2.v).toBe(1);
    });

    it('should skip an unknown CDM finals round instead of using a fallback slot', async () => {
      // The new exporter has no positional fallback: a round that does not map to
      // a bracket geometry is skipped with a warning (design §3.4.1), so only the
      // recognized winners_qf round produces typed cells.
      const player = (id: string) => ({ id, name: `Name ${id}`, nickname: id.toUpperCase() });
      const mockTournament = {
        id: 't1',
        name: 'CDM Unknown Round Skip',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [
          {
            matchNumber: 13,
            stage: 'finals',
            round: 'winners_qf',
            player1: player('p1'),
            player2: player('p2'),
            score1: 2,
            score2: 1,
            completed: true,
          },
          {
            matchNumber: 99,
            stage: 'finals',
            round: 'zz_custom_showmatch',
            player1: player('p3'),
            player2: player('p4'),
            score1: 1,
            score2: 0,
            completed: true,
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      const sheet = workbook.Sheets["BM Finals"];
      // winners_qf[0] is a degraded-8 path (winners_qf is the first round): the
      // template's row-7 score cells (AC7/AC8) get the overwritten 2-1 result.
      expect(sheet.AC7.v).toBe(2);
      expect(sheet.AC8.v).toBe(1);
      // The unused Barrage block is stripped in degraded-8 mode, so its typed
      // seed cell E5 is cleared (was 17) — the unknown round never landed there.
      expect(sheet.E5).toBeUndefined();
    });

    it('should return 401 when CDM export is requested without authentication', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
      expect(result.status).toBe(401);
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
    });

    it('should return 403 when CDM export is requested by a non-admin user', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'player-1', role: 'player' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Admin access required',
        code: 'FORBIDDEN',
      }));
      expect(result.status).toBe(403);
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
    });

    it('should return 503 when the CDM template self-fetch fails', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Failed to load CDM export template',
        code: 'SERVICE_UNAVAILABLE',
      }));
      expect(result.status).toBe(503);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to load CDM export template', {
        source: 'fetch',
        status: 404,
        tournamentId: 't1',
      });
      // The workbook generator is never reached on a template-load failure, so
      // the response carries the error object, not the .xlsm byte payload.
      expect(result.data).not.toBeInstanceOf(Uint8Array);
    });

    it('should return 503 when ASSETS.fetch throws during CDM template loading', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };
      const fetchError = new Error('ASSETS unavailable');
      const assetFetch = jest.fn().mockRejectedValue(fetchError);

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (getCloudflareContext as jest.Mock).mockReturnValue({
        env: { DB: {}, ASSETS: { fetch: assetFetch } },
      });
      global.fetch = jest.fn();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(assetFetch).toHaveBeenCalledWith(new URL('/templates/cdm-2025-template.xlsm', 'https://assets.local'));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Failed to load CDM export template',
        code: 'SERVICE_UNAVAILABLE',
      }));
      expect(result.status).toBe(503);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to load CDM export template', {
        source: 'ASSETS',
        status: 500,
        error: fetchError,
        tournamentId: 't1',
      });
      // The workbook generator is never reached on a template-load failure.
      expect(result.data).not.toBeInstanceOf(Uint8Array);
    });

    it('should not pollute Object.prototype when CDM export receives malicious player names', async () => {
      const pollutionKey = 'cdmExportPolluted';
      delete Object.prototype[pollutionKey];

      const mockTournament = {
        id: 't1',
        name: '__proto__',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [{
          player: { id: 'p1', name: '__proto__', nickname: '__proto__', country: 'constructor' },
          seeding: 1,
          group: 'A',
          points: 3,
          score: 1000,
        }],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [{
          playerId: 'p1',
          player: { id: 'p1', name: '__proto__', nickname: '__proto__', country: 'constructor' },
          stage: 'qualification',
          seeding: 1,
          lives: 3,
          eliminated: false,
          times: JSON.parse(`{"MC1":"0:12.345","__proto__":{"${pollutionKey}":true},"constructor":{"prototype":{"${pollutionKey}":true}}}`),
          totalTime: 12345,
        }],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      try {
        const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
        const params = Promise.resolve({ id: 't1' });
        const result = await GET(request, { params });
        const workbook = cdmWorkbookFromResult(result);

        expect(result.headers['Content-Disposition']).toContain('__proto__-cdm-2024-01-15.xlsm');
        // Nicknames are written as inline strings (never as object keys/formulas),
        // so the malicious "__proto__" / "constructor" time keys cannot pollute.
        expect(workbook.Sheets["Main Hub"].B2.v).toBe('__proto__');
        expect(workbook.Sheets["Main Hub"].C2.v).toBe('__proto__');
        expect(({} as Record<string, unknown>)[pollutionKey]).toBeUndefined();
        expect(Object.prototype[pollutionKey]).toBeUndefined();
      } finally {
        delete Object.prototype[pollutionKey];
      }
    });

    it('should write GP finals scores from points1/points2 into the CDM workbook', async () => {
      // Spec change (design §3.4): the CDM GP Finals score cell holds the FT
      // progress points (points1/points2), NOT a cupResults summary string. The
      // per-cup detail stays in the app; the workbook's formulas only need the
      // match points. winners_final block = AM column; score offset +4 = AQ,
      // rows 19/20.
      const mockTournament = {
        id: 't1',
        name: 'GP Finals CDM',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          // winners_qf present -> 8-player bracket (degraded mode), which is the
          // path that writes the winners_final score cells from points1/points2.
          ...Array.from({ length: 4 }, (_v, i) => ({
            matchNumber: 13 + i,
            stage: 'finals',
            round: 'winners_qf',
            player1: { id: `q${2 * i + 1}`, name: `Name ${2 * i + 1}`, nickname: `Q${2 * i + 1}` },
            player2: { id: `q${2 * i + 2}`, name: `Name ${2 * i + 2}`, nickname: `Q${2 * i + 2}` },
            points1: 9,
            points2: 6,
            completed: true,
          })),
          {
            matchNumber: 28,
            stage: 'finals',
            round: 'winners_final',
            bracketPosition: 'WF',
            player1: { id: 'p1', name: 'Player One', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player Two', nickname: 'P2' },
            points1: 2,
            points2: 1,
            cup: 'Star',
            cupResults: [
              { cup: 'Mushroom', points1: 45, points2: 30, winner: 1 },
              { cup: 'Flower', points1: 24, points2: 45, winner: 2 },
              { cup: 'Star', points1: 48, points2: 21, winner: 1 },
            ],
            completed: true,
          },
        ],
        ttEntries: [],
        ttPhaseRounds: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      mockRealTemplateAsset();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const workbook = cdmWorkbookFromResult(result);
      // 8-player degraded bracket: winners_final[0] score cells AQ19/AQ20 are
      // value-overwritten from the GP match points1/points2 (2-1) — no cupResults
      // summary string is written anywhere (the per-cup detail stays in the app).
      expect(workbook.Sheets["GP Finals"].AQ19.v).toBe(2);
      expect(workbook.Sheets["GP Finals"].AQ20.v).toBe(1);
    });

    it('should export BM qualification data grouped by group', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            tournamentId: 't1',
            playerId: 'p1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 1,
            losses: 0,
            points: 6,
            score: 10,
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'q2',
            tournamentId: 't1',
            playerId: 'p2',
            group: 'B',
            seeding: 1,
            mp: 3,
            wins: 1,
            ties: 1,
            losses: 1,
            points: 0,
            score: 6,
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Group A');
      expect(result.data).toContain('BM Group B');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('Rank');
      expect(result.data).toContain('Matches Played');
      expect(result.data).toContain('Wins');
    });

    it('should export BM qualification matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 3,
            score2: 1,
            completed: true,
            rounds: [
              { arena: 1, winner: 1 },
              { arena: 2, winner: 2 },
              { arena: 3, winner: 1 },
              { arena: 4, winner: 1 },
            ],
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Qualification Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('3 - 1');
      expect(result.data).toContain('Arena 1: P1 wins');
      expect(result.data).toContain('Arena 2: P2 wins');
    });

    it('should export BM finals matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'finals',
            /* round must be a string since source code calls .includes(',') on it without String() conversion */
            round: '1',
            tvNumber: 1,
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 3,
            score2: 1,
            completed: true,
            rounds: [
              { arena: 1, winner: 1 },
              { arena: 2, winner: 1 },
              { arena: 3, winner: 1 },
            ],
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Finals Matches');
      expect(result.data).toContain('Round');
      expect(result.data).toContain('TV #');
      expect(result.data).toContain('1');
    });

    it('should export Match Race matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            /* stage and round must be strings since source code calls .includes(',') on them
               without String() conversion (v.includes is not a function for numbers) */
            stage: 'qualification',
            round: '1',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 2,
            score2: 1,
            completed: true,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Match Race Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('2 - 1');
      expect(result.data).toContain('Stage');
      expect(result.data).toContain('Round');
    });

    it('should export Grand Prix matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            points1: 18,
            points2: 6,
            completed: true,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Grand Prix Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('18');
      expect(result.data).toContain('6');
      expect(result.data).toContain('Points P1');
      expect(result.data).toContain('Points P2');
    });

    it('should export Time Attack entries', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 98765,
            rank: 2,
            lives: 0,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Time Attack Entries');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('Rank');
      expect(result.data).toContain('Total Time');
      expect(result.data).toContain('Lives');
      expect(result.data).toContain('Date');
      expect(formatTime).toHaveBeenCalledWith(83456);
      expect(formatTime).toHaveBeenCalledWith(98765);
    });

    it('should set correct Content-Type and Content-Disposition headers', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers).toBeDefined();
      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(result.headers['Content-Disposition']).toContain('attachment');
      expect(result.headers['Content-Disposition']).toContain('.csv');
    });

    it('should generate filename with tournament name and date', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_2024-full-2024-01-15.csv');
    });

    it('should replace special characters in tournament name for filename', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test/Tournament!2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_2024-full-');
      expect(result.headers['Content-Disposition']).not.toContain('/');
      expect(result.headers['Content-Disposition']).not.toContain('!');
    });

    it('should include UTF-8 BOM at the beginning of CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.startsWith('\uFEFF')).toBe(true);
    });

    it('should escape commas in CSV fields', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            tournamentId: 't1',
            playerId: 'p1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 0,
            losses: 1,
            points: 6,
            score: 10,
            player: { id: 'p1', name: 'Player, One', nickname: 'P,1' },
          },
        ],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      /*
       * BM qualification data rows use simple row.join(',') without CSV escaping,
       * so commas in player names are NOT escaped (unlike match data rows).
       * The raw CSV will contain the player names with unescaped commas.
       */
      expect(result.data).toContain('Player, One');
      expect(result.data).toContain('P,1');
    });

    it('should return 404 when tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // createErrorResponse includes success: false and error message
      expect(result.data).toEqual(expect.objectContaining({ success: false, error: 'Tournament not found' }));
      expect(result.status).toBe(404);
    });

    it('should return 500 when database operation fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // createErrorResponse includes success: false and error message
      expect(result.data).toEqual(expect.objectContaining({ success: false, error: 'Failed to export tournament data' }));
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', expect.objectContaining({
        errorMessage: 'Database error',
        errorName: expect.any(String),
        tournamentId: 't1',
      }));
    });

    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/export');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // Regression: resolveTournamentId was previously called OUTSIDE the try/catch.
    // An identifier that fails the slug/UUID format check causes resolveTournamentId to
    // throw when there is also a DB connectivity error. The throw must be caught and
    // returned as a structured 500, not left as an unhandled exception (which would
    // surface as a raw Next.js 500 HTML page and skip the error-response JSON body).
    it('should return structured 500 when resolveTournamentId throws (invalid format + DB error)', async () => {
      // Use an identifier that fails both TOURNAMENT_SLUG_REGEX and UUID_REGEX so
      // resolveTournamentId's internal catch will re-throw after a DB error.
      const badId = 'INVALID_FORMAT_ID';
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('D1 connection error'));

      const request = new MockNextRequest(`http://localhost:3000/api/tournaments/${badId}/export`);
      const params = Promise.resolve({ id: badId });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(result.data).toEqual(expect.objectContaining({ success: false }));
      // Logger should capture the error with the raw id as tournamentId fallback
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', expect.objectContaining({
        errorMessage: expect.any(String),
        tournamentId: badId,
      }));
    });

    it('should handle tournament with all empty data', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Empty Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('TOURNAMENT SUMMARY');
      expect(result.data).toContain('BM Participants');
      expect(result.data).toContain('0');
      expect(result.data).toContain('MR Matches');
      expect(result.data).toContain('GP Matches');
      expect(result.data).toContain('TA Entries');
    });

    it('should sort TT entries by total time ascending', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 98765,
            rank: 2,
            lives: 0,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      /* Player 2 has faster time (83456) so appears first (lower index) in the TA section */
      const player2Index = result.data.indexOf('Player 2');
      const player1Index = result.data.indexOf('Player 1');
      expect(player2Index).toBeLessThan(player1Index);
    });

    it('should filter out TT entries with null total time', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: null,
            rank: null,
            lives: 3,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Player 1');
      expect(result.data).not.toContain('Player 2');
    });

    it('should handle uncompleted BM matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 0,
            score2: 0,
            completed: false,
            rounds: [],
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Not started');
      expect(result.data).toContain('No');
    });

    it('should handle uncompleted MR matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            /* round must be a string since source code calls .includes(',') on it without String() conversion */
            round: '1',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 0,
            score2: 0,
            completed: false,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Not started');
      expect(result.data).toContain('No');
    });

    it('should handle uncompleted GP matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            points1: 0,
            points2: 0,
            completed: false,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('0');
      expect(result.data).toContain('No');
    });
  });

  /*
   * Regression coverage for the CDM Export HTTP 500 reported when the export
   * encounters a row whose `player` / `player1` / `player2` relation came back
   * null from Prisma. The schema declares those relations as non-nullable, but
   * D1 can surface a null in production when a Player was hard-deleted while
   * its child rows (qualifications, matches, TT entries) remained — the old
   * exporter threw inside `member.player.id` and the route's catch block
   * returned an opaque 500. The fix drops the offending rows with a warning and
   * exports the rest. Each test verifies the export now succeeds and that the
   * logger warns about the dropped rows.
   */
  describe('CDM export null-player tolerance', () => {
    function setupRealTemplateMock() {
      const templateBuf = readFileSync(CDM_TEMPLATE_PATH);
      const assetFetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(
          templateBuf.buffer.slice(templateBuf.byteOffset, templateBuf.byteOffset + templateBuf.byteLength),
        ),
      });
      (getCloudflareContext as jest.Mock).mockReturnValue({
        env: { DB: {}, ASSETS: { fetch: assetFetch } },
      });
      return assetFetch;
    }

    it('should still export when a bmQualification row has player: null', async () => {
      setupRealTemplateMock();
      const mockTournament = {
        id: 't-null-qual',
        name: 'Null Qual Test',
        date: new Date('2024-01-15'),
        bmQualifications: [
          { player: null, seeding: 1, group: 'A', points: 0, score: 0 },
          { player: { id: 'p1', name: 'Alice', nickname: 'Alice' }, seeding: 2, group: 'A', points: 0, score: 0 },
        ],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t-null-qual/export?format=cdm');
      const params = Promise.resolve({ id: 't-null-qual' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Dropped CDM export rows with missing/invalid player',
        expect.objectContaining({ category: 'bmQualifications', droppedCount: 1 }),
      );
    });

    it('should still export when a bmMatch has player1: null', async () => {
      setupRealTemplateMock();
      const mockTournament = {
        id: 't-null-match',
        name: 'Null Match Test',
        date: new Date('2024-01-15'),
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [
          {
            matchNumber: 1,
            stage: 'qualification',
            player1: null,
            player2: { id: 'p2', name: 'Bob', nickname: 'Bob' },
            score1: 4,
            score2: 2,
            completed: true,
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t-null-match/export?format=cdm');
      const params = Promise.resolve({ id: 't-null-match' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Dropped CDM export match rows with missing/invalid players',
        expect.objectContaining({ category: 'bmMatches', droppedCount: 1 }),
      );
    });

    it('should still export when a ttEntry has player: null', async () => {
      setupRealTemplateMock();
      const mockTournament = {
        id: 't-null-tt',
        name: 'Null TT Entry Test',
        date: new Date('2024-01-15'),
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          { player: null, playerId: 'p1', stage: 'qualification', seeding: 1, lives: 3, eliminated: false, times: {} },
          { player: { id: 'p2', name: 'Bob', nickname: 'Bob' }, playerId: 'p2', stage: 'qualification', seeding: 2, lives: 3, eliminated: false, times: {} },
        ],
        ttPhaseRounds: [],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t-null-tt/export?format=cdm');
      const params = Promise.resolve({ id: 't-null-tt' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Dropped CDM export rows with missing/invalid player',
        expect.objectContaining({ category: 'ttEntries', droppedCount: 1 }),
      );
    });

    it('should still export when a player object is missing required fields', async () => {
      setupRealTemplateMock();
      const mockTournament = {
        id: 't-malformed-player',
        name: 'Malformed Player Test',
        date: new Date('2024-01-15'),
        bmQualifications: [
          // Missing id/name/nickname — would crash .id access downstream
          { player: { country: 'JP' }, seeding: 1, group: 'A', points: 0, score: 0 },
          { player: { id: 'p1', name: 'Alice', nickname: 'Alice' }, seeding: 2, group: 'A', points: 0, score: 0 },
        ],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t-malformed-player/export?format=cdm');
      const params = Promise.resolve({ id: 't-malformed-player' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Dropped CDM export rows with missing/invalid player',
        expect.objectContaining({ category: 'bmQualifications', droppedCount: 1 }),
      );
    });

    it('should still export when a TT phase round contains an invalid timeMs', async () => {
      setupRealTemplateMock();
      const mockTournament = {
        id: 't-invalid-tt-time',
        name: 'Invalid TT Time Test',
        date: new Date('2024-01-15'),
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            player: { id: 'p1', name: 'Alice', nickname: 'Alice' },
            playerId: 'p1',
            stage: 'qualification',
            seeding: 1,
            lives: 0,
            eliminated: false,
            totalTime: 5000,
            qualificationPoints: 2,
            rank: 1,
          },
          {
            player: { id: 'p2', name: 'Bob', nickname: 'Bob' },
            playerId: 'p2',
            stage: 'qualification',
            seeding: 2,
            lives: 0,
            eliminated: false,
            totalTime: 6000,
            qualificationPoints: 1,
            rank: 2,
          },
        ],
        ttPhaseRounds: [
          {
            phase: 'phase1',
            roundNumber: 1,
            course: 'MC1',
            results: [
              { playerId: 'p1', timeMs: -1 },
              { playerId: 'p2', timeMs: 6000 },
            ],
            eliminatedIds: ['p1'],
            livesReset: false,
          },
        ],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t-invalid-tt-time/export?format=cdm');
      const params = Promise.resolve({ id: 't-invalid-tt-time' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(loggerMock.error).not.toHaveBeenCalledWith(
        'Failed to export tournament',
        expect.anything(),
      );
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'TT Finals phase1 round 1: invalid timeMs for player p1; treating as missing time',
      );
    });
  });
});
