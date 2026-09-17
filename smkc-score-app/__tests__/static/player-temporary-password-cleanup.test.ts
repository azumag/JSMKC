import fs from 'node:fs';
import path from 'node:path';

describe('player temporary password cleanup (issue #3653)', () => {
  const pageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/players/page.tsx'), 'utf8');

  it('centralizes password-dialog close handling and clears plaintext on close', () => {
    expect(pageSource).toContain('const handlePasswordDialogOpenChange = (open: boolean) => {');
    expect(pageSource).toMatch(
      /const handlePasswordDialogOpenChange = \(open: boolean\) => \{[\s\S]*setIsPasswordDialogOpen\(open\);[\s\S]*if \(!open\) setTemporaryPassword\(''\);[\s\S]*\};/,
    );
  });

  it('routes overlay and Escape dismissals through the cleanup handler', () => {
    expect(pageSource).toContain('<Dialog open={isPasswordDialogOpen} onOpenChange={handlePasswordDialogOpenChange}>');
  });

  it('routes the explicit saved acknowledgement through the same cleanup handler', () => {
    expect(pageSource).toContain(
      "<Button onClick={() => handlePasswordDialogOpenChange(false)}>{t('savedIt')}</Button>",
    );
    expect(pageSource).not.toContain(
      "<Button onClick={() => setIsPasswordDialogOpen(false)}>{t('savedIt')}</Button>",
    );
  });
});
