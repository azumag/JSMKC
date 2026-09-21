import fs from 'fs';
import path from 'path';

function archiveCaseSection(source: string, tc: string): string {
  const startMarker = `## ${tc}:`;
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing archive E2E case marker: ${startMarker}`);
  }

  const end = source.indexOf('\n---', start);
  if (end < 0) {
    throw new Error(`Missing archive E2E case separator after: ${startMarker}`);
  }

  return source.slice(start, end);
}

describe('archiveCaseSection', () => {
  const fixture = ['## TC-ARC-TEST: Example', 'body', '---', '## TC-ARC-NEXT: Next', 'next body', '---'].join('\n');

  it('extracts only the requested archive case section', () => {
    expect(archiveCaseSection(fixture, 'TC-ARC-TEST')).toBe('## TC-ARC-TEST: Example\nbody');
  });

  it('fails closed when the requested archive case marker is missing', () => {
    expect(() => archiveCaseSection(fixture, 'TC-ARC-MISSING')).toThrow(
      'Missing archive E2E case marker: ## TC-ARC-MISSING:',
    );
  });

  it('fails closed when the archive case separator is missing', () => {
    const withoutSeparator = '## TC-ARC-TEST: Example\nbody';
    expect(() => archiveCaseSection(withoutSeparator, 'TC-ARC-TEST')).toThrow(
      'Missing archive E2E case separator after: ## TC-ARC-TEST:',
    );
  });
});

describe('archive E2E case registration', () => {
  const casesPath = path.join(process.cwd(), '..', 'E2E_TEST_CASES.md');
  const cases = fs.readFileSync(casesPath, 'utf8');
  const tcArchive = fs.readFileSync(path.join(process.cwd(), 'e2e', 'tc-archive.js'), 'utf8');
  const qualificationPlayerTransportGuard = fs.readFileSync(
    path.join(process.cwd(), '__tests__', 'static', 'qualification-page-player-transport.test.ts'),
    'utf8',
  );

  it.each(['TC-ARC-01', 'TC-ARC-02', 'TC-ARC-03', 'TC-ARC-04', 'TC-ARC-06', 'TC-ARC-07', 'TC-ARC-08', 'TC-ARC-09'])(
    'documents %s as a runnable archive script case',
    (tc) => {
      const section = archiveCaseSection(cases, tc);
      expect(section).toContain(`tc-archive.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:archive');
      expect(section).not.toContain('未スクリプト化');
    },
  );

  it('documents TC-ARC-06 as concrete archive match/player payload coverage', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-06');

    expect(section).toContain('modes.bm.matches[0]');
    expect(section).toContain("stage === 'qualification'");
    expect(section).toContain('score1 === 3');
    expect(section).toContain('score2 === 1');
    expect(section).toContain('player1.id');
    expect(section).toContain('player2.id');
    expect(section).toContain('cleanup は tournament 削除に失敗しても player 削除まで試行');
  });

  it('documents TC-ARC-05 as TA archive phase1/phase2 fallback coverage', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-05');

    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase1');
    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase2');
    expect(section).toContain('round history');
    expect(section).toContain('lives === 0');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');
  });

  it('documents TC-ARC-07 as TA not-found archive fallback coverage', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-07');

    expect(section).toContain('/api/tournaments/:id/ta');
    expect(section).toContain('tournament not found');
    expect(section).toContain('archive fallback');
    expect(section).toContain('data.archived === true');
    expect(section).toContain('live `TTEntry` クエリを実行しない');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/route.test.ts');
  });

  it('documents TC-ARC-08 as multi-archive index/list coverage', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-08');

    expect(section).toContain('archives/by-id/*/meta.json');
    expect(section).toContain('legacy fallback');
    expect(section).toContain('smkc-score-app/__tests__/lib/tournament-archive.test.ts');
  });

  it('documents that preview archive coverage writes to a dedicated R2 bucket', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-03');

    expect(section).toContain('smkc-archives-preview');
    expect(section).toMatch(/smkc-archives(?!-preview)/);
  });

  it('ties TC-ARC-09 to the bounded qualification-player transport contract', () => {
    const section = archiveCaseSection(cases, 'TC-ARC-09');

    expect(section).toContain('TA/BM/MR/GP');
    expect(section).toContain('Playwright');
    expect(section).toContain('route interception');
    expect(section).toContain('archive fallback');

    expect(tcArchive).toContain('TC-ARC-09  Qualification pages hydrate from mode allPlayers without global players fetches.');
    expect(tcArchive).toContain("if (kind === 'players')");
    expect(tcArchive).toContain('unexpectedPlayerRequests');
    expect(qualificationPlayerTransportGuard).toContain("expect(source).not.toContain('/api/players')");
    expect(qualificationPlayerTransportGuard).toContain("expect(source).not.toContain('qualification-page-data')");
  });
});
