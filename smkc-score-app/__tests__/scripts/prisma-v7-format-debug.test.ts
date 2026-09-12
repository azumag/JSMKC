import fs from 'fs';
import path from 'path';
import { format } from 'prettier';

describe('temporary Prisma 7 probe formatter diagnostic', () => {
  it('prints the canonical Prettier output', async () => {
    const filePath = path.resolve(__dirname, '..', '..', 'scripts', 'prisma-v7-removed-surfaces.cjs');
    const source = fs.readFileSync(filePath, 'utf8');
    const formatted = await format(source, {
      parser: 'babel',
      printWidth: 120,
      singleQuote: true,
      trailingComma: 'all',
    });

    console.log(`PRISMA_V7_FORMAT_START\n${formatted}PRISMA_V7_FORMAT_END`);
  });
});
