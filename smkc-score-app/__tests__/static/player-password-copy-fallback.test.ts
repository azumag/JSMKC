import fs from 'node:fs';
import path from 'node:path';

describe('player temporary password copy fallback (issue #3651)', () => {
  const pageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/players/page.tsx'), 'utf8');

  it('uses an async clipboard handler instead of an unhandled inline write', () => {
    expect(pageSource).toContain('const handleCopyTemporaryPassword = async () => {');
    expect(pageSource).toContain('await navigator.clipboard.writeText(temporaryPassword);');
    expect(pageSource).toContain('onClick={() => void handleCopyTemporaryPassword()}');
    expect(pageSource).not.toContain('navigator.clipboard.writeText(temporaryPassword);\n                  }}');
  });

  it('selects the read-only password input when the Clipboard API is unavailable', () => {
    expect(pageSource).toContain("document.getElementById('temporary-password') as HTMLInputElement | null");
    expect(pageSource).toContain('input.focus();');
    expect(pageSource).toContain('input.select();');
    expect(pageSource).toContain('if (!navigator.clipboard?.writeText) {');
    expect(pageSource).toContain('selectTemporaryPassword();');
    expect(pageSource).toContain('id="temporary-password"');
  });

  it('catches clipboard rejection, logs details, and uses the same fallback', () => {
    expect(pageSource).toContain("logger.error('Failed to copy temporary password', metadata);");
    expect(pageSource).toMatch(
      /catch \(err\) \{[\s\S]*logger\.error\('Failed to copy temporary password', metadata\);[\s\S]*selectTemporaryPassword\(\);/,
    );
  });
});
