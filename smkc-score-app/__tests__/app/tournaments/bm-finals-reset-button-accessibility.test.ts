import fs from 'fs';

const pagePath = 'src/app/tournaments/[id]/bm/finals/page.tsx';
const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8')) as {
  finals: { resetBracket: string };
};
const ja = JSON.parse(fs.readFileSync('messages/ja.json', 'utf8')) as {
  finals: { resetBracket: string };
};

describe('BM finals reset button accessible name', () => {
  it('uses the localized finals reset label instead of a fixed English aria-label', () => {
    const source = fs.readFileSync(pagePath, 'utf8');

    expect(source).toContain("aria-label={tFinals('resetBracket')}");
    expect(source).toContain("{tFinals('resetBracket')}");
    expect(source).not.toContain('aria-label="Reset finals bracket"');
  });

  it('defines distinct English and Japanese reset labels', () => {
    expect(en.finals.resetBracket).toBeTruthy();
    expect(ja.finals.resetBracket).toBeTruthy();
    expect(ja.finals.resetBracket).not.toBe(en.finals.resetBracket);
  });
});
