'use strict';

const fs = require('node:fs');

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function withoutCommentOnlyLines(source) {
  let output = '';
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n' || char === '\r') {
        lineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        blockComment = false;
        index += 1;
      } else {
        output += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (quote !== null) {
      output += char;
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
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      output += '  ';
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      output += '  ';
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function findNamedDotenvConfigImport(source) {
  const pattern = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]dotenv['"]\s*;?/gm;
  for (const match of source.matchAll(pattern)) {
    if (!isTopLevelSourceIndex(source, match.index)) continue;

    for (const entry of match[1].split(',')) {
      const named = /^\s*config(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
      if (named) return named[1] ?? 'config';
    }
  }

  return null;
}

function findNamedPrismaDefineConfigImport(source) {
  const pattern = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]prisma\/config['"]\s*;?/gm;
  for (const match of source.matchAll(pattern)) {
    if (!isTopLevelSourceIndex(source, match.index)) continue;

    for (const entry of match[1].split(',')) {
      const named = /^\s*defineConfig(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
      if (named) return named[1] ?? 'defineConfig';
    }
  }

  return null;
}

function findCommonJsPrismaDefineConfigImport(source) {
  const commonJsImport = /^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]prisma\/config['"]\s*\)\s*;?/gm;
  for (const match of source.matchAll(commonJsImport)) {
    if (!isTopLevelSourceIndex(source, match.index)) continue;

    for (const entry of match[1].split(',')) {
      const named = /^\s*defineConfig(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
      if (named) return named[1] ?? 'defineConfig';
    }
  }

  return null;
}

function isIdentifierStart(char) {
  return typeof char === 'string' && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char) {
  return typeof char === 'string' && /[\w$]/.test(char);
}

function isTopLevelSourceIndex(source, targetIndex) {
  let braceDepth = 0;
  let parenDepth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let pendingTopLevelArrow = false;
  let awaitingControlParen = false;
  let controlHeaderParenDepth = null;
  let pendingUnbracedControlBody = false;
  let pendingConditionalExpression = false;
  const controlBodyBraceDepths = [];

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

    if (braceDepth === 0 && ((char === '&' && next === '&') || (char === '|' && next === '|'))) {
      pendingConditionalExpression = true;
      index += 1;
      continue;
    }

    if (braceDepth === 0 && char === '?') {
      pendingConditionalExpression = true;
      if (next === '?') index += 1;
      continue;
    }

    if (braceDepth === 0 && parenDepth === 0 && isIdentifierStart(char)) {
      let identifierEnd = index + 1;
      while (identifierEnd < targetIndex && isIdentifierPart(source[identifierEnd])) identifierEnd += 1;
      const identifier = source.slice(index, identifierEnd);

      if (
        identifier === 'if' ||
        identifier === 'for' ||
        identifier === 'while' ||
        identifier === 'with' ||
        identifier === 'switch' ||
        identifier === 'catch'
      ) {
        awaitingControlParen = true;
      } else if (identifier === 'else' || identifier === 'do' || identifier === 'try' || identifier === 'finally') {
        pendingUnbracedControlBody = true;
      }

      index = identifierEnd - 1;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      if (braceDepth === 0 && awaitingControlParen && parenDepth === 1) {
        controlHeaderParenDepth = 1;
        awaitingControlParen = false;
      }
      continue;
    }

    if (char === ')') {
      if (parenDepth > 0) parenDepth -= 1;
      if (braceDepth === 0 && controlHeaderParenDepth !== null && parenDepth === 0) {
        controlHeaderParenDepth = null;
        pendingUnbracedControlBody = true;
      }
      continue;
    }

    if (char === '{') {
      if (braceDepth === 0 && pendingUnbracedControlBody) {
        controlBodyBraceDepths.push(braceDepth + 1);
        pendingUnbracedControlBody = false;
      }
      braceDepth += 1;
    } else if (char === '}') {
      const closingDepth = braceDepth;
      braceDepth = Math.max(0, braceDepth - 1);
      if (controlBodyBraceDepths.at(-1) === closingDepth) {
        controlBodyBraceDepths.pop();
        pendingConditionalExpression = false;
      }
    } else if (braceDepth === 0 && char === '=' && next === '>') {
      pendingTopLevelArrow = true;
      index += 1;
    } else if (braceDepth === 0 && parenDepth === 0 && char === ';') {
      pendingTopLevelArrow = false;
      pendingUnbracedControlBody = false;
      pendingConditionalExpression = false;
      awaitingControlParen = false;
    }
  }

  return (
    quote === null &&
    !lineComment &&
    !blockComment &&
    braceDepth === 0 &&
    !pendingTopLevelArrow &&
    !pendingUnbracedControlBody &&
    !pendingConditionalExpression &&
    !awaitingControlParen &&
    controlHeaderParenDepth === null
  );
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
  const defineConfigIndex = findDefineConfigEvaluationIndex(source);
  const flags = invocationPattern.flags.includes('g') ? invocationPattern.flags : `${invocationPattern.flags}g`;
  const pattern = new RegExp(invocationPattern.source, flags);

  for (const invocation of source.matchAll(pattern)) {
    if (!isTopLevelSourceIndex(source, invocation.index)) continue;
    if (defineConfigIndex === null || invocation.index < defineConfigIndex) return true;
  }

  return false;
}

function inspectPrismaV7EnvLoading(source) {
  if (typeof source !== 'string') {
    return { ready: false, mode: null };
  }

  const configSource = withoutCommentOnlyLines(source);

  const sideEffectImport = /^\s*import\s*['"]dotenv\/config['"]\s*;?/gm;
  for (const match of configSource.matchAll(sideEffectImport)) {
    if (isTopLevelSourceIndex(configSource, match.index)) {
      return { ready: true, mode: 'dotenv/config' };
    }
  }

  const namedConfig = findNamedDotenvConfigImport(configSource);
  if (namedConfig) {
    const invocation = new RegExp(`^\\s*${namedConfig.replace(/[$]/g, '\\$&')}\\s*\\(`, 'm');
    if (invocationPrecedesDefineConfig(configSource, invocation)) {
      return { ready: true, mode: 'dotenv.config()' };
    }
  }

  const namespaceImport = /^\s*import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]dotenv['"]\s*;?/gm;
  for (const match of configSource.matchAll(namespaceImport)) {
    if (!isTopLevelSourceIndex(configSource, match.index)) continue;

    const invocation = new RegExp(`^\\s*${match[1].replace(/[$]/g, '\\$&')}\\.config\\s*\\(`, 'm');
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
