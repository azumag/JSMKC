/**
 * Tests for scripts/prisma-generate.js (issue #2734).
 *
 * Verifies the CI-conditional PRISMA engine overrides so that the postinstall
 * hook only forces the WASM fallback path inside CI containers, and leaves
 * local `npm install` runs alone to use the faster native engines.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildSpawnEnv } from '../../scripts/prisma-generate';

const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', 'scripts');
const PRISMA_GENERATE_PATH = path.join(SCRIPTS_DIR, 'prisma-generate.js');

describe('scripts/prisma-generate', () => {
  describe('buildSpawnEnv', () => {
    it('preserves the parent env untouched when CI is not set', () => {
      const parent: NodeJS.ProcessEnv = {
        PATH: '/usr/bin',
        HOME: '/home/dev',
      };
      const result = buildSpawnEnv(parent);

      expect(result).toEqual({ PATH: '/usr/bin', HOME: '/home/dev' });
      // Must not introduce the CI-only overrides on a local dev run.
      expect(result.PRISMA_SCHEMA_ENGINE_BINARY).toBeUndefined();
      expect(result.PRISMA_QUERY_ENGINE_LIBRARY).toBeUndefined();
      expect(result.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING).toBeUndefined();
    });

    it('treats an empty-string CI value as "not CI" (npm sometimes exports empty strings)', () => {
      const result = buildSpawnEnv({ CI: '', PATH: '/usr/bin' });

      expect(result.PRISMA_SCHEMA_ENGINE_BINARY).toBeUndefined();
      expect(result.PRISMA_QUERY_ENGINE_LIBRARY).toBeUndefined();
      expect(result.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING).toBeUndefined();
      expect(result.PATH).toBe('/usr/bin');
    });

    it('overlays the WASM fallback overrides when CI is "true"', () => {
      const parent: NodeJS.ProcessEnv = { CI: 'true', PATH: '/usr/bin' };
      const result = buildSpawnEnv(parent);

      expect(result.PRISMA_SCHEMA_ENGINE_BINARY).toBe('/dev/null');
      expect(result.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/dev/null');
      expect(result.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING).toBe('1');
      // Existing parent env entries must survive the overlay.
      expect(result.PATH).toBe('/usr/bin');
      expect(result.CI).toBe('true');
    });

    it('overlays the WASM fallback overrides when CI is "1" (GitHub Actions form)', () => {
      const result = buildSpawnEnv({ CI: '1' });

      expect(result.PRISMA_SCHEMA_ENGINE_BINARY).toBe('/dev/null');
      expect(result.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/dev/null');
      expect(result.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING).toBe('1');
    });

    it('does not mutate the parent env object', () => {
      // A shared process.env mutation would leak into the rest of the
      // build pipeline. The overlay must produce a fresh object.
      const parent: NodeJS.ProcessEnv = { CI: 'true', KEEP: 'me' };
      buildSpawnEnv(parent);

      expect(parent.PRISMA_SCHEMA_ENGINE_BINARY).toBeUndefined();
      expect(parent.PRISMA_QUERY_ENGINE_LIBRARY).toBeUndefined();
      expect(parent.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING).toBeUndefined();
      expect(parent.KEEP).toBe('me');
    });
  });

  describe('package.json wiring', () => {
    it('keeps the wrapper script on disk so the package.json reference resolves', () => {
      // package.json postinstall/prebuild:cf point at scripts/prisma-generate.js.
      // If that file is removed without updating the scripts, npm ci/postinstall
      // fails with "Cannot find module". This belt-and-suspenders test catches
      // that drift early.
      expect(fs.existsSync(PRISMA_GENERATE_PATH)).toBe(true);
    });
  });
});
