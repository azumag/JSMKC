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
    for (const script of ['tc-archive.js', 'tc-debug-fill.js']) {
      const scriptSource = fs.readFileSync(path.join(process.cwd(), 'e2e', script), 'utf8');
      expect(scriptSource).toContain('return { failed: failed.length }');
      expect(scriptSource).not.toContain('return { failed: failed.length > 0 }');
    }
  });
});
