import fs from 'node:fs';
import path from 'node:path';

const modes = ['bm', 'mr', 'gp'] as const;

function read(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

describe('qualification setup ownership contract', () => {
  const hookSource = read('src', 'lib', 'hooks', 'useQualificationSetup.ts');
  const dialogSource = read('src', 'components', 'tournament', 'group-setup-dialog.tsx');

  it('keeps transport, error classification, and duplicate-submit protection in the hook', () => {
    expect(hookSource).toContain("method: 'POST'");
    expect(hookSource).toContain('savingRef.current');
    expect(hookSource).toContain("kind: 'network'");
    expect(hookSource).toContain("kind: isValidation ? 'validation' : 'server'");
    expect(hookSource).not.toContain('alert(');
  });

  it('shows errors accessibly and prevents input changes while saving', () => {
    expect(dialogSource).toContain('role="alert"');
    expect(dialogSource).toContain('aria-live="assertive"');
    expect(dialogSource).toContain('if (!open && saving) return');
    expect(dialogSource).toContain('disabled={saving}');
  });

  it.each(modes)('%s delegates setup submission without closing on failure', (mode) => {
    const source = read('src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx');
    const handlerStart = source.indexOf('const handleSetup = async () => {');
    const handlerEnd = source.indexOf('\n  };', handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    const dialogStart = source.indexOf('<GroupSetupDialog');
    const dialogEnd = source.indexOf('/>', dialogStart);
    const dialogUsage = source.slice(dialogStart, dialogEnd);

    expect(source).toContain("import { useQualificationSetup } from '@/lib/hooks/useQualificationSetup'");
    expect(source).toContain(`mode: '${mode}'`);
    expect(handler).toContain('const result = await submitSetup(setupPlayers)');
    expect(handler).toContain('if (!result.ok) return');
    expect(handler).not.toContain('fetch(');
    expect(handler).not.toContain('alert(');
    expect(source).not.toContain('handleSetupFailure');
    expect(dialogUsage).toContain('error={setupError?.message ?? null}');
    expect(dialogUsage).toContain('onClearError={clearSetupError}');
  });
});
