import { readRepoFile } from '../helpers/e2e-cases';

const targets = [
  {
    label: 'TA admin qualification page',
    path: ['src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx'],
    translationCall: "t('timeInputTitle')",
  },
  {
    label: 'TA participant page',
    path: ['src', 'app', 'tournaments', '[id]', 'ta', 'participant', 'page.tsx'],
    translationCall: "tTa('timeInputTitle')",
  },
  {
    label: 'TA finals phase 3 page',
    path: ['src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx'],
    translationCall: "tTaFinals('timeInputTitle')",
  },
  {
    label: 'TA elimination phase component',
    path: ['src', 'components', 'tournament', 'ta-elimination-phase.tsx'],
    translationCall: "tElim('timeInputTitle')",
  },
] as const;

const memoizedRowTargets = [
  {
    label: 'TA participant row component',
    path: ['src', 'components', 'tournament', 'ta-participant-time-input-row.tsx'],
    componentName: 'TaParticipantTimeInputRow',
  },
  {
    label: 'TA time entry row component (shared by finals and elimination phases)',
    path: ['src', 'components', 'tournament', 'ta-time-entry-row.tsx'],
    componentName: 'TaTimeEntryRow',
  },
] as const;

describe('TA time input props memoization', () => {
  it.each(targets)('memoizes getTaTimeInputProps in $label', ({ path, translationCall }) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const memoizedDeclaration = new RegExp(
      `const\\s+taTimeInputProps\\s*=\\s*useMemo\\(\\s*\\(\\)\\s*=>\\s*getTaTimeInputProps\\(\\s*${escapeRegExp(translationCall)}\\s*\\),\\s*\\[[^\\]]+\\]\\s*\\)`,
      's',
    );

    expect(source).toMatch(/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from ['"]react['"]/s);
    expect(source).toMatch(memoizedDeclaration);
    expect(source).toContain('Input is a native element, so this does not skip rendering by reference equality.');
    expect(source).toContain('avoids rebuilding identical spread props during polling refreshes.');
  });
});

describe('TA row component memo wrapping', () => {
  it.each(memoizedRowTargets)(
    'wraps row component with React.memo in $label',
    ({ path, componentName }) => {
      const source = readRepoFile('smkc-score-app', ...path);
      const memoDeclaration = new RegExp(
        `export\\s+const\\s+${componentName}\\s*=\\s*memo\\(\\s*function\\s+${componentName}\\b`,
        's',
      );

      expect(source).toMatch(memoDeclaration);
    },
  );
});

describe('TA time input prop type alias', () => {
  it('exports one shared TaTimeInputProps alias for TA row components', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'time-entry-layout.ts');

    expect(source).toContain('export type TaTimeInputProps');
    expect(source).toContain('Partial<ComponentPropsWithoutRef<typeof Input>>');
  });

  it.each(memoizedRowTargets)(
    'uses the shared TaTimeInputProps alias in $label',
    ({ path }) => {
      const source = readRepoFile('smkc-score-app', ...path);

      expect(source).toMatch(/type\s+TaTimeInputProps\b/);
      expect(source).toContain('timeInputProps: TaTimeInputProps');
      expect(source).not.toContain('timeInputProps: Partial<ComponentPropsWithoutRef<typeof Input>>');
    },
  );
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
