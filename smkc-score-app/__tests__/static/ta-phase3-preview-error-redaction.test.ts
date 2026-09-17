import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('TA Phase 3 preview error redaction contract (issue #3614)', () => {
  it('shows the translated preview error and logs the original preview exception', () => {
    const source = read('src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx');

    expect(source).toContain("logger.error('Failed to build TA phase3 submission preview:'");
    expect(source).toContain("setSaveError(tTaFinals('previewError'));");
    expect(source).not.toContain(
      "setSaveError(previewError instanceof Error ? previewError.message : tTaFinals('previewError'));",
    );
  });
});
