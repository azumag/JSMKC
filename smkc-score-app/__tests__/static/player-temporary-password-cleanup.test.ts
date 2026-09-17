import fs from 'node:fs';
import path from 'node:path';

describe('player temporary password cleanup (issue #3653)', () => {
  const pageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/players/page.tsx'), 'utf8');

  it('centralizes password-dialog close handling and clears plaintext on close', () => {
    expect(pageSource).toContain('const handlePasswordDialogOpenChange = (open: boolean) => {');
    expect(pageSource).toContain('setIsPasswordDialogOpen(open);');
    expect(pageSource).toContain("if (!open) setTemporaryPassword('');");
  });

  it('routes every password-dialog close path through the cleanup handler', () => {
    expect(pageSource).toContain('onOpenChange={handlePasswordDialogOpenChange}');
    expect(pageSource).toContain('handlePasswordDialogOpenChange(false)');
    expect(pageSource).not.toContain('onClick={() => setIsPasswordDialogOpen(false)}');
  });
});
