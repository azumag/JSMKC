#!/usr/bin/env node
/**
 * Exit successfully only while the repository's Prisma CLI selector is on a
 * pre-v7 major. Unknown selectors intentionally fail closed so callers do not
 * apply Prisma 6-only engine environment variables to a future CLI by guess.
 */
const manifest = require('../package.json');
const { extractPrismaMajor } = require('./prisma-generate');

/**
 * @param {unknown} selector
 * @returns {boolean}
 */
function isPreV7PrismaSelector(selector) {
  const major = extractPrismaMajor(selector);
  return major !== null && major < 7;
}

module.exports = { isPreV7PrismaSelector };

if (require.main === module) {
  process.exit(isPreV7PrismaSelector(manifest.devDependencies?.prisma) ? 0 : 1);
}
