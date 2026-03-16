import type { NextConfig } from "next";
import { resolve } from "path";
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * Initialize OpenNext Cloudflare dev bindings (D1, etc.) for local development.
 * This must be called before Next.js config is evaluated so that
 * getCloudflareContext() works in `next dev`.
 */
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();

/**
 * next-intl plugin wraps the Next.js config to enable i18n support.
 * Points to the request config at src/i18n/request.ts which handles
 * locale detection (cookie → browser Accept-Language → default).
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /** Hide framework identification header to reduce information leakage. */
  poweredByHeader: false,
  /**
   * Set the Turbopack root to this project directory explicitly.
   * Without this, Turbopack detects the parent directory's lockfile
   * (/Users/.../JSMKC/package-lock.json) and infers a wrong workspace root,
   * which breaks resolution of subpath exports like 'geist/font/mono'.
   */
  turbopack: {
    root: resolve(__dirname),
  },
  /**
   * Prevent Turbopack from bundling Prisma with Node.js module conditions.
   * Prisma's generated client uses private package imports (#wasm-engine-loader)
   * that must be resolved with the "workerd" condition for Cloudflare Workers.
   * Turbopack resolves them with "node" condition, producing code that calls
   * WebAssembly.instantiateStreaming — which doesn't exist in workerd.
   * By marking these as external, OpenNext's esbuild handles resolution
   * with conditions: ["workerd"], picking the correct WASM loader.
   * See: https://opennext.js.org/cloudflare/howtos/workerd
   */
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
};

export default withNextIntl(nextConfig);
