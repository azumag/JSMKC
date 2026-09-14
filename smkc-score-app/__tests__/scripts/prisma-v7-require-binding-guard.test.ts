import fs from 'node:fs';
import path from 'node:path';

import { findPrismaConfigRequireRebindings } from '../../scripts/prisma-v7-require-binding-guard.cjs';

describe('Prisma 7 require binding guard', () => {
  it('rejects a top-level require variable binding', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        const require = () => ({ config() {} });
        require('dotenv').config();
      `),
    ).toEqual([{ line: 2, kind: 'binding' }]);
  });

  it('rejects top-level require destructuring bindings', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        const { loader: require } = runtime;
        const [require] = loaders;
      `),
    ).toEqual([
      { line: 2, kind: 'binding' },
      { line: 3, kind: 'binding' },
    ]);
  });

  it('does not confuse an object property named require with a require binding', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        const { require: localLoader } = runtime;
        localLoader('dotenv').config();
      `),
    ).toEqual([]);
  });

  it('rejects import, function, and class bindings named require', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        import { load as require } from './loader';
        function require() {}
        class require {}
      `),
    ).toEqual([
      { line: 2, kind: 'binding' },
      { line: 3, kind: 'binding' },
      { line: 4, kind: 'binding' },
    ]);
  });

  it('rejects a top-level bare require reassignment', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        require = fakeRequire;
        require('dotenv').config();
      `),
    ).toEqual([{ line: 2, kind: 'assignment' }]);
  });

  it('allows direct CommonJS require calls without rebinding the loader', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        const dotenv = require('dotenv');
        require('dotenv').config();
      `),
    ).toEqual([]);
  });

  it('ignores member require methods, comments, quoted examples, and nested helper bindings', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        loader.require('dotenv').config();
        // const require = fakeRequire;
        const example = \`const require = fakeRequire;\`;
        function buildLater() {
          const require = fakeRequire;
          require('dotenv').config();
        }
      `),
    ).toEqual([]);
  });

  it('keeps the repository prisma.config.ts free of top-level require rebindings', () => {
    const prismaConfigPath = path.join(process.cwd(), 'prisma.config.ts');
    const source = fs.readFileSync(prismaConfigPath, 'utf8');

    expect(findPrismaConfigRequireRebindings(source)).toEqual([]);
  });
});
