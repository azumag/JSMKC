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

  it('fails when an explicit comment anchor start marker is missing', () => {
    const source = `
      it('orphan test', () => {});
      // [TC-2041-TC109-DRIFT-GUARD-END]
    `;

    expect(() =>
      sectionBetween(
        source,
        '// [TC-2041-TC109-DRIFT-GUARD-START]',
        '// [TC-2041-TC109-DRIFT-GUARD-END]',
      ),
    ).toThrow('section start marker not found: "// [TC-2041-TC109-DRIFT-GUARD-START]"');
  });

  it('allows terminal sections when an end marker is intentionally absent', () => {
    const source = `
      expect(previousSection).toContain('unrelated previous section');
      // [TC-2055-TERMINAL-SECTION-START]
      expect(section).toContain('terminal guard body');
    `;

    const section = sectionBetween(
      source,
      '// [TC-2055-TERMINAL-SECTION-START]',
      '// [TC-2055-TERMINAL-SECTION-END]',
      { allowTerminal: true },
    );

    expect(section).toContain("expect(section).toContain('terminal guard body')");
    expect(section).not.toContain('unrelated previous section');
  });

  it('fails when an allowed terminal section has no content after the start marker', () => {
    const source = '// [TC-2055-EMPTY-TERMINAL-SECTION-START]';

    expect(() =>
      sectionBetween(
        source,
        '// [TC-2055-EMPTY-TERMINAL-SECTION-START]',
        '// [TC-2055-EMPTY-TERMINAL-SECTION-END]',
        { allowTerminal: true },
      ),
    ).toThrow(
      'terminal section for marker "// [TC-2055-EMPTY-TERMINAL-SECTION-START]" has no content',
    );
  });

  it('fails when an allowed terminal section has only whitespace content', () => {
    const source = '// [TC-2058-WHITESPACE-TERMINAL-SECTION-START]\n   \n\t';

    expect(() =>
      sectionBetween(
        source,
        '// [TC-2058-WHITESPACE-TERMINAL-SECTION-START]',
        '// [TC-2058-WHITESPACE-TERMINAL-SECTION-END]',
        { allowTerminal: true },
      ),
    ).toThrow(
      'terminal section for marker "// [TC-2058-WHITESPACE-TERMINAL-SECTION-START]" has no content',
    );
  });

  it('fails when an allowed terminal section has only tab content', () => {
    const source = '// [TC-2058-TAB-WHITESPACE-TERMINAL-SECTION-START]\n\t\n\t';

    expect(() =>
      sectionBetween(
        source,
        '// [TC-2058-TAB-WHITESPACE-TERMINAL-SECTION-START]',
        '// [TC-2058-TAB-WHITESPACE-TERMINAL-SECTION-END]',
        { allowTerminal: true },
      ),
    ).toThrow(
      'terminal section for marker "// [TC-2058-TAB-WHITESPACE-TERMINAL-SECTION-START]" has no content',
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

  it('extracts code after a block comment using a code boundary instead of a comment end-marker', () => {
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

  it('uses the first matching block comment when markers repeat', () => {
    const source = `
      /**
       * Keep these reads sequential.
       */
      const firstEntries = await retryDbRead(readEntries);
      const firstRounds = await retryDbRead(readRounds);
      const firstBoundary = firstRounds.map(normalizePhaseRound);

      /**
       * Keep these reads sequential.
       */
      const secondEntries = await retryDbRead(readEntries);
      const secondBoundary = secondEntries.map(normalizePhaseRound);
    `;

    const block = sectionAfterBlockComment(
      source,
      'Keep these reads sequential',
      'const firstBoundary =',
    );

    expect(block).toContain('const firstEntries = await retryDbRead(readEntries)');
    expect(block).toContain('const firstRounds = await retryDbRead(readRounds)');
    expect(block).not.toContain('const secondEntries = await retryDbRead(readEntries)');
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
