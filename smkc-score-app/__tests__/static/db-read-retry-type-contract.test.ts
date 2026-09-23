import { readRepoFile } from '../helpers/e2e-cases';

describe('retryDbRead type contract', () => {
  it('keeps ordinary Promise<T> operations generic while isolating Prisma compatibility', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'db-read-retry.ts');

    expect(source).toContain(
      'export async function retryDbRead<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;',
    );
    expect(source).toContain(
      'export async function retryDbRead(operation: () => Prisma.PrismaPromise<any>, options?: RetryOptions): Promise<any>;',
    );
    expect(source).not.toMatch(/retryDbRead\s*\(\s*operation:\s*\(\)\s*=>\s*Promise<any>/);
  });
});
