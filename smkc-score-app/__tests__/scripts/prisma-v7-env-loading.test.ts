import { readFileSync } from 'node:fs';

import {
  findCommonJsPrismaDefineConfigImport,
  findNamedDotenvConfigImport,
  formatPrismaV7EnvLoading,
  inspectPrismaV7EnvLoading,
  parseCliOptions,
} from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment loading readiness', () => {
  it('accepts only the explicit JSON CLI option', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--unknown'])).toThrow('unsupported option: --unknown');
    expect(() => parseCliOptions(['--json', '--unknown'])).toThrow('unsupported option: --json --unknown');
  });

  it('accepts the Prisma upgrade guide dotenv/config side-effect import', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import "dotenv/config";
        import { defineConfig, env } from "prisma/config";

        export default defineConfig({
          datasource: { url: env("DATABASE_URL") },
        });
      `),
    ).toEqual({ ready: true, mode: 'dotenv/config' });
  });

  it('accepts explicit dotenv config calls before Prisma config evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        config({ path: '.env.local' });
        config({ path: '.env' });
        export default defineConfig({ datasource: { url: process.env.DATABASE_URL ?? '' } });
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        import { config as loadEnv } from 'dotenv';
        import { defineConfig as makeConfig } from 'prisma/config';
        loadEnv();
        export default makeConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(findNamedDotenvConfigImport("import { config as loadEnv } from 'dotenv';")).toBe('loadEnv');
  });

  it('recognizes CommonJS destructuring aliases for Prisma config evaluation', () => {
    const aliasedImport = "const { defineConfig: makeConfig } = require('prisma/config');";
    const shorthandImport = "const { defineConfig } = require('prisma/config');";

    expect(findCommonJsPrismaDefineConfigImport(aliasedImport)).toBe('makeConfig');
    expect(findCommonJsPrismaDefineConfigImport(shorthandImport)).toBe('defineConfig');
  });

  it('accepts namespace and CommonJS dotenv config calls before Prisma config evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import * as dotenv from 'dotenv';
        import { defineConfig } from 'prisma/config';
        dotenv.config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig: makeConfig } = require('prisma/config');
        require('dotenv').config();
        module.exports = makeConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('rejects dotenv config calls that run after Prisma config evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        export default defineConfig({ datasource: { url: process.env.DATABASE_URL ?? '' } });
        config();
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        import * as dotenv from 'dotenv';
        import { defineConfig as makeConfig } from 'prisma/config';
        export default makeConfig({});
        dotenv.config();
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        module.exports = defineConfig({});
        require('dotenv').config();
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig: makeConfig } = require('prisma/config');
        module.exports = makeConfig({});
        require('dotenv').config();
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects dotenv config text that is not a top-level executed call', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        function loadEnvLater() {
          config();
        }
        export default defineConfig({});
        loadEnvLater();
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const example = "require('dotenv').config()";
        const { defineConfig } = require('prisma/config');
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('ignores braces in inline comments when deciding top-level execution', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        function loadEnvLater() {
          const marker = 1; // } must not escape the function scope
          config();
        }
        export default defineConfig({});
        loadEnvLater();
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        const marker = 1; // { must not create a fake scope
        config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('does not treat imports without execution or commented examples as readiness evidence', () => {
    expect(inspectPrismaV7EnvLoading("import { config } from 'dotenv';")).toEqual({ ready: false, mode: null });
    expect(
      inspectPrismaV7EnvLoading(`
        // import "dotenv/config";
        // config();
        export default {};
      `),
    ).toEqual({ ready: false, mode: null });
    expect(inspectPrismaV7EnvLoading(null)).toEqual({ ready: false, mode: null });
  });

  it('keeps the repository Prisma config explicit about environment loading', () => {
    const repositoryPrismaConfig = readFileSync('prisma.config.ts', 'utf8');

    expect(inspectPrismaV7EnvLoading(repositoryPrismaConfig)).toEqual({
      ready: true,
      mode: 'dotenv.config()',
    });
  });

  it('keeps the human-readable evidence read-only', () => {
    const output = formatPrismaV7EnvLoading({ ready: true, mode: 'dotenv.config()' });

    expect(output).toContain('Explicit environment loading: `ready`');
    expect(output).toContain('Detected mode: `dotenv.config()`');
    expect(output).toContain('read-only');
  });

  it('formats the same readiness evidence as one JSON line', () => {
    const status = { ready: true, mode: 'dotenv.config()' };
    const output = formatPrismaV7EnvLoading(status, { json: true });

    expect(output).toBe(`${JSON.stringify(status)}\n`);
    expect(JSON.parse(output)).toEqual(status);
    expect(output).not.toContain('## Prisma 7 environment loading readiness');
  });
});
