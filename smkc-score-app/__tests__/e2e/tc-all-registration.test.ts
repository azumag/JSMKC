import fs from 'fs';
import path from 'path';

describe('tc-all focused suite registration', () => {
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

  it('registers auth error and web vitals preview checks for TC-2070', () => {
    expect(source).toContain("log('TC-2070A'");
    expect(source).toContain('/auth/error?error=');
    expect(source).toContain('CredentialsSignin');
    expect(source).toContain('NotWhitelisted');

    expect(source).toContain("log('TC-2070B'");
    expect(source).toContain('/api/internal/vitals');
    expect(source).toContain('vitalsStatus === 204');
  });
});
