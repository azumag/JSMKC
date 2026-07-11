import fs from 'node:fs';
import path from 'node:path';

const dialogSourcePath = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'ui', 'dialog.tsx');

describe('DialogContent viewport scrolling contract', () => {
  it('bounds every dialog to the viewport and enables vertical scrolling by default', () => {
    const source = fs.readFileSync(dialogSourcePath, 'utf8');
    const defaultClassName = source.match(/['"]paddock-modal[^'"\n]+['"]/)?.[0] ?? '';

    expect(defaultClassName).toContain('max-h-[90vh]');
    expect(defaultClassName).toContain('overflow-y-auto');
  });
});
