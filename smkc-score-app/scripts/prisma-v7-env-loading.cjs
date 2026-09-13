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

function findNamedPrismaDefineConfigImport(source) {
  const match = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]prisma\/config['"]\s*;?/m.exec(source);
  if (!match) return null;

  for (const entry of match[1].split(',')) {
    const named = /^\s*defineConfig(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
    if (named) return named[1] ?? 'defineConfig';
  }

  return null;
}

function findCommonJsPrismaDefineConfigImport(source) {
  const commonJsImport = /^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]prisma\/config['"]\s*\)\s*;?/m;
  const match = commonJsImport.exec(source);
  if (!match) return null;

  for (const entry of match[1].split(',')) {
    const named = /^\s*defineConfig(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
    if (named) return named[1] ?? 'defineConfig';
  }

  return null;
}

function isTopLevelSourceIndex(source, targetIndex) {
  let braceDepth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < targetIndex; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n' || char === '\r') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
  }

  return quote === null && !lineComment && !blockComment && braceDepth === 0;
}

function findDefineConfigEvaluationIndex(source) {
  const defineConfigLocalName =
    findNamedPrismaDefineConfigImport(source) ?? findCommonJsPrismaDefineConfigImport(source) ?? 'defineConfig';
  const escapedName = defineConfigLocalName.replace(/[$]/g, '\\$&');
  const pattern = new RegExp(`\\b${escapedName}\\s*\\(`, 'gm');

  for (const match of source.matchAll(pattern)) {
    if (isTopLevelSourceIndex(source, match.index)) return match.index;
  }

  return null;
}

function invocationPrecedesDefineConfig(source, invocationPattern) {
  const invocation = invocationPattern.exec(source);
  if (!invocation || !isTopLevelSourceIndex(source, invocation.index)) return false;

  const defineConfigIndex = findDefineConfigEvaluationIndex(source);
  return defineConfigIndex === null || invocation.index < defineConfigIndex;
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
    if (invocationPrecedesDefineConfig(configSource, invocation)) {
      return { ready: true, mode: 'dotenv.config()' };
    }
  }

  const namespaceImport = /^\s*import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]dotenv['"]\s*;?/m.exec(configSource);
  if (namespaceImport) {
    const invocation = new RegExp(`^\\s*${namespaceImport[1].replace(/[$]/g, '\\$&')}\\.config\\s*\\(`, 'm');
    if (invocationPrecedesDefineConfig(configSource, invocation)) {
      return { ready: true, mode: 'dotenv.config()' };
    }
  }

  const commonJsInvocation = /\brequire\s*\(\s*['"]dotenv['"]\s*\)\s*\.\s*config\s*\(/m;
  if (invocationPrecedesDefineConfig(configSource, commonJsInvocation)) {
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
  findCommonJsPrismaDefineConfigImport,
  findDefineConfigEvaluationIndex,
  findNamedDotenvConfigImport,
  findNamedPrismaDefineConfigImport,
  formatPrismaV7EnvLoading,
  inspectPrismaV7EnvLoading,
  invocationPrecedesDefineConfig,
  isTopLevelSourceIndex,
  parseCliOptions,
  withoutCommentOnlyLines,
};
