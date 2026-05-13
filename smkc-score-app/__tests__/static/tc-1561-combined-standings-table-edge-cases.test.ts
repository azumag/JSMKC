import { e2eCaseSection } from '../helpers/e2e-cases';

describe('TC-1561 combined standings table edge cases', () => {
  it('documents the zero-points and empty-rankings coverage', () => {
    const section = e2eCaseSection('TC-1561');

    expect(section).toContain('issue #1561');
    expect(section).toContain('points: 0');
    expect(section).toContain('+0');
    expect(section).toContain('rankings={[]}');
    expect(section).toContain('combined-standings-table.test.tsx');
  });
});
