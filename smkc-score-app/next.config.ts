import type { NextConfig } from "next";
import { resolve } from "path";
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * next-intl plugin wraps the Next.js config to enable i18n support.
 * Points to the request config at src/i18n/request.ts which handles
 * locale detection (cookie → browser Accept-Language → default).
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * Set the Turbopack root to this project directory explicitly.
   * Without this, Turbopack detects the parent directory's lockfile
   * (/Users/.../JSMKC/package-lock.json) and infers a wrong workspace root,
   * which breaks resolution of subpath exports like 'geist/font/mono'.
   */
  turbopack: {
    root: resolve(__dirname),
  },
};

export default withNextIntl(nextConfig);
