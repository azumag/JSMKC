import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-2145 qualification route mock match naming', () => {
  const source = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'qualification-route.test.ts',
  );

  it('does not use unused-variable-style names for referenced mock matches', () => {
    expect(source).toContain('const mockMatch =');
    expect(source).toContain('const mockPlayer1Matches = [mockMatch];');
    expect(source).toContain('const mockPlayer2Matches = [mockMatch];');
    expect(source).not.toContain('_mockMatch');
  });
});
