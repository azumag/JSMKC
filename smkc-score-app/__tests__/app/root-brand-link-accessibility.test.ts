import fs from 'fs';

const source = fs.readFileSync('src/app/layout.tsx', 'utf8');

describe('root header brand link accessible name', () => {
  it('uses the visible language-neutral SMKC label instead of a fixed English aria-label', () => {
    expect(source).toContain('href="/"');
    expect(source).toMatch(/>\s*SMKC\s*<\/Link>/);
    expect(source).not.toContain('aria-label="SMKC home"');
  });
});
