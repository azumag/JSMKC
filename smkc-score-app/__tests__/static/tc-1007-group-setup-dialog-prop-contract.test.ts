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
    const disabledButtonSection = e2eCaseSection('TC-1680');
    const secondaryButtonSection = e2eCaseSection('TC-1682');

    expect(section).toContain('issue #1007');
    expect(section).toContain('GroupSetupDialog');
    expect(section).toContain('groupCount');
    expect(followupSection).toContain('issue #1678');
    expect(followupSection).toContain('setGroupCount');
    expect(disabledButtonSection).toContain('issue #1680');
    expect(disabledButtonSection).toContain('disabled');
    expect(secondaryButtonSection).toContain('issue #1682');
    expect(secondaryButtonSection).toContain('variant="secondary"');
    expect(section).toContain('tc-1007-group-setup-dialog-prop-contract.test.ts');
  });

  it("TC-3010: keeps GroupSetupDialog's group count as its own internal state, not a prop, while making it selectable (2/3)", () => {
    // Issue #1007/#1678 removed a `groupCount`/`setGroupCount` prop pair the
    // dialog never needed the parent for; that part of the contract still
    // holds. TC-1680/1682's "disabled read-only display" was explicitly
    // scoped to "while 3+ groups are deferred" (see its own expected-results
    // note that a guard update would be needed if selectable UI came back) --
    // TC-3010 is that return, so this test now asserts the selector IS
    // clickable and toggles between 2 and 3, not the old disabled/secondary contract.
    const source = readRepoFile('smkc-score-app', 'src', 'components', 'tournament', 'group-setup-dialog.tsx');
    const props = sectionBetween(source, 'interface GroupSetupDialogProps {', 'export function GroupSetupDialog');
    const signature = sectionBetween(source, 'export function GroupSetupDialog({', '}: GroupSetupDialogProps)');

    expect(source).toContain('const GROUP_COUNT_OPTIONS = [2, 3] as const');
    expect(props).not.toContain('groupCount: number');
    expect(props).not.toContain('setGroupCount');
    expect(signature).not.toMatch(/\bgroupCount\b/);
    expect(signature).not.toMatch(/\bsetGroupCount\b/);

    const groupCountButton = sectionBetween(source, '{GROUP_COUNT_OPTIONS.map((n) => (', '</Button>');
    expect(groupCountButton).toContain('onClick={() => handleGroupCountChange(n)}');
    expect(groupCountButton).toContain('disabled={saving}');
    // default/outline (selected/unselected) signals an actionable toggle, not a read-only display
    expect(groupCountButton).toMatch(/variant={n === groupCount \? ['"]default['"] : ['"]outline['"]}/);
  });

  it.each(modeClients)('does not pass the removed groupCount prop from %s', (_mode, path) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const dialogUsage = sectionBetween(source, '<GroupSetupDialog', '/>');

    expect(dialogUsage).not.toContain('groupCount={groupCount}');
    expect(dialogUsage).not.toContain('setGroupCount={setGroupCount}');
    expect(source).not.toMatch(/\bsetGroupCount\b/);
  });
});
