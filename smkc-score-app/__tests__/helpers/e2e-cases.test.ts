import {
  callExpressionWithArguments,
  sectionAfterBlockComment,
  sectionBetween,
} from './e2e-cases';

describe('E2E case helpers', () => {
  it('extracts sections using explicit comment anchors', () => {
    const source = `
      // [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]
      it('can be renamed safely', () => {
        expect(true).toBe(true);
      });
      // [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]
      it('neighboring test can move', () => {});
    `;

    const section = sectionBetween(
      source,
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]',
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]',
    );

    expect(section).toContain("it('can be renamed safely'");
    expect(section).not.toContain('neighboring test can move');
  });

  it('fails when an explicit comment anchor end marker is missing', () => {
    const source = `
      // [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]
      it('can be renamed safely', () => {});
    `;

    expect(() => sectionBetween(
      source,
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]',
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]',
    )).toThrow(
      'section end marker not found after "// [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]": "// [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]"',
    );
  });

  it('finds required arguments on the same call expression', () => {
    const source = `
      throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS);
      throwUnexpectedMockCall('dialog.locator', selector, EXPECTED_SELECTORS);
    `;

    expect(callExpressionWithArguments(source, 'throwUnexpectedMockCall', [
      "'page.getByRole'",
      'roleLookup(_role, name)',
      'EXPECTED_PAGE_ROLE_LOOKUPS',
    ])).toContain('roleLookup(_role, name)');
  });

  it('rejects required arguments split across different calls', () => {
    const source = `
      throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_SELECTORS);
      throwUnexpectedMockCall('dialog.locator', selector, EXPECTED_PAGE_ROLE_LOOKUPS);
    `;

    expect(() => callExpressionWithArguments(source, 'throwUnexpectedMockCall', [
      "'page.getByRole'",
      'roleLookup(_role, name)',
      'EXPECTED_PAGE_ROLE_LOOKUPS',
    ])).toThrow(
      "call expression not found: throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS)",
    );
  });

  it('extracts code after a block comment without requiring a comment boundary marker', () => {
    const source = `
      /**
       * Keep these reads sequential.
       */
      const entries = await retryDbRead(readEntries);
      const rounds = await retryDbRead(readRounds);
      const normalizedRounds = rounds.map(normalizePhaseRound);
    `;

    const block = sectionAfterBlockComment(
      source,
      'Keep these reads sequential',
      'const normalizedRounds =',
    );

    expect(block).toContain('const entries = await retryDbRead(readEntries)');
    expect(block).toContain('const rounds = await retryDbRead(readRounds)');
    expect(block).not.toContain('Keep these reads sequential');
    expect(block).not.toContain('const normalizedRounds =');
  });

  it('fails clearly when the post-comment section boundary is missing', () => {
    const source = `
      /**
       * Keep these reads sequential.
       */
      const entries = await retryDbRead(readEntries);
    `;

    expect(() =>
      sectionAfterBlockComment(source, 'Keep these reads sequential', 'const normalizedRounds ='),
    ).toThrow(
      'section end marker not found after "Keep these reads sequential": "const normalizedRounds ="',
    );
  });
});
