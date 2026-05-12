import fs from 'fs';
import path from 'path';

const pagePath = path.join(
  process.cwd(),
  'src',
  'app',
  'tournaments',
  '[id]',
  'gp',
  'finals',
  'page.tsx',
);

describe('GP finals page source', () => {
  it('uses the shared GP max-cups helper directly for locked cup-form counts', () => {
    const source = fs.readFileSync(pagePath, 'utf8');

    expect(source).toContain('getGpFinalsMaxCups');
    expect(source).not.toContain('getLockedCupCountForMatch');
    expect(source.match(/getGpFinalsMaxCups\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
