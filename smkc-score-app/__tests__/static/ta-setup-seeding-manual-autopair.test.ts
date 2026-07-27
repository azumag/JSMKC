import { readRepoFile } from '../helpers/e2e-cases';

/**
 * Regression test for the TA (§3.1) setup dialog seeding input.
 *
 * Prior to this fix, typing into a seeding <Input> immediately recomputed
 * snake pairs for every seeded entry (applyAutoPairsToSetup), silently
 * overwriting any partner the admin had already picked manually via the
 * per-row partner <select>. Pairing must only be (re)computed when the
 * admin explicitly clicks the "Auto Pair" button.
 */
describe('TA setup dialog: seeding edits do not auto-trigger pairing', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');

  it('calls applyAutoPairsToSetup only from the import and the explicit Auto Pair handler', () => {
    const occurrences = source.split('applyAutoPairsToSetup').length - 1;
    // import + handleAutoPair body = 2. A 3rd occurrence would mean some
    // other callback (e.g. the seeding input's onChange) is auto-pairing.
    expect(occurrences).toBe(2);
  });

  it('updates only the edited entry\'s seeding field from the seeding input onChange', () => {
    const seedingOnChange = source.slice(
      source.indexOf('aria-label={`${player?.nickname ?? s.playerId} seeding`}') - 800,
      source.indexOf('aria-label={`${player?.nickname ?? s.playerId} seeding`}'),
    );
    expect(seedingOnChange).toMatch(
      /setSetupEntries\(\(prev\)\s*=>\s*\n?\s*prev\.map\(\(p\)\s*=>\s*\(p\.playerId === s\.playerId \? \{ \.\.\.p, seeding \} : p\)\),?\s*\n?\s*\);/,
    );
    expect(seedingOnChange).not.toContain('applyAutoPairsToSetup');
  });

  it('keeps the explicit Auto Pair button wired to handleAutoPair', () => {
    expect(source).toContain('onClick={handleAutoPair}');
    expect(source).toContain('const handleAutoPair = () => {\n    setSetupEntries((prev) => applyAutoPairsToSetup(prev));\n  };');
  });

  /**
   * Since pairing no longer recomputes on every keystroke, nothing else
   * flags a seeded entry that was never paired (manually or via the
   * button) before Save. Surface a non-blocking hint instead of silently
   * allowing it — blocking Save outright would also reject the legitimate
   * odd-seeded-entry-count case, where one entry is unpaired by design.
   */
  it('shows a non-blocking hint (not a Save-blocking validation) when seeded entries have no partner', () => {
    expect(source).toMatch(/unpairedSeededCount/);
    expect(source).toContain("t('unpairedSeedingWarning'");
    // The hint must not gate handleSaveSetup / the Save button.
    const saveButtonBlock = source.slice(source.indexOf('const handleSaveSetup ='), source.indexOf('const handleSaveSetup =') + 200);
    expect(saveButtonBlock).not.toContain('unpairedSeededCount');
  });
});
