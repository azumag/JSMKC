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

  it('rejects defaulted top-level require destructuring bindings', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        const { require = fallbackRequire } = runtime;
        const { loader: require = fallbackRequire } = runtime;
        const [require = fallbackRequire] = loaders;
      `),
    ).toEqual([
      { line: 2, kind: 'binding' },
      { line: 3, kind: 'binding' },
      { line: 4, kind: 'binding' },
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

  it('rejects import, function, generator, and class bindings named require', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        import { load as require } from './loader';
        function require() {}
        function* require() {}
        export default async function* require() {}
        class require {}
      `),
    ).toEqual([
      { line: 2, kind: 'binding' },
      { line: 3, kind: 'binding' },
      { line: 4, kind: 'binding' },
      { line: 5, kind: 'binding' },
      { line: 6, kind: 'binding' },
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

  it('rejects bare require assignments inside braced module control flow', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        if (useFakeLoader) {
          require = fakeRequire;
        }
        try {
          require ||= fallbackRequire;
        } catch {}
      `),
    ).toEqual([
      { line: 3, kind: 'assignment' },
      { line: 6, kind: 'assignment' },
    ]);
  });

  it('rejects bare require assignments inside unbraced module control flow', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        if (useFakeLoader) require = fakeRequire;
        else require &&= fallbackRequire;
        for (const loader of loaders) require ??= loader;
        while (retry) require += fallbackRequire;
        do require = fakeRequire;
        while (retry);
      `),
    ).toEqual([
      { line: 2, kind: 'assignment' },
      { line: 3, kind: 'assignment' },
      { line: 4, kind: 'assignment' },
      { line: 5, kind: 'assignment' },
      { line: 6, kind: 'assignment' },
    ]);
  });

  it('rejects assignments in module-executed class static blocks but ignores method bodies', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        class Loader {
          static { require = fakeRequire; }
          method() { require = methodRequire; }
          static method() { require = staticMethodRequire; }
        }
      `),
    ).toEqual([{ line: 3, kind: 'assignment' }]);
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

  it('ignores require assignments inside nested function, arrow, and class method bodies', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        function buildLater() {
          require = fakeRequire;
        }
        const buildAgain = () => {
          require ||= fallbackRequire;
        };
        class Loader {
          method() { require = methodRequire; }
          static method() { require ??= staticMethodRequire; }
        }
      `),
    ).toEqual([]);
  });

  it('ignores member assignments and lexical lookalikes inside module control flow', () => {
    expect(
      findPrismaConfigRequireRebindings(`
        if (useFakeLoader) {
          loader.require = fakeRequire;
          const stringExample = 'require = fakeRequire';
          const regexExample = /require\\s*=/;
          // require = fakeRequire;
        }
      `),
    ).toEqual([]);
  });

  it('keeps the repository prisma.config.ts free of module-scope require rebindings', () => {
    const prismaConfigPath = path.join(process.cwd(), 'prisma.config.ts');
    const source = fs.readFileSync(prismaConfigPath, 'utf8');

    expect(findPrismaConfigRequireRebindings(source)).toEqual([]);
  });
});
