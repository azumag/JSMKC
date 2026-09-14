import fs from 'node:fs';
import path from 'node:path';

import { inspectDeferredPrismaEnvLoading } from '../../scripts/prisma-v7-env-loading-deferred-params.cjs';

describe('Prisma 7 deferred environment-loading guard', () => {
  it('rejects a named dotenv config call in function default parameters', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        import { config } from 'dotenv';

        function buildConfig(
          env = config(),
        ) {
          return env;
        }
      `),
    ).toEqual({
      safe: false,
      findings: [{ kind: 'named:config', rangeKind: 'function', line: 6 }],
    });
  });

  it('rejects a namespace config call in parenthesized arrow default parameters', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        import dotenv from 'dotenv';

        const buildConfig = (
          env = dotenv.config(),
        ) => env;
      `),
    ).toEqual({
      safe: false,
      findings: [{ kind: 'namespace:dotenv', rangeKind: 'arrow', line: 6 }],
    });
  });

  it('rejects direct CommonJS dotenv loading in deferred parameters', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        const buildConfig = (
          env = require('dotenv').config(),
        ) => env;
      `),
    ).toEqual({
      safe: false,
      findings: [{ kind: 'commonjs:require', rangeKind: 'arrow', line: 4 }],
    });
  });

  it('ignores config-looking text inside quoted default values', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        import { config } from 'dotenv';
        function buildConfig(env = 'config()') {
          return env;
        }
      `),
    ).toEqual({ safe: true, findings: [] });
  });

  it('fails closed on template interpolation inside deferred parameters', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        function buildConfig(env = \`prefix-\${loadEnv()}\`) {
          return env;
        }
      `),
    ).toEqual({
      safe: false,
      findings: [{ kind: 'template-interpolation', rangeKind: 'function', line: 2 }],
    });
  });

  it('allows direct top-level loading and ignores quoted examples', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        import { config } from 'dotenv';
        const example = 'function fake(env = config()) {}';
        config();
      `),
    ).toEqual({ safe: true, findings: [] });
  });

  it('does not classify a helper-body call as a parameter initializer', () => {
    expect(
      inspectDeferredPrismaEnvLoading(`
        import { config } from 'dotenv';
        function loadLater() {
          config();
        }
      `),
    ).toEqual({ safe: true, findings: [] });
  });

  it('keeps the repository prisma.config.ts free of deferred dotenv loading', () => {
    const prismaConfigPath = path.join(process.cwd(), 'prisma.config.ts');
    const source = fs.readFileSync(prismaConfigPath, 'utf8');

    expect(inspectDeferredPrismaEnvLoading(source)).toEqual({ safe: true, findings: [] });
  });
});
