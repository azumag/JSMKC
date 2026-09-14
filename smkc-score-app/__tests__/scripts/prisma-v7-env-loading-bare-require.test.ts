import { inspectPrismaV7EnvLoading } from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 bare CommonJS dotenv evidence', () => {
  it('rejects member require methods as direct CommonJS environment loading', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        loader.require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        loader?.require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects member require methods even when whitespace or comments separate the member access', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        loader /* not the CommonJS loader */ . require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('continues scanning after member calls and accepts a later bare require', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        loader.require('dotenv').config();
        require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('continues accepting a bare require used inside a top-level assignment', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        const loaded = require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });
});
