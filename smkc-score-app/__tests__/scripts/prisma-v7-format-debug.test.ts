import { execFileSync } from 'child_process';
import path from 'path';

describe('temporary Prisma 7 probe formatter diagnostic', () => {
  it('prints the canonical Prettier diff', () => {
    const appRoot = path.resolve(__dirname, '..', '..');
    const filePath = path.resolve(appRoot, 'scripts', 'prisma-v7-removed-surfaces.cjs');
    const prettierPath = path.resolve(appRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

    execFileSync(process.execPath, [prettierPath, '--write', filePath], { encoding: 'utf8' });
    const diff = execFileSync('git', ['diff', '--', filePath], {
      cwd: path.resolve(appRoot, '..'),
      encoding: 'utf8',
    });

    throw new Error(`PRISMA_V7_FORMAT_DIFF\n${diff}`);
  });
});
