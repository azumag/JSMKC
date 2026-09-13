'use strict';

const fs = require('node:fs');

const UPSTREAM_ISSUE_API_URL = 'https://api.github.com/repos/prisma/orm/issues/30052';
const UPSTREAM_ISSUE_NUMBER = 30052;
const UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS = 30_000;
const SAFE_GITHUB_OUTPUT_PATTERN = /^[ -~]{1,300}$/;
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ALLOWED_STATE_REASONS = new Set(['completed', 'not_planned', 'duplicate', 'reopened']);

function parseCliOptions(argv = process.argv.slice(2)) {
  const unknownArguments = argv.filter((argument) => argument !== '--json');

  if (unknownArguments.length > 0) {
    throw new Error(`Unknown option${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`);
  }

  return { json: argv.includes('--json') };
}

function isValidUtcTimestamp(value) {
  if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return new Date(timestamp).toISOString() === `${value.slice(0, -1)}.000Z`;
}

function normalizeUpstreamIssue(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('upstream issue response must be an object');
  }

  if (payload.number !== UPSTREAM_ISSUE_NUMBER) {
    throw new Error(`unexpected upstream issue number: ${payload.number ?? 'missing'}`);
  }

  if (payload.state !== 'open' && payload.state !== 'closed') {
    throw new Error(`unexpected upstream issue state: ${payload.state ?? 'missing'}`);
  }

  if (!isValidUtcTimestamp(payload.updated_at)) {
    throw new Error('upstream issue updated_at must be a valid UTC timestamp');
  }

  if (payload.html_url !== 'https://github.com/prisma/orm/issues/30052') {
    throw new Error('upstream issue html_url does not match prisma/orm#30052');
  }

  const stateReason = payload.state_reason ?? null;
  if (stateReason !== null && !ALLOWED_STATE_REASONS.has(stateReason)) {
    throw new Error(`unexpected upstream issue state_reason: ${stateReason}`);
  }

  const closedAt = payload.closed_at ?? null;
  if (closedAt !== null && !isValidUtcTimestamp(closedAt)) {
    throw new Error('upstream issue closed_at must be null or a valid UTC timestamp');
  }

  if (payload.state === 'open') {
    if (stateReason !== null && stateReason !== 'reopened') {
      throw new Error(`open upstream issue cannot have state_reason ${stateReason}`);
    }
    if (closedAt !== null) {
      throw new Error('open upstream issue must have closed_at=null');
    }
  } else {
    if (stateReason === 'reopened') {
      throw new Error('closed upstream issue cannot have state_reason reopened');
    }
    if (closedAt === null) {
      throw new Error('closed upstream issue must include closed_at');
    }
    if (Date.parse(closedAt) > Date.parse(payload.updated_at)) {
      throw new Error('closed upstream issue cannot have closed_at after updated_at');
    }
  }

  return {
    issueNumber: payload.number,
    state: payload.state,
    stateReason,
    updatedAt: payload.updated_at,
    closedAt,
    url: payload.html_url,
  };
}

function getCheckedAt(clock = () => new Date()) {
  const checkedAt = clock();
  if (!(checkedAt instanceof Date) || !Number.isFinite(checkedAt.getTime())) {
    throw new Error('upstream issue check clock returned an invalid date');
  }

  return checkedAt.toISOString();
}

async function fetchUpstreamIssue({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  clock,
  signal = AbortSignal.timeout(UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jsmkc-security-audit-review',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetchImpl(UPSTREAM_ISSUE_API_URL, {
    headers,
    redirect: 'follow',
    signal,
  });

  if (!response || typeof response.ok !== 'boolean') {
    throw new Error('upstream issue request returned an invalid response');
  }

  if (!response.ok) {
    throw new Error(`upstream issue request failed with HTTP ${response.status ?? 'unknown'}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`upstream issue response was not valid JSON: ${error.message}`);
  }

  const issue = normalizeUpstreamIssue(payload);
  const checkedAt = getCheckedAt(clock);
  if (Date.parse(checkedAt) < Date.parse(issue.updatedAt)) {
    throw new Error('upstream issue check clock is earlier than upstream updated_at');
  }

  return {
    ...issue,
    checkedAt,
  };
}

function formatUpstreamIssue(issue, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(issue)}\n`;
  }

  return (
    `Prisma upstream issue: #${issue.issueNumber}\n` +
    `state: ${issue.state}\n` +
    `state reason: ${issue.stateReason ?? 'none'}\n` +
    `checked at: ${issue.checkedAt}\n` +
    `updated at: ${issue.updatedAt}\n` +
    `closed at: ${issue.closedAt ?? 'none'}\n` +
    `url: ${issue.url}\n`
  );
}

function writeGitHubOutputs(issue, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const outputs = {
    issue_number: String(issue.issueNumber),
    state: issue.state,
    state_reason: issue.stateReason ?? 'none',
    checked_at: issue.checkedAt,
    updated_at: issue.updatedAt,
    closed_at: issue.closedAt ?? 'none',
    url: issue.url,
  };

  for (const [key, value] of Object.entries(outputs)) {
    if (typeof value !== 'string' || !SAFE_GITHUB_OUTPUT_PATTERN.test(value)) {
      throw new Error(`refusing unsafe GitHub Actions output for ${key}`);
    }
  }

  fs.appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    'utf8',
  );
}

async function main() {
  let cliOptions;
  try {
    cliOptions = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid upstream issue probe arguments: ${error.message}\n`);
    process.exit(1);
  }

  let issue;
  try {
    issue = await fetchUpstreamIssue();
  } catch (error) {
    process.stderr.write(`Failed to fetch Prisma upstream issue: ${error.message}\n`);
    process.exit(1);
  }

  process.stdout.write(formatUpstreamIssue(issue, cliOptions));

  try {
    writeGitHubOutputs(issue);
  } catch (error) {
    process.stderr.write(`Failed to publish upstream issue outputs: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  UPSTREAM_ISSUE_API_URL,
  UPSTREAM_ISSUE_NUMBER,
  UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  getCheckedAt,
  normalizeUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
};
