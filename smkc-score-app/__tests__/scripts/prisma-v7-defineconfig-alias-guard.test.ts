import fs from 'node:fs';
import path from 'node:path';

import { findPrismaDefineConfigRealiases } from '../../scripts/prisma-v7-defineconfig-alias-guard.cjs';

describe('Prisma 7 defineConfig re-alias guard', () => {
  it('rejects a top-level ESM named defineConfig re-alias', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        import { defineConfig } from 'prisma/config';
        const makeConfig = defineConfig;
      `),
    ).toEqual([{ line: 3, alias: 'makeConfig', source: 'defineConfig' }]);
  });

  it('rejects a top-level CommonJS named defineConfig re-alias', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        const { defineConfig: makePrismaConfig } = require('prisma/config');
        let delegatedConfig = makePrismaConfig;
      `),
    ).toEqual([{ line: 3, alias: 'delegatedConfig', source: 'makePrismaConfig' }]);
  });

  it('rejects an ESM namespace defineConfig re-alias', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        import * as prismaConfig from 'prisma/config';
        export const makeConfig = prismaConfig.defineConfig;
      `),
    ).toEqual([{ line: 3, alias: 'makeConfig', source: 'prismaConfig.defineConfig' }]);
  });

  it('rejects a CommonJS namespace defineConfig re-alias', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        const prismaConfig = require('prisma/config');
        const makeConfig = prismaConfig.defineConfig;
      `),
    ).toEqual([{ line: 3, alias: 'makeConfig', source: 'prismaConfig.defineConfig' }]);
  });

  it('rejects transitive alias chains', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        import { defineConfig } from 'prisma/config';
        const firstConfig = defineConfig;
        const secondConfig = firstConfig;
      `),
    ).toEqual([
      { line: 3, alias: 'firstConfig', source: 'defineConfig' },
      { line: 4, alias: 'secondConfig', source: 'firstConfig' },
    ]);
  });

  it('ignores nested helper aliases that are not top-level bindings', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        import { defineConfig } from 'prisma/config';
        function buildLater() {
          const makeConfig = defineConfig;
          return makeConfig({});
        }
      `),
    ).toEqual([]);
  });

  it('ignores alias-looking text inside comments and template examples', () => {
    expect(
      findPrismaDefineConfigRealiases(`
        import { defineConfig } from 'prisma/config';
        // const commentedConfig = defineConfig;
        const example = \`
          const makeConfig = defineConfig;
        \`;
      `),
    ).toEqual([]);
  });

  it('keeps the repository prisma.config.ts free of defineConfig re-aliases', () => {
    const prismaConfigPath = path.join(process.cwd(), 'prisma.config.ts');
    const source = fs.readFileSync(prismaConfigPath, 'utf8');

    expect(findPrismaDefineConfigRealiases(source)).toEqual([]);
  });
});
