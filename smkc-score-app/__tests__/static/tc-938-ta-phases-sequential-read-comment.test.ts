import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-938 TA phases sequential read comment', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'app', 'api', 'tournaments', '[id]', 'ta', 'phases', 'route.ts');

  it('documents why phase detail reads stay sequential', () => {
    expect(source).toContain('D1 concurrent fan-out');
    expect(source).toContain('request-hung');
    expect(source).toContain('latency trade-off');
    expect(source).toContain('const entries = await retryDbRead');
    expect(source).toContain('const rounds = await retryDbRead');
    expect(source).toContain('const playedCourses = await retryDbRead');
  });
});
