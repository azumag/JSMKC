import { readRepoFile } from '../helpers/e2e-cases';

describe('retryDbRead type contract', () => {
  it('keeps the public overload generic instead of widening typed operations to any', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'db-read-retry.ts');

    expect(source).toContain(
      'export async function retryDbRead<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;',
    );
    expect(source).not.toMatch(/retryDbRead\s*\(\s*operation:\s*\(\)\s*=>\s*Promise<any>/);
  });
});
