import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-1047 Top-24 preview logging and type contract', () => {
  const source = readRepoFile(
    'smkc-score-app',
    'src',
    'lib',
    'api-factories',
    'finals-route.ts',
  );

  it('keeps the preview fallback catch observable with structured context', () => {
    expect(source).toContain('Failed to build Top-24 finals preview');
    expect(source).toContain('tournamentId');
    expect(source).toContain('eventTypeCode: config.eventTypeCode');
    expect(source).toContain('error');
  });

  it('keeps Top-24 preview inputs typed instead of falling back to any/unknown', () => {
    expect(source).toContain('interface Top24FinalsPreviewMatch');
    expect(source).toContain('interface Top24FinalsQualification');
    expect(source).toContain('playoffMatches: Top24FinalsPreviewMatch[]');
    expect(source).not.toContain('playoffMatches: any[]');
    expect(source).not.toContain('player: unknown; group: string');
  });
});
