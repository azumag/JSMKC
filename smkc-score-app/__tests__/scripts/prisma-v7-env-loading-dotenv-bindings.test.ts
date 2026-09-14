import {
  findCommonJsDotenvConfigImports,
  findDotenvNamespaceImports,
  findNamedDotenvConfigImports,
  inspectPrismaV7EnvLoading,
} from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 dotenv binding readiness', () => {
  it('accepts an ESM default import when config runs before Prisma config evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import dotenv from 'dotenv';
        import { defineConfig } from 'prisma/config';
        dotenv.config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        import dotenv from 'dotenv';
        import { defineConfig } from 'prisma/config';
        export default defineConfig({});
        dotenv.config();
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('accepts immutable CommonJS destructuring and namespace bindings', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { config: loadEnv } = require('dotenv');
        const { defineConfig } = require('prisma/config');
        loadEnv();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        const dotenv = require('dotenv');
        const { defineConfig } = require('prisma/config');
        dotenv.config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('keeps mutable CommonJS bindings fail-closed', () => {
    for (const declaration of ['let', 'var']) {
      expect(
        inspectPrismaV7EnvLoading(`
          ${declaration} dotenv = require('dotenv');
          const { defineConfig } = require('prisma/config');
          dotenv.config();
          module.exports = defineConfig({});
        `),
      ).toEqual({ ready: false, mode: null });

      expect(
        inspectPrismaV7EnvLoading(`
          ${declaration} { config: loadEnv } = require('dotenv');
          const { defineConfig } = require('prisma/config');
          loadEnv();
          module.exports = defineConfig({});
        `),
      ).toEqual({ ready: false, mode: null });
    }
  });

  it('continues across multiple named dotenv config imports', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config as unusedConfig } from 'dotenv';
        import { config as loadEnv } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        loadEnv();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      findNamedDotenvConfigImports(`
        import { config as first } from 'dotenv';
        import { config as second } from 'dotenv';
      `),
    ).toEqual(['first', 'second']);
  });

  it('extracts only immutable CommonJS dotenv evidence bindings', () => {
    expect(findCommonJsDotenvConfigImports("const { config: loadEnv } = require('dotenv');")).toEqual(['loadEnv']);
    expect(findCommonJsDotenvConfigImports("let { config: loadEnv } = require('dotenv');")).toEqual([]);
    expect(findDotenvNamespaceImports("import dotenv from 'dotenv';\nconst dotenvCjs = require('dotenv');")).toEqual([
      'dotenv',
      'dotenvCjs',
    ]);
    expect(findDotenvNamespaceImports("let dotenv = require('dotenv');")).toEqual([]);
  });
});
