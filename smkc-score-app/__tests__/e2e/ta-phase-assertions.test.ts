import { assertTaPhaseSubmitAccepted } from '../../e2e/lib/ta-phase-assertions.ts';

describe('TA phase E2E assertions', () => {
  it('accepts a normal 200 response without a tie break', () => {
    expect(() => {
      assertTaPhaseSubmitAccepted(
        { status: 200, body: { data: { tieBreakRequired: false } } },
        'phase1 submit MC1',
      );
    }).not.toThrow();
  });

  it('reports non-200 submit responses as HTTP failures', () => {
    expect(() => {
      assertTaPhaseSubmitAccepted(
        { status: 500, body: { data: { tieBreakRequired: false } } },
        'phase1 submit MC1',
      );
    }).toThrow('phase1 submit MC1 HTTP 500');
  });

  it('reports 200 tie-break responses without calling them HTTP failures', () => {
    expect(() => {
      assertTaPhaseSubmitAccepted(
        { status: 200, body: { data: { tieBreakRequired: true } } },
        'phase1 submit MC1',
      );
    }).toThrow('phase1 submit MC1 unexpected tie');
  });
});
