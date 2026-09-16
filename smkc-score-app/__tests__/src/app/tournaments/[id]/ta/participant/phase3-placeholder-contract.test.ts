import fs from 'node:fs';
import path from 'node:path';

function appRoot(): string {
  const cwd = process.cwd();
  return fs.existsSync(path.join(cwd, 'src')) ? cwd : path.join(cwd, 'smkc-score-app');
}

describe('TA participant Phase 3 time placeholder contract', () => {
  it('reuses the canonical next-intl time placeholder', () => {
    const root = appRoot();
    const source = fs.readFileSync(
      path.join(root, 'src/app/tournaments/[id]/ta/participant/page.tsx'),
      'utf8',
    );
    const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8')) as {
      ta: { timePlaceholder: string };
    };
    const ja = JSON.parse(fs.readFileSync(path.join(root, 'messages/ja.json'), 'utf8')) as {
      ta: { timePlaceholder: string };
    };

    expect(source).toContain("placeholder={tTa('timePlaceholder')}");
    expect(source).not.toContain('placeholder="M:SS.mm"');
    expect(en.ta.timePlaceholder).toBe('M:SS.mm');
    expect(ja.ta.timePlaceholder).toBe(en.ta.timePlaceholder);
  });
});
