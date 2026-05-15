import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

const modeClients = [
  ['BM', ['src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx']],
  ['MR', ['src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx']],
  ['GP', ['src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx']],
] as const;

describe('TC-1007 GroupSetupDialog prop contract', () => {
  it('documents the unused groupCount prop removal scenario', () => {
    const section = e2eCaseSection('TC-1007');
    const followupSection = e2eCaseSection('TC-1678');

    expect(section).toContain('issue #1007');
    expect(section).toContain('GroupSetupDialog');
    expect(section).toContain('groupCount');
    expect(followupSection).toContain('issue #1678');
    expect(followupSection).toContain('setGroupCount');
    expect(section).toContain('tc-1007-group-setup-dialog-prop-contract.test.ts');
  });

  it('keeps GroupSetupDialog controlled by its own locked group count', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'components',
      'tournament',
      'group-setup-dialog.tsx',
    );
    const props = sectionBetween(source, 'interface GroupSetupDialogProps {', 'export function GroupSetupDialog');
    const signature = sectionBetween(source, 'export function GroupSetupDialog({', '}: GroupSetupDialogProps)');

    expect(source).toContain('const LOCKED_GROUP_COUNT = 2');
    expect(props).not.toContain('groupCount: number');
    expect(props).not.toContain('setGroupCount');
    expect(signature).not.toMatch(/\bgroupCount\b/);
    expect(signature).not.toMatch(/\bsetGroupCount\b/);
    expect(source).not.toContain('setGroupCount(LOCKED_GROUP_COUNT)');
  });

  it.each(modeClients)('does not pass the removed groupCount prop from %s', (_mode, path) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const dialogUsage = sectionBetween(source, '<GroupSetupDialog', '/>');

    expect(dialogUsage).not.toContain('groupCount={groupCount}');
    expect(dialogUsage).not.toContain('setGroupCount={setGroupCount}');
    expect(source).not.toMatch(/\bsetGroupCount\b/);
  });
});
