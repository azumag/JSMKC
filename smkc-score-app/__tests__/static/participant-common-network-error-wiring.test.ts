import fs from 'fs';
import path from 'path';

const participantPage = (mode: 'bm' | 'mr' | 'gp') =>
  fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'participant', 'page.tsx'),
    'utf8',
  );

describe('participant common network error wiring (issue #3638)', () => {
  it.each(['bm', 'mr', 'gp'] as const)('%s supplies common.networkError to the shared hook', (mode) => {
    const source = participantPage(mode);

    expect(source).toMatch(/useTranslations\(['"]common['"]\)/);
    expect(source).toMatch(/networkErrorMessage:\s*tCommon\(['"]networkError['"]\)/);
  });
});
