import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('group setup E2E helper', () => {
  const source = readFileSync(path.join(process.cwd(), 'e2e/lib/common.js'), 'utf8');
  const gpSuiteSource = readFileSync(path.join(process.cwd(), 'e2e/tc-gp.js'), 'utf8');
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
    expect(gpFinalsPageSource).toContain('matches.length > 0 ? "finals" : "playoff"');
    expect(gpFinalsPageSource).toContain('defaultValue={defaultBracketTab}');
  });

  it('uses the tournament id returned by uiCreateTournament in the GP solo BREAK case', () => {
    const tc729Start = gpSuiteSource.indexOf('async function runTc729');
    const tc729End = gpSuiteSource.indexOf('/* ───────── TC-702', tc729Start);
    const tc729Source = gpSuiteSource.slice(tc729Start, tc729End);

    expect(tc729Source).toContain('tournamentId = await uiCreateTournament');
    expect(tc729Source).not.toContain('tournamentId = tournament.id');
  });
});
