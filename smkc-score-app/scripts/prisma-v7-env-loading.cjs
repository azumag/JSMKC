'use strict';

const fs = require('node:fs');

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function withoutCommentOnlyLines(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function findNamedDotenvConfigImport(source) {
  const match = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]dotenv['"]\s*;?/m.exec(source);
  if (!match) return null;

  for (const entry of match[1].split(',')) {
    const named = /^\s*config(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
    if (named) return named[1] ?? 'config';
  }

  return null;
}

function inspectPrismaV7EnvLoading(source) {
  if (typeof source !== 'string') {
    return { ready: false, mode: null };
  }

  const configSource = withoutCommentOnlyLines(source);

  if (/^\s*import\s*['"]dotenv\/config['"]\s*;?/m.test(configSource)) {
    return { ready: true, mode: 'dotenv/config' };
  }

  const namedConfig = findNamedDotenvConfigImport(configSource);
  if (namedConfig) {
    const invocation = new RegExp(`^\\s*${namedConfig.replace(/[$]/g, '\\$&')}\\s*\\(`, 'm');
    if (invocation.test(configSource)) {
      return { ready: true, mode: 'dotenv.config()' };
    }
  }

  const namespaceImport = /^\s*import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]dotenv['"]\s*;?/m.exec(configSource);
  if (namespaceImport) {
    const invocation = new RegExp(`^\\s*${namespaceImport[1].replace(/[$]/g, '\\$&')}\\.config\\s*\\(`, 'm');
    if (invocation.test(configSource)) {
      return { ready: true, mode: 'dotenv.config()' };
    }
  }

  if (/\brequire\s*\(\s*['"]dotenv['"]\s*\)\s*\.\s*config\s*\(/m.test(configSource)) {
    return { ready: true, mode: 'dotenv.config()' };
  }

  return { ready: false, mode: null };
}

function formatPrismaV7EnvLoading(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  return [
    '## Prisma 7 environment loading readiness (#3114)',
    '',
    `Explicit environment loading: \`${status.ready ? 'ready' : 'needs migration'}\``,
    `Detected mode: \`${status.mode ?? 'none'}\``,
    '',
    'Prisma ORM 7 no longer loads .env files automatically for Prisma CLI commands. This probe is read-only and verifies that prisma.config.ts explicitly loads environment variables before datasource configuration is evaluated.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 environment-loading arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');
    const status = inspectPrismaV7EnvLoading(source);
    const output = formatPrismaV7EnvLoading(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 environment loading: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findNamedDotenvConfigImport,
  formatPrismaV7EnvLoading,
  inspectPrismaV7EnvLoading,
  parseCliOptions,
  withoutCommentOnlyLines,
};
