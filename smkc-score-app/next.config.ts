import type { NextConfig } from "next";
import { resolve } from "path";

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

export default nextConfig;
