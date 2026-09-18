import fs from 'fs';

const source = fs.readFileSync('src/components/ui/update-indicator.tsx', 'utf8');

describe('UpdateIndicator client boundary', () => {
  it('declares use client before imports', () => {
    const directiveIndex = source.indexOf("'use client';");
    const firstImportIndex = source.indexOf('import ');

    expect(directiveIndex).toBeGreaterThanOrEqual(0);
    expect(firstImportIndex).toBeGreaterThan(directiveIndex);
  });

  it('does not describe React hooks as an implicit client boundary', () => {
    expect(source).not.toContain('implicitly require client-side execution');
  });
});
