import fs from 'fs';
import path from 'path';

function readMatchPage(mode: 'mr' | 'gp') {
  return fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'match', '[matchId]', 'page.tsx'),
    'utf8',
  );
}

function readMessages(locale: 'en' | 'ja') {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as {
    match?: { selectPlayer?: string };
  };
}

function readMatchValidationMessages(locale: 'en' | 'ja') {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'messages', 'match-validation', `${locale}.json`), 'utf8'),
  ) as Record<string, string>;
}

describe('MR/GP match report error fallback contract (issue #3588)', () => {
  it.each(['mr', 'gp'] as const)('%s preserves API errors and localizes generic submit failures', (mode) => {
    const source = readMatchPage(mode);

    expect(source).toContain('const data = await response.json().catch(() => ({}));');
    expect(source).toContain("setError(data.error || tCommon('networkError'));");
    expect(source).toContain("logger.error('Failed to submit result:', { error: err });");
    expect(source).toContain("setError(tCommon('networkError'));");
  });

  it('removes the MR hard-coded English generic failure', () => {
    expect(readMatchPage('mr')).not.toContain("setError('Failed to submit result');");
  });

  it('localizes MR player-identity validation through the shared match key', () => {
    const source = readMatchPage('mr');

    expect(source).toContain("setError(tMatch('selectPlayer'));");
    expect(source).not.toContain("setError('Please select which player you are');");
    expect(readMessages('en').match?.selectPlayer).toBe('Please select which player you are');
    expect(readMessages('ja').match?.selectPlayer).toBe('自分がどちらのプレイヤーか選択してください');
  });

  it('localizes MR all-race-winners validation with the configured race count', () => {
    const source = readMatchPage('mr');
    const enMessages = readMatchValidationMessages('en');
    const jaMessages = readMatchValidationMessages('ja');
    const requestSource = fs.readFileSync(path.join(process.cwd(), 'src', 'i18n', 'request.ts'), 'utf8');

    expect(source).toContain("setError(tMatch('selectAllRaceWinners', { count: TOTAL_MR_RACES }));");
    expect(source).not.toContain('setError(`Please select the winner for all ${TOTAL_MR_RACES} races`);');
    expect(Object.keys(jaMessages).sort()).toEqual(Object.keys(enMessages).sort());
    expect(enMessages.selectAllRaceWinners).toBe('Please select the winner for all {count} races');
    expect(jaMessages.selectAllRaceWinners).toBe('全{count}レースの勝者を選択してください');
    expect(requestSource).toContain('...matchValidationMessages[locale]');
  });

  it('does not use the GP submit button label as an error fallback', () => {
    expect(readMatchPage('gp')).not.toContain("setError(data.error || tMatch('submitResult'));");
  });
});
