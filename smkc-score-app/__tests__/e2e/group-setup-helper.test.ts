import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('group setup E2E helper', () => {
  const source = readFileSync(path.join(process.cwd(), 'e2e/lib/common.js'), 'utf8');
  const tcAllSource = readFileSync(path.join(process.cwd(), 'e2e/tc-all.js'), 'utf8');
  const bmSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-bm.js'), 'utf8');
  const mrSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-mr.js'), 'utf8');
  const archiveSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-archive.js'), 'utf8');
  const debugFillSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-debug-fill.js'), 'utf8');
  const gpSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-gp.js'), 'utf8');
  const bmFinalsPageSource = readFileSync(
    path.join(process.cwd(), 'src/app/tournaments/[id]/bm/finals/page.tsx'),
    'utf8',
  );
  const mrFinalsPageSource = readFileSync(
    path.join(process.cwd(), 'src/app/tournaments/[id]/mr/finals/page.tsx'),
    'utf8',
  );
  const gpFinalsPageSource = readFileSync(
    path.join(process.cwd(), 'src/app/tournaments/[id]/gp/finals/page.tsx'),
    'utf8',
  );

  it('skips the group-count click when the requested count is already selected and disabled', () => {
    const helperStart = source.indexOf('async function setupModePlayersViaUi');
    const helperEnd = source.indexOf('/** UI-based TA qualification roster setup.', helperStart);
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain('groupCountButton');
    expect(helperSource).toContain('isDisabled()');
    expect(helperSource).toContain('if (!groupCountDisabled)');
  });

  it('keeps GP finals score-only E2E inputs aligned with cup-win targets', () => {
    expect(gpSuiteSource).toContain('function gpFinalsTargetWins(match)');
    expect(gpSuiteSource).toContain('async function apiSetGpFinalsWinner');
    expect(gpSuiteSource).not.toContain('apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0)');
    expect(gpSuiteSource).not.toContain('apiSetGpFinalsScore(adminPage, tournamentId, m16.id, 0, 9)');
  });

  it('keeps GP Top-24 reset unlocked before testing the locked action path', () => {
    const tc715Start = gpSuiteSource.indexOf('async function runTc715');
    const resetCall = gpSuiteSource.indexOf('body: JSON.stringify({ reset: true })', tc715Start);
    const unlockCall = gpSuiteSource.indexOf('gpQualificationConfirmed: false', tc715Start);
    const confirmCall = gpSuiteSource.indexOf('gpQualificationConfirmed: true', tc715Start);

    expect(unlockCall).toBeGreaterThan(tc715Start);
    expect(unlockCall).toBeLessThan(resetCall);
    expect(confirmCall).toBeGreaterThan(resetCall);
  });

  it('accepts both English and Japanese playoff labels in the GP Top-24 flow', () => {
    const tc715Start = gpSuiteSource.indexOf('async function runTc715');
    const tc715End = gpSuiteSource.indexOf('/* ───────── TC-716', tc715Start);
    const tc715Source = gpSuiteSource.slice(tc715Start, tc715End);

    expect(tc715Source).toContain("finalsText.includes('Playoff (Barrage)')");
    expect(tc715Source).toContain("finalsText.includes('プレーオフ（バラッジ）')");
    expect(tc715Source).toContain("finalsText.includes('プレーオフ')");
  });

  it('keeps the GP Top-24 phase-two action visible before finals rows exist', () => {
    expect(gpFinalsPageSource).toContain('const defaultBracketTab');
    expect(gpFinalsPageSource).toContain('type BracketTab');
    expect(gpFinalsPageSource).toContain('matches.length > 0 ? BRACKET_TABS.finals : BRACKET_TABS.playoff');
    expect(gpFinalsPageSource).toContain('defaultValue={defaultBracketTab}');
  });

  it('keeps BM and MR Top-24 phase-two actions visible before finals rows exist', () => {
    for (const pageSource of [bmFinalsPageSource, mrFinalsPageSource]) {
      expect(pageSource).toContain('const defaultBracketTab');
      expect(pageSource).toContain('type BracketTab');
      expect(pageSource).toContain('matches.length > 0 ? BRACKET_TABS.finals : BRACKET_TABS.playoff');
      expect(pageSource).toContain('defaultValue={defaultBracketTab}');
    }
  });

  it('uses the tournament id returned by uiCreateTournament in the GP solo BREAK case', () => {
    const tc729Start = gpSuiteSource.indexOf('async function runTc729');
    const tc729End = gpSuiteSource.indexOf('/* ───────── TC-702', tc729Start);
    const tc729Source = gpSuiteSource.slice(tc729Start, tc729End);

    expect(tc729Source).toContain('tournamentId = await uiCreateTournament');
    expect(tc729Source).not.toContain('tournamentId = tournament.id');
  });

  it('keeps BM group-count E2E coverage aligned with the locked two-group UI', () => {
    const tc1075Start = tcAllSource.indexOf('TC-1075:');
    const tc1075End = tcAllSource.indexOf('// TC-306', tc1075Start);
    const tc1075Source = tcAllSource.slice(tc1075Start, tc1075End);
    const tc1052Start = bmSuiteSource.indexOf('async function runTc1052');
    const tc1052End = bmSuiteSource.indexOf('/* ───────── TC-1010', tc1052Start);
    const tc1052Source = bmSuiteSource.slice(tc1052Start, tc1052End);

    expect(tc1075Source).toContain("{ groupCount: 2 }");
    expect(tc1075Source).not.toContain("{ groupCount: 4 }");
    expect(tc1052Source).toContain('apiSetupBmGroup');
    expect(tc1052Source).toContain("['A', 'B', 'C'][index % 3]");
    expect(tc1052Source).toContain('setupRes.s === 400');
    expect(tc1052Source).not.toContain("{ groupCount: 3 }");
  });

  it('keeps BM Top-24 reset tests unlocked before calling reset', () => {
    for (const fnName of ['runTc515', 'runTc529']) {
      const fnStart = bmSuiteSource.indexOf(`async function ${fnName}`);
      const fnEnd = bmSuiteSource.indexOf('/* ─────────', fnStart + 1);
      const fnSource = bmSuiteSource.slice(fnStart, fnEnd);
      const unlockCall = fnSource.indexOf('bmQualificationConfirmed: false');
      const resetCall = fnSource.indexOf('body: JSON.stringify({ reset: true })');
      const confirmCall = fnSource.indexOf('bmQualificationConfirmed: true');

      expect(unlockCall).toBeGreaterThan(0);
      expect(unlockCall).toBeLessThan(resetCall);
      expect(confirmCall).toBeGreaterThan(resetCall);
    }
  });

  it('waits for the BM playoff completion action after API-driven scoring', () => {
    const tc515Start = bmSuiteSource.indexOf('async function runTc515');
    const tc515End = bmSuiteSource.indexOf('/* ───────── TC-529', tc515Start);
    const tc515Source = bmSuiteSource.slice(tc515Start, tc515End);

    expect(tc515Source).toContain("text.includes('Create Upper Bracket')");
    expect(tc515Source).toContain("text.includes('プレーオフ完了')");
    expect(tc515Source).toContain('timeout: 30000');
  });

  it('keeps TC-1010 aligned with round-aware BM finals target wins', () => {
    const tc1010Start = bmSuiteSource.indexOf('function bmFinalsTargetWinsForMatch');
    const tc1010End = bmSuiteSource.indexOf('/* ───────── TC-505', tc1010Start);
    const tc1010Source = bmSuiteSource.slice(tc1010Start, tc1010End);

    expect(tc1010Source).toContain("round === 'losers_r3'");
    expect(tc1010Source).toContain("round === 'losers_r4'");
    expect(tc1010Source).toContain('return 7');
    expect(tc1010Source).toContain('bmFinalsTargetWinsForMatch(match)');
  });

  it('keeps GP finals mobile E2E coverage on the cup-win score dialog', () => {
    const tc356Start = tcAllSource.indexOf('TC-356:');
    const tc356End = tcAllSource.indexOf('// TC-357', tc356Start);
    const tc356Source = tcAllSource.slice(tc356Start, tc356End);

    expect(tc356Source).toContain('#gp-finals-simple-score1');
    expect(tc356Source).toContain('#gp-finals-simple-score2');
    expect(tc356Source).not.toContain('gp-finals-mobile-race-entry');
  });

  it('keeps TC-311 aligned with direct GP participant driver-point entry', () => {
    const tc311Start = tcAllSource.indexOf('TC-311:');
    const tc311End = tcAllSource.indexOf('// TC-312', tc311Start);
    const tc311Source = tcAllSource.slice(tc311Start, tc311End);

    expect(tc311Source).toContain("playerPage.locator('input[inputmode=\"numeric\"]')");
    expect(tc311Source).toContain("document.querySelectorAll('input[inputmode=\"numeric\"]').length === 2");
    expect(tc311Source).toContain("await pointInputs.nth(0).fill('45')");
    expect(tc311Source).toContain("await pointInputs.nth(1).fill('0')");
    expect(tc311Source).not.toContain("button[role=\"combobox\"]");
    expect(tc311Source).not.toContain('[role="listbox"]');
  });

  it('bounds TC-402 browser fetches so a stalled worker cannot wedge the full preview run', () => {
    const tc402Start = tcAllSource.indexOf('TC-402:');
    const tc402End = tcAllSource.indexOf('// TC-101', tc402Start);
    const tc402Source = tcAllSource.slice(tc402Start, tc402End);

    expect(tcAllSource).toContain('async function pageFetchJson');
    expect(tcAllSource).toContain('new AbortController()');
    expect(tcAllSource).toContain("s: 0");
    expect(tc402Source).toContain('pageFetchJson(page, `/api/tournaments/${TID}/overall-ranking`, { method:');
    expect(tc402Source).toContain("pageFetchJson(page, `/api/tournaments/${TID}/overall-ranking?ts=${Date.now()}`, { cache: 'no-store' }");
  });

  it('checks MR/GP match detail pages against the actual match players', () => {
    const tc820Start = mrSuiteSource.indexOf('TC-820:');
    const tc820End = mrSuiteSource.indexOf('/* ───────── TC-617', tc820Start);
    const tc820Source = mrSuiteSource.slice(tc820Start, tc820End);
    const tc821Start = gpSuiteSource.indexOf('TC-821:');
    const tc821End = gpSuiteSource.indexOf('/* ───────── TC-719', tc821Start);
    const tc821Source = gpSuiteSource.slice(tc821Start, tc821End);

    for (const sourceText of [tc820Source, tc821Source]) {
      expect(sourceText).toContain('const expectedNames = [match.player1.nickname, match.player2.nickname]');
      expect(sourceText).toContain('adminPage.waitForFunction((names) =>');
      expect(sourceText).toContain('expectedNames.every((name) => matchText.includes(name))');
      expect(sourceText).not.toContain('p1.nickname');
      expect(sourceText).not.toContain('p2.nickname');
    }
  });

  it('keeps MR finals E2E aligned with server target wins and reset locking', () => {
    const targetStart = mrSuiteSource.indexOf('function mrFinalsTargetWinsForMatch');
    const targetEnd = mrSuiteSource.indexOf('async function loginSharedPlayer', targetStart);
    const targetSource = mrSuiteSource.slice(targetStart, targetEnd);
    const tc615Start = mrSuiteSource.indexOf('async function runTc615');
    const tc615End = mrSuiteSource.indexOf('/* ───────── TC-616', tc615Start);
    const tc615Source = mrSuiteSource.slice(tc615Start, tc615End);
    const tc858Start = mrSuiteSource.indexOf('async function runTc858');
    const tc858End = mrSuiteSource.indexOf('/* See tc-bm.js::getSuite', tc858Start);
    const tc858Source = mrSuiteSource.slice(tc858Start, tc858End);

    expect(targetSource).toContain("round === 'losers_sf' || round === 'grand_final'");
    expect(targetSource).not.toContain("|| round === 'losers_r4' || round === 'losers_sf'");
    for (const sourceText of [tc615Source, tc858Source]) {
      expect(sourceText).toContain('mrQualificationConfirmed: false');
      expect(sourceText).toContain('body: JSON.stringify({ reset: true })');
      expect(sourceText).toContain('mrQualificationConfirmed: true');
    }
  });

  it('keeps archive and debug-fill focused suites isolated from stale browser state', () => {
    expect(archiveSuiteSource).toContain('const targetPage = await page.context().newPage()');
    expect(archiveSuiteSource).toContain('await targetPage.bringToFront()');
    expect(archiveSuiteSource).toContain('await targetPage.close().catch(() => {})');
    expect(archiveSuiteSource).toContain("result.status === 'FAIL'");
    expect(debugFillSuiteSource).toContain('function taEntriesFromFetch');
    expect(debugFillSuiteSource).toContain('unwrapData(response?.b)?.entries');
  });
});
