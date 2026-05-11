const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const REQUIRED_PREVIEW_COLUMNS = [
  { table: 'Tournament', column: 'publicModes' },
  { table: 'GPMatch', column: 'assignedCups' },
  { table: 'GPMatch', column: 'suddenDeathWinnerId' },
];
const WRANGLER_TIMEOUT_MS = 30_000;
const DEFAULT_WRANGLER_LOG_PATH = path.join(os.tmpdir(), 'jsmkc-wrangler-preflight.log');

function buildPreviewSchemaCheckSql(columns = REQUIRED_PREVIEW_COLUMNS) {
  return columns
    .map(({ table, column }) => {
      const label = `${table}.${column}`;
      const escapedTable = table.replace(/'/g, "''");
      const escapedColumn = column.replace(/'/g, "''");
      const escapedLabel = label.replace(/'/g, "''");
      return [
        `SELECT '${escapedLabel}' AS required_column`,
        `WHERE EXISTS (SELECT 1 FROM pragma_table_info('${escapedTable}') WHERE name = '${escapedColumn}')`,
      ].join(' ');
    })
    .join(' UNION ALL ');
}

function extractWranglerJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;

  const firstJsonChar = text.search(/[\[{]/);
  if (firstJsonChar < 0) return null;

  try {
    return JSON.parse(text.slice(firstJsonChar));
  } catch (_error) {
    return null;
  }
}

function collectResultRows(parsed) {
  const payloads = Array.isArray(parsed) ? parsed : [parsed];
  return payloads.flatMap((payload) => {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.results)) return payload.results;
    return [];
  });
}

function parsePresentColumns(stdout) {
  const parsed = extractWranglerJson(stdout);
  if (!parsed) return new Set();

  return new Set(
    collectResultRows(parsed)
      .map((row) => row?.required_column)
      .filter((value) => typeof value === 'string'),
  );
}

function buildWranglerEnv(env = process.env) {
  const localBinPath = path.join(process.cwd(), 'node_modules', '.bin');
  const existingPath = env.PATH || '';
  return {
    ...env,
    PATH: existingPath.split(path.delimiter).includes(localBinPath)
      ? existingPath
      : [localBinPath, existingPath].filter(Boolean).join(path.delimiter),
    WRANGLER_LOG_PATH: env.WRANGLER_LOG_PATH || DEFAULT_WRANGLER_LOG_PATH,
  };
}

function isWranglerAuthOrLogFailure(stderr) {
  return [
    /failed to write to log file/i,
    /operation not permitted.*\.wrangler[/\\]logs/i,
    /failed to fetch auth token/i,
    /not logged in/i,
  ].some((pattern) => pattern.test(stderr));
}

function formatPreflightError(lines) {
  return lines.filter(Boolean).join('\n');
}

function assertPreviewD1Schema(env = process.env) {
  if (env.E2E_SKIP_PREVIEW_SCHEMA_PREFLIGHT === '1') return;

  const sql = buildPreviewSchemaCheckSql();
  const wranglerEnv = buildWranglerEnv(env);
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'DB', '--remote', '--env', 'preview', '--json', '--command', sql],
    { encoding: 'utf8', cwd: process.cwd(), env: wranglerEnv, timeout: WRANGLER_TIMEOUT_MS },
  );

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      formatPreflightError([
        `Preview D1 schema preflight timed out after ${WRANGLER_TIMEOUT_MS / 1000} seconds before launching the browser.`,
        'Check Cloudflare/Wrangler connectivity, run npm run db:migrations:apply:preview if needed, then retry npm run e2e:preview.',
      ]),
    );
  }

  if (result.error) {
    throw new Error(
      formatPreflightError([
        'Preview D1 schema preflight failed before launching the browser because Wrangler could not be started.',
        `Error ${result.error.code || 'UNKNOWN'}: ${result.error.message}`,
        'Run npm install in smkc-score-app or run through npm run e2e:preview so node_modules/.bin/wrangler is available.',
      ]),
    );
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    if (isWranglerAuthOrLogFailure(stderr)) {
      throw new Error(
        formatPreflightError([
          'Preview D1 schema preflight failed before launching the browser because Wrangler auth/log setup failed.',
          `Command exited ${result.status}.`,
          stderr ? `stderr: ${stderr}` : '',
          `WRANGLER_LOG_PATH=${wranglerEnv.WRANGLER_LOG_PATH}`,
          'Refresh Wrangler auth with wrangler login or CLOUDFLARE_API_TOKEN, ensure WRANGLER_LOG_PATH is writable, then retry npm run e2e:preview.',
        ]),
      );
    }

    throw new Error(
      formatPreflightError([
        'Preview D1 schema preflight failed before launching the browser.',
        `Command exited ${result.status}.`,
        stderr ? `stderr: ${stderr}` : '',
        'Run npm run db:migrations:apply:preview, then retry npm run e2e:preview.',
      ]),
    );
  }

  const presentColumns = parsePresentColumns(result.stdout);
  const missing = REQUIRED_PREVIEW_COLUMNS
    .map(({ table, column }) => `${table}.${column}`)
    .filter((label) => !presentColumns.has(label));

  if (missing.length > 0) {
    throw new Error(
      formatPreflightError([
        `Preview D1 schema is missing required columns: ${missing.join(', ')}.`,
        'Run npm run db:migrations:apply:preview before npm run e2e:preview.',
      ]),
    );
  }
}

module.exports = {
  REQUIRED_PREVIEW_COLUMNS,
  assertPreviewD1Schema,
  buildWranglerEnv,
  buildPreviewSchemaCheckSql,
  DEFAULT_WRANGLER_LOG_PATH,
  isWranglerAuthOrLogFailure,
  parsePresentColumns,
  WRANGLER_TIMEOUT_MS,
};
