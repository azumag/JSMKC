import { execFileSync } from 'child_process';
import path from 'path';

describe('temporary Prisma 7 probe formatter diagnostic', () => {
  it('prints the canonical Prettier output', () => {
    const filePath = path.resolve(__dirname, '..', '..', 'scripts', 'prisma-v7-removed-surfaces.cjs');
    const prettierPath = path.resolve(__dirname, '..', '..', 'node_modules', 'prettier', 'bin', 'prettier.cjs');
    const formatted = execFileSync(
      process.execPath,
      [prettierPath, filePath, '--parser', 'babel', '--print-width', '120', '--single-quote', '--trailing-comma', 'all'],
      { encoding: 'utf8' },
    );

    console.log(`PRISMA_V7_FORMAT_START\n${formatted}PRISMA_V7_FORMAT_END`);
  });
});
