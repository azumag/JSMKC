import fs from 'fs';
import path from 'path';

describe('tc-all focused suite registration', () => {
  const sourcePath = path.join(process.cwd(), 'e2e', 'tc-all.js');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('runs archive and debug-fill focused suites from npm run e2e:all', () => {
    expect(source).toContain("require('./tc-archive')");
    expect(source).toContain("require('./tc-debug-fill')");
    expect(source).toContain('runArchiveTests');
    expect(source).toContain('runDebugFillTests');
  });
});
