import { readFileSync } from 'node:fs';

import {
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

  it('accepts explicit dotenv config calls, including an aliased named import', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        config({ path: '.env.local' });
        config({ path: '.env' });
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        import { config as loadEnv } from 'dotenv';
        loadEnv();
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(findNamedDotenvConfigImport("import { config as loadEnv } from 'dotenv';")).toBe('loadEnv');
  });

  it('accepts namespace and CommonJS dotenv config calls', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import * as dotenv from 'dotenv';
        dotenv.config();
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(inspectPrismaV7EnvLoading("require('dotenv').config();")).toEqual({
      ready: true,
      mode: 'dotenv.config()',
    });
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
