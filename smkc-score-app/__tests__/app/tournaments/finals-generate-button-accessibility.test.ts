import fs from 'fs';

const pagePaths = [
  'src/app/tournaments/[id]/bm/finals/page.tsx',
  'src/app/tournaments/[id]/mr/finals/page.tsx',
] as const;

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8')) as {
  finals: { generateBracket: string };
};
const ja = JSON.parse(fs.readFileSync('messages/ja.json', 'utf8')) as {
  finals: { generateBracket: string };
};

describe('BM/MR finals generate button accessible name', () => {
  it.each(pagePaths)('%s uses the localized finals label as its stable accessible name', (pagePath) => {
    const source = fs.readFileSync(pagePath, 'utf8');

    expect(source).toContain("aria-label={tFinals('generateBracket')}");
    expect(source).toContain("creating ? tFinals('creating') : tFinals('generateBracket')");
    expect(source).not.toContain('aria-label="Generate finals bracket"');
  });

  it('defines distinct English and Japanese generate labels', () => {
    expect(en.finals.generateBracket).toBeTruthy();
    expect(ja.finals.generateBracket).toBeTruthy();
    expect(ja.finals.generateBracket).not.toBe(en.finals.generateBracket);
  });
});
