/**
 * Cloudflare Workers environment type declarations.
 * Used by @opennextjs/cloudflare's getCloudflareContext() to provide
 * typed access to D1 bindings.
 *
 * We import D1Database from @cloudflare/workers-types directly here
 * rather than adding it to tsconfig types[], which would globally override
 * DOM types (Response, Request, etc.) and break existing API route code.
 */
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    ARCHIVE_BUCKET?: R2Bucket;
  }
}

export {};
