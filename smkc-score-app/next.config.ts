import type { NextConfig } from "next";
import { resolve } from "path";
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * Initialize OpenNext Cloudflare dev bindings (D1, etc.) for local development.
 * This must be called before Next.js config is evaluated so that
 * getCloudflareContext() works in `next dev`.
 */
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
const isJest = process.env.NODE_ENV === 'test'
  || process.env.JEST_WORKER_ID !== undefined
  || process.env.SKIP_OPENNEXT_CLOUDFLARE_DEV === '1'
  || process.argv.some((arg) => arg.includes('jest'));

if (!isJest) {
  initOpenNextCloudflareForDev();
}

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
   * NOTE: `cacheComponents: true` (PPR, formerly `experimental.ppr`) was evaluated
   * for issue #694 but is blocked: the root layout accesses dynamic APIs (getLocale,
   * headers) outside <Suspense>, causing /_not-found prerender to fail.
   * The Suspense refactoring on mode pages still provides RSC streaming benefits
   * (skeleton sent before data fetches complete) without requiring PPR.
   * Revisit when the layout is refactored to move dynamic APIs inside Suspense.
   */
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

  /**
   * Routing-level redirects for renamed TA elimination routes.
   * revival_N was renamed to phaseN when TAEliminationPhase was introduced.
   * These routing-level redirects fire before middleware and server components,
   * making them more reliable than server-component redirect() in Cloudflare
   * Workers (OpenNext) deployments where server component redirects may be
   * unreliable depending on the Workers runtime version.
   * permanent: false (307) allows future route changes without cache lock-in.
   */
  async redirects() {
    return [
      {
        source: '/tournaments/:id/ta/revival-1',
        destination: '/tournaments/:id/ta/phase1',
        permanent: false,
      },
      {
        source: '/tournaments/:id/ta/revival-2',
        destination: '/tournaments/:id/ta/phase2',
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
