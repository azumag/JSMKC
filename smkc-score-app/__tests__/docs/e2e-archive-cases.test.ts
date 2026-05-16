import fs from 'fs';
import path from 'path';

describe('archive E2E case registration', () => {
  const casesPath = path.join(process.cwd(), '..', 'E2E_TEST_CASES.md');
  const cases = fs.readFileSync(casesPath, 'utf8');

  it.each(['TC-ARC-01', 'TC-ARC-02', 'TC-ARC-03', 'TC-ARC-04', 'TC-ARC-06', 'TC-ARC-07', 'TC-ARC-08', 'TC-ARC-09'])(
    'documents %s as a runnable archive script case',
    (tc) => {
      const section = cases.slice(cases.indexOf(`## ${tc}:`), cases.indexOf('\n---', cases.indexOf(`## ${tc}:`)));
      expect(section).toContain(`tc-archive.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:archive');
      expect(section).not.toContain('未スクリプト化');
    },
  );

  it('documents TC-ARC-06 as concrete archive match/player payload coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-06:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-06:')),
    );

    expect(section).toContain('modes.bm.matches[0]');
    expect(section).toContain("stage === 'qualification'");
    expect(section).toContain('score1 === 3');
    expect(section).toContain('score2 === 1');
    expect(section).toContain('player1.id');
    expect(section).toContain('player2.id');
    expect(section).toContain('cleanup は tournament 削除に失敗しても player 削除まで試行');
  });

  it('documents TC-ARC-05 as TA archive phase1/phase2 fallback coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-05:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-05:')),
    );

    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase1');
    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase2');
    expect(section).toContain('round history');
    expect(section).toContain('lives === 0');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');
  });

  it('documents TC-ARC-07 as TA not-found archive fallback coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-07:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-07:')),
    );

    expect(section).toContain('/api/tournaments/:id/ta');
    expect(section).toContain('tournament not found');
    expect(section).toContain('archive fallback');
    expect(section).toContain('data.archived === true');
    expect(section).toContain('live `TTEntry` クエリを実行しない');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/route.test.ts');
  });

  it('documents TC-ARC-08 as multi-archive index/list coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-08:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-08:')),
    );

    expect(section).toContain('archives/by-id/*/meta.json');
    expect(section).toContain('legacy fallback');
    expect(section).toContain('smkc-score-app/__tests__/lib/tournament-archive.test.ts');
  });

  it('documents that preview archive coverage writes to a dedicated R2 bucket', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-03:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-03:')),
    );

    expect(section).toContain('smkc-archives-preview');
    expect(section).toMatch(/smkc-archives(?!-preview)/);
  });

  it('documents TC-ARC-09 as qualification page parallel fetch coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-09:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-09:')),
    );

    expect(section).toContain('TA/BM/MR/GP');
    expect(section).toContain('players API が必要な場合は mode API と並列');
    expect(section).toContain('mode API 単独の `allPlayers` payload');
    expect(section).toContain('Playwright');
    expect(section).toContain('route interception');
    expect(section).toContain('/api/players?limit=100');
    expect(section).toContain('archive fallback');
    expect(section).toContain('smkc-score-app/__tests__/lib/qualification-page-data.test.ts');
  });
});
