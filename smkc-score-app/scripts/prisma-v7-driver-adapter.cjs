'use strict';

const fs = require('node:fs');

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function stripComments(source) {
  if (typeof source !== 'string') return source;

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
      output += '  ';
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      blockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSourceCodeIndex(source, targetIndex) {
  if (typeof source !== 'string' || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > source.length) {
    return false;
  }

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
    }
  }

  return quote === null && !lineComment && !blockComment;
}

function findNamedImportLocalName(source, exportedName, moduleSpecifier = null) {
  if (typeof source !== 'string') return null;

  const importPattern = /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;

  for (const match of source.matchAll(importPattern)) {
    if (!isSourceCodeIndex(source, match.index)) continue;
    if (moduleSpecifier && match[2] !== moduleSpecifier) continue;

    for (const entry of match[1].split(',')) {
      const named = new RegExp(`^\\s*${escapeRegExp(exportedName)}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`).exec(entry);
      if (named) return named[1] ?? exportedName;
    }
  }

  return null;
}

function findConstructedAdapterLocalName(source, adapterConstructorLocalName) {
  if (!adapterConstructorLocalName) return null;

  const constructorName = escapeRegExp(adapterConstructorLocalName);
  const pattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+${constructorName}\\s*\\(`,
    'g',
  );

  for (const match of source.matchAll(pattern)) {
    if (isSourceCodeIndex(source, match.index)) return match[1];
  }

  return null;
}

function extractPrismaClientOptions(source, prismaClientLocalName) {
  if (!prismaClientLocalName) return null;

  const clientName = escapeRegExp(prismaClientLocalName);
  const openingPattern = new RegExp(`\\bnew\\s+${clientName}\\s*\\(\\s*\\{`, 'g');

  for (const opening of source.matchAll(openingPattern)) {
    if (!isSourceCodeIndex(source, opening.index)) continue;

    const openBraceIndex = opening.index + opening[0].lastIndexOf('{');
    let depth = 1;
    let quote = null;
    let escaped = false;

    for (let index = openBraceIndex + 1; index < source.length; index += 1) {
      const char = source[index];

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

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(openBraceIndex + 1, index);
      }
    }

    return null;
  }

  return null;
}

function splitTopLevelObjectEntries(clientOptions) {
  if (!clientOptions) return [];

  const entries = [];
  let start = 0;
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < clientOptions.length; index += 1) {
    const char = clientOptions[index];

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

    if (char === '{') braces += 1;
    else if (char === '}') braces = Math.max(0, braces - 1);
    else if (char === '[') brackets += 1;
    else if (char === ']') brackets = Math.max(0, brackets - 1);
    else if (char === '(') parentheses += 1;
    else if (char === ')') parentheses = Math.max(0, parentheses - 1);
    else if (char === ',' && braces === 0 && brackets === 0 && parentheses === 0) {
      const entry = clientOptions.slice(start, index).trim();
      if (entry) entries.push(entry);
      start = index + 1;
    }
  }

  const tail = clientOptions.slice(start).trim();
  if (tail) entries.push(tail);
  return entries;
}

function prismaClientOptionsUseAdapter(clientOptions, adapterInstanceLocalName) {
  if (!clientOptions || !adapterInstanceLocalName) return false;

  const instanceName = escapeRegExp(adapterInstanceLocalName);
  return splitTopLevelObjectEntries(clientOptions).some((entry) => {
    if (adapterInstanceLocalName === 'adapter' && entry === 'adapter') return true;
    return new RegExp(`^(?:['"]adapter['"]|adapter)\\s*:\\s*${instanceName}\\s*$`).test(entry);
  });
}

function prismaClientOptionsHaveOption(clientOptions, optionName) {
  if (!clientOptions || typeof optionName !== 'string' || optionName === '') return false;

  const escapedOptionName = escapeRegExp(optionName);
  const optionPattern = new RegExp(`^(?:['"]${escapedOptionName}['"]|${escapedOptionName})\\s*(?::|$)`);
  return splitTopLevelObjectEntries(clientOptions).some((entry) => optionPattern.test(entry));
}

function prismaClientOptionsHaveSpread(clientOptions) {
  return splitTopLevelObjectEntries(clientOptions).some((entry) => entry.startsWith('...'));
}

function prismaClientOptionsHaveComputedKey(clientOptions) {
  return splitTopLevelObjectEntries(clientOptions).some((entry) => entry.startsWith('['));
}

function inspectPrismaV7DriverAdapter(source) {
  if (typeof source !== 'string') {
    return {
      ready: false,
      adapterLocalName: null,
      adapterInstanceLocalName: null,
      prismaClientLocalName: null,
      checks: {
        importsPrismaD1Adapter: false,
        constructsPrismaD1Adapter: false,
        passesAdapterToPrismaClient: false,
        omitsLegacyDatasourcesOption: false,
        omitsLegacyDatasourceUrlOption: false,
        omitsUnknownSpreadOptions: false,
        omitsComputedOptionKeys: false,
      },
    };
  }

  const code = stripComments(source);
  const adapterLocalName = findNamedImportLocalName(code, 'PrismaD1', '@prisma/adapter-d1');
  const adapterInstanceLocalName = findConstructedAdapterLocalName(code, adapterLocalName);
  const prismaClientLocalName = findNamedImportLocalName(code, 'PrismaClient');
  const clientOptions = extractPrismaClientOptions(code, prismaClientLocalName);

  const checks = {
    importsPrismaD1Adapter: adapterLocalName !== null,
    constructsPrismaD1Adapter: adapterInstanceLocalName !== null,
    passesAdapterToPrismaClient: prismaClientOptionsUseAdapter(clientOptions, adapterInstanceLocalName),
    omitsLegacyDatasourcesOption:
      clientOptions !== null && !prismaClientOptionsHaveOption(clientOptions, 'datasources'),
    omitsLegacyDatasourceUrlOption:
      clientOptions !== null && !prismaClientOptionsHaveOption(clientOptions, 'datasourceUrl'),
    omitsUnknownSpreadOptions: clientOptions !== null && !prismaClientOptionsHaveSpread(clientOptions),
    omitsComputedOptionKeys: clientOptions !== null && !prismaClientOptionsHaveComputedKey(clientOptions),
  };

  return {
    ready: Object.values(checks).every(Boolean),
    adapterLocalName,
    adapterInstanceLocalName,
    prismaClientLocalName,
    checks,
  };
}

function formatPrismaV7DriverAdapter(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const checkRows = Object.entries(status.checks)
    .map(([check, passed]) => `| ${check} | ${passed ? 'ready' : 'needs migration'} |`)
    .join('\n');

  return [
    '## Prisma 7 D1 driver adapter readiness (#3114)',
    '',
    `Driver adapter wiring: \`${status.ready ? 'ready' : 'needs migration'}\``,
    `Detected D1 adapter local name: \`${status.adapterLocalName ?? 'none'}\``,
    `Detected D1 adapter instance: \`${status.adapterInstanceLocalName ?? 'none'}\``,
    `Detected PrismaClient local name: \`${status.prismaClientLocalName ?? 'none'}\``,
    '',
    '| Readiness check | Result |',
    '| --- | --- |',
    checkRows,
    '',
    'Prisma ORM 7 requires a driver adapter for database access. This read-only probe verifies that the application imports and constructs the Cloudflare D1 adapter, passes that exact constructed adapter as a top-level PrismaClient option, does not retain the legacy top-level `datasources` / `datasourceUrl` constructor overrides from the Prisma 6 connection style, and does not hide top-level constructor options behind an unresolved object spread or computed property key.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 D1 driver adapter arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const source = fs.readFileSync('src/lib/prisma.ts', 'utf8');
    const status = inspectPrismaV7DriverAdapter(source);
    const output = formatPrismaV7DriverAdapter(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 D1 driver adapter readiness: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractPrismaClientOptions,
  findConstructedAdapterLocalName,
  findNamedImportLocalName,
  formatPrismaV7DriverAdapter,
  inspectPrismaV7DriverAdapter,
  isSourceCodeIndex,
  parseCliOptions,
  prismaClientOptionsHaveComputedKey,
  prismaClientOptionsHaveOption,
  prismaClientOptionsHaveSpread,
  prismaClientOptionsUseAdapter,
  splitTopLevelObjectEntries,
  stripComments,
};
