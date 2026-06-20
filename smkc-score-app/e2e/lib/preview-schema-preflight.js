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
const WRANGLER_TRANSIENT_STATUS_RETRIES = 1;

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

// Detects auth/setup errors that Wrangler emits in stdout JSON instead of stderr.
// Patterns 1 & 2 (CLOUDFLARE_API_TOKEN / non-interactive) are exclusive to auth errors
// in practice, so matching them anywhere in the error text is safe.
// Pattern 3 (notes text) additionally requires code===7403 to avoid false-positives from
// unrelated Cloudflare errors that happen to contain the authorization phrase.
function isWranglerStdoutAuthError(stdout) {
  const parsed = extractWranglerJson(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const errorField = parsed.error;
  const notes = Array.isArray(errorField?.notes) ? errorField.notes : [];
  // errorField?.name ('APIError' etc.) is excluded: it never matches the auth patterns below.
  const text = [
    typeof errorField === 'string' ? errorField : '',
    errorField?.text,
    ...notes.map((note) => note?.text),
  ].filter(Boolean).join('\n');
  return (
    /CLOUDFLARE_API_TOKEN/i.test(text)
    || /non-interactive environment/i.test(text)
    || (Number(errorField?.code) === 7403 && /not valid or is not authorized/i.test(text))
  );
}

function isWranglerSchemaFailure(stderr) {
  return [
    /no such (table|column)/i,
    /SQLITE_ERROR:.*(?:no such (?:table|column)|missing (?:table|column)|unknown (?:table|column))/i,
    /schema\s+drift/i,
    /pending\s+(?:d1\s+)?migration/i,
    /missing\s+(?:d1\s+)?migration/i,
    /(?:table .+|[\w.]+ table) not found/i,
    /(?:column .+|[\w.]+ column) not found/i,
  ].some((pattern) => pattern.test(stderr));
}

function boundedOutput(value, maxLength = 800) {
  const text = String(value || '').trim();
  if (!text) return '(empty)';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function formatPreflightError(lines) {
  return lines.filter(Boolean).join('\n');
}

function shouldFailOnWranglerAuthOrLogFailure(env = process.env) {
  return env.E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT === '1';
}

function buildWranglerAuthOrLogFailureMessage(status, stderr, stdout, wranglerEnv) {
  return formatPreflightError([
    'Preview D1 schema preflight could not verify the remote database because Wrangler auth/log setup failed.',
    `Command exited ${status}.`,
    stderr ? `stderr: ${boundedOutput(stderr)}` : '',
    stdout ? `stdout: ${boundedOutput(stdout)}` : '',
    `WRANGLER_LOG_PATH=${wranglerEnv.WRANGLER_LOG_PATH}`,
    'The preview E2E run will continue because this is an environment credential/setup problem, not confirmed schema drift.',
    'Set CLOUDFLARE_API_TOKEN with D1 read access or refresh wrangler login, then rerun with E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT=1 to make this failure block browser launch.',
  ]);
}

function runWranglerSchemaCheck(sql, wranglerEnv) {
  const args = ['d1', 'execute', 'DB', '--remote', '--env', 'preview', '--json', '--command', sql];
  let result;

  for (let attempt = 0; attempt <= WRANGLER_TRANSIENT_STATUS_RETRIES; attempt += 1) {
    result = spawnSync('wrangler', args, {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: wranglerEnv,
      timeout: WRANGLER_TIMEOUT_MS,
    });

    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    if (result.status === 0 || result.error || stderr || stdout || attempt === WRANGLER_TRANSIENT_STATUS_RETRIES) {
      return { result, args };
    }
  }
}

function assertPreviewD1Schema(env = process.env) {
  if (env.E2E_SKIP_PREVIEW_SCHEMA_PREFLIGHT === '1') return;

  const sql = buildPreviewSchemaCheckSql();
  const wranglerEnv = buildWranglerEnv(env);
  const { result, args } = runWranglerSchemaCheck(sql, wranglerEnv);

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
    const stdout = String(result.stdout || '').trim();
    if (isWranglerAuthOrLogFailure(stderr) || isWranglerStdoutAuthError(stdout)) {
      const message = buildWranglerAuthOrLogFailureMessage(result.status, stderr, stdout, wranglerEnv);
      if (shouldFailOnWranglerAuthOrLogFailure(env)) {
        throw new Error(message);
      }

      console.warn(message);
      return;
    }

    throw new Error(
      formatPreflightError([
        'Wrangler exited non-zero before preview D1 schema could be verified.',
        `Command exited ${result.status}.`,
        `Command: wrangler ${args.join(' ')}`,
        `stderr: ${boundedOutput(result.stderr)}`,
        `stdout: ${boundedOutput(result.stdout)}`,
        isWranglerSchemaFailure(stderr)
          ? 'Run npm run db:migrations:apply:preview, then retry npm run e2e:preview.'
          : 'Wrangler returned a generic nonzero status; check the command output above, then retry npm run e2e:preview.',
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
  isWranglerSchemaFailure,
  isWranglerAuthOrLogFailure,
  isWranglerStdoutAuthError,
  parsePresentColumns,
  WRANGLER_TRANSIENT_STATUS_RETRIES,
  WRANGLER_TIMEOUT_MS,
};
