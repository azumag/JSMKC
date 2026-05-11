const { spawnSync } = require('child_process');

const REQUIRED_PREVIEW_COLUMNS = [
  { table: 'Tournament', column: 'publicModes' },
  { table: 'GPMatch', column: 'suddenDeathWinnerId' },
];

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

function assertPreviewD1Schema(env = process.env) {
  if (env.E2E_SKIP_PREVIEW_SCHEMA_PREFLIGHT === '1') return;

  const sql = buildPreviewSchemaCheckSql();
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'DB', '--remote', '--env', 'preview', '--json', '--command', sql],
    { encoding: 'utf8', cwd: process.cwd(), env, timeout: 30_000 },
  );

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      [
        'Preview D1 schema preflight timed out after 30 seconds before launching the browser.',
        'Check Cloudflare/Wrangler connectivity, run npm run db:migrations:apply:preview if needed, then retry npm run e2e:preview.',
      ].join(' '),
    );
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(
      [
        'Preview D1 schema preflight failed before launching the browser.',
        `Command exited ${result.status}.`,
        stderr ? `stderr: ${stderr}` : '',
        'Run npm run db:migrations:apply:preview, then retry npm run e2e:preview.',
      ].filter(Boolean).join(' '),
    );
  }

  const presentColumns = parsePresentColumns(result.stdout);
  const missing = REQUIRED_PREVIEW_COLUMNS
    .map(({ table, column }) => `${table}.${column}`)
    .filter((label) => !presentColumns.has(label));

  if (missing.length > 0) {
    throw new Error(
      [
        `Preview D1 schema is missing required columns: ${missing.join(', ')}.`,
        'Run npm run db:migrations:apply:preview before npm run e2e:preview.',
      ].join(' '),
    );
  }
}

module.exports = {
  REQUIRED_PREVIEW_COLUMNS,
  assertPreviewD1Schema,
  buildPreviewSchemaCheckSql,
  parsePresentColumns,
};
