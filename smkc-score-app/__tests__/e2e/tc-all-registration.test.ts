import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { e2eCaseSection } from '../helpers/e2e-cases';

describe('tc-all focused suite registration', () => {
  const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'));
  const sourcePath = path.join(process.cwd(), 'e2e', 'tc-all.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const debugFillPath = path.join(process.cwd(), 'e2e', 'tc-debug-fill.js');
  const debugFillSource = fs.readFileSync(debugFillPath, 'utf8');

  it('runs archive and debug-fill focused suites from npm run e2e:all', () => {
    expect(source).toContain("require('./tc-archive')");
    expect(source).toContain("require('./tc-debug-fill')");
    expect(source).toContain('runArchiveTests');
    expect(source).toContain('runDebugFillTests');
    expect(source).toContain('for (const { label, mod, run } of suites)');
    expect(source).toContain('const { failed } = await run(page)');
  });

  it('keeps debug-fill player creation on the shared helper', () => {
    // Match through the first unindented closing brace, which marks the end
    // of a top-level async function in the repo's standard JS formatting.
    const createPlayersMatch = debugFillSource.match(/async function createPlayers[\s\S]*?^}/m);
    if (!createPlayersMatch) throw new Error('createPlayers function not found');
    const createPlayersSource = createPlayersMatch[0];

    expect(createPlayersSource).toContain('apiCreatePlayer');
    expect(createPlayersSource).not.toContain('apiJson');
  });

  it('keeps focused suite failure counts numeric', () => {
    const archiveSource = fs.readFileSync(path.join(process.cwd(), 'e2e', 'tc-archive.js'), 'utf8');
    expect(archiveSource).toContain('const failedCount = countArchiveFailures(results)');
    expect(archiveSource).toContain('return { failed: failedCount }');
    expect(archiveSource).not.toContain('return { failed: failedCount > 0 }');

    const debugFillSource = fs.readFileSync(path.join(process.cwd(), 'e2e', 'tc-debug-fill.js'), 'utf8');
    expect(debugFillSource).toContain('const failedCount = countDebugFillFailures(results)');
    expect(debugFillSource).toContain('return { failed: failedCount }');
    expect(debugFillSource).not.toContain('return { failed: failedCount > 0 }');
  });

  it('keeps retired TC-401/TC-402 comments in one language', () => {
    expect(source).toContain('// 旧軽量フルワークフローとGPダイアログUI確認は廃止済み。');
    expect(source).toContain('// TC-401/402 は上の共有4モード大会と総合ランキング検証に再利用。');
    expect(source).not.toContain('Legacy lightweight full-workflow and GP dialog UI checks were retired.');
  });

  it('keeps archive qualification fetch isolation behavior contract', async () => {
    const archiveSource = fs.readFileSync(path.join(process.cwd(), 'e2e', 'tc-archive.js'), 'utf8');
    if (archiveSource.includes('function assertQualificationFetchesStartInParallel(')) {
      const targetPage = {
        bringToFront: jest.fn(async () => undefined),
        goto: jest.fn(async () => undefined),
        waitForFunction: jest.fn(async () => undefined),
        close: jest.fn(async () => undefined),
      };
      const newPage = jest.fn(async () => targetPage);
      const rootPage = {
        context: jest.fn(() => ({ newPage })),
        goto: jest.fn(async () => undefined),
      };

      const { assertQualificationFetchesStartInParallel } = requireFromApp('./e2e/tc-archive');
      expect(typeof assertQualificationFetchesStartInParallel).toBe('function');

      expect(rootPage.context).not.toHaveBeenCalled();
      await expect(assertQualificationFetchesStartInParallel(rootPage, 'tournament-1', 'ta'))
        .resolves.toBe(0);
      expect(rootPage.context).toHaveBeenCalled();
      expect(newPage).toHaveBeenCalled();
      expect(targetPage.bringToFront).toHaveBeenCalled();
      expect(targetPage.close).toHaveBeenCalled();
    } else {
      throw new Error('assertQualificationFetchesStartInParallel must be exported from tc-archive.js');
    }
  });

  it('registers auth error and web vitals preview checks for TC-2070', () => {
    expect(source).toContain("log('TC-2070A'");
    expect(source).toContain('/auth/error?error=');
    expect(source).toContain('CredentialsSignin');
    expect(source).toContain('NotWhitelisted');
    expect(source).toContain('tc2070AFailures');
    expect(source).toContain('hasSafeCopy=${hasSafeCopy}');
    expect(source).toContain('hasRecoveryLinks=${hasRecoveryLinks}');

    expect(source).toContain("log('TC-2070B'");
    expect(source).toContain('/api/internal/vitals');
    expect(source).toContain("navigationType: 'navigate'");
    expect(source).toContain('vitalsStatus === 204');
  });

  it('reports all TC-939 tab navigation failure reasons', () => {
    const { describeTc939TabNavigation } = requireFromApp('./e2e/lib/tc939-reporting');

    expect(describeTc939TabNavigation({
      spaMarker: null,
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload / Hydrated tab className contains extra whitespace',
    });

    expect(source).toContain('describeTc939TabNavigation({');
    expect(source).toContain('spaMarker: tc939Marker');
    expect(source).toContain('cleanClasses: tc939CleanClasses');
    expect(source).toContain("log('TC-939', tc939Result.status, tc939Result.detail)");
    expect(source).not.toMatch(/tc939Marker\s*!==\s*['"]alive['"][\s\S]{0,160}Tab click caused a full document reload/);
  });

  it('keeps TC-2127 documented as a stable TC-939 registration guard', () => {
    const section = e2eCaseSection('TC-2127');

    expect(section).toContain('issue #2127');
    expect(section).toContain('tc-all-registration.test.ts');
    expect(section).toContain('tc939-reporting');
    expect(section).toContain('改行・インデント');
  });
});
