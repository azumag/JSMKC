'use strict';

const fs = require('node:fs');

const UPSTREAM_ISSUE_API_URL = 'https://api.github.com/repos/prisma/orm/issues/30052';
const UPSTREAM_ISSUE_COMMENTS_API_URL = 'https://api.github.com/repos/prisma/orm/issues/30052/comments';
const UPSTREAM_ISSUE_NUMBER = 30052;
const UPSTREAM_FIX_PR_API_URL = 'https://api.github.com/repos/prisma/orm/pulls/30189';
const UPSTREAM_FIX_PR_NUMBER = 30189;
const UPSTREAM_FIX_PR_BASE_REF = 'v7';
const UPSTREAM_FIX_PR_MERGE_COMMIT_SHA = '93118fdeba185110fb7b0bd5e945461405baf65a';
const UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS = 30_000;
const SAFE_GITHUB_OUTPUT_PATTERN = /^[ -~]{1,300}$/;
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const AUTHOR_ASSOCIATION_PATTERN = /^[A-Z_]{1,40}$/;
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

  if (!Number.isSafeInteger(payload.comments) || payload.comments < 0) {
    throw new Error('upstream issue comments must be a non-negative safe integer');
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
    commentCount: payload.comments,
    updatedAt: payload.updated_at,
    closedAt,
    url: payload.html_url,
  };
}

function normalizeUpstreamFixPullRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('upstream fix pull request response must be an object');
  }

  if (payload.number !== UPSTREAM_FIX_PR_NUMBER) {
    throw new Error(`unexpected upstream fix pull request number: ${payload.number ?? 'missing'}`);
  }

  if (payload.html_url !== 'https://github.com/prisma/orm/pull/30189') {
    throw new Error('upstream fix pull request html_url does not match prisma/orm#30189');
  }

  if (payload.state !== 'closed' || payload.merged !== true) {
    throw new Error('upstream fix pull request must remain merged and closed');
  }

  if (payload.base?.ref !== UPSTREAM_FIX_PR_BASE_REF) {
    throw new Error(`upstream fix pull request base must remain ${UPSTREAM_FIX_PR_BASE_REF}`);
  }

  if (payload.merge_commit_sha !== UPSTREAM_FIX_PR_MERGE_COMMIT_SHA) {
    throw new Error('upstream fix pull request merge commit changed unexpectedly');
  }

  if (!isValidUtcTimestamp(payload.updated_at)) {
    throw new Error('upstream fix pull request updated_at must be a valid UTC timestamp');
  }

  if (!isValidUtcTimestamp(payload.merged_at)) {
    throw new Error('upstream fix pull request merged_at must be a valid UTC timestamp');
  }

  if (Date.parse(payload.merged_at) > Date.parse(payload.updated_at)) {
    throw new Error('upstream fix pull request cannot have merged_at after updated_at');
  }

  return {
    pullRequestNumber: payload.number,
    state: payload.state,
    merged: payload.merged,
    baseRef: payload.base.ref,
    mergeCommitSha: payload.merge_commit_sha,
    mergedAt: payload.merged_at,
    updatedAt: payload.updated_at,
    url: payload.html_url,
  };
}

function getLatestCommentApiUrl(commentCount) {
  if (!Number.isSafeInteger(commentCount) || commentCount < 0) {
    throw new Error('upstream issue comment count must be a non-negative safe integer');
  }

  if (commentCount === 0) {
    return null;
  }

  return `${UPSTREAM_ISSUE_COMMENTS_API_URL}?per_page=1&page=${commentCount}`;
}

function normalizeLatestUpstreamIssueComment(payload) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error('latest upstream issue comment response must contain exactly one comment');
  }

  const comment = payload[0];
  if (!comment || typeof comment !== 'object' || Array.isArray(comment)) {
    throw new Error('latest upstream issue comment must be an object');
  }

  if (!Number.isSafeInteger(comment.id) || comment.id <= 0) {
    throw new Error('latest upstream issue comment id must be a positive safe integer');
  }

  if (comment.issue_url !== UPSTREAM_ISSUE_API_URL) {
    throw new Error('latest upstream issue comment issue_url does not match prisma/orm#30052');
  }

  const expectedHtmlUrl = `https://github.com/prisma/orm/issues/30052#issuecomment-${comment.id}`;
  if (comment.html_url !== expectedHtmlUrl) {
    throw new Error('latest upstream issue comment html_url does not match prisma/orm#30052');
  }

  const author = comment.user?.login;
  if (typeof author !== 'string' || !GITHUB_LOGIN_PATTERN.test(author)) {
    throw new Error('latest upstream issue comment author login is invalid');
  }

  if (typeof comment.author_association !== 'string' || !AUTHOR_ASSOCIATION_PATTERN.test(comment.author_association)) {
    throw new Error('latest upstream issue comment author_association is invalid');
  }

  if (!isValidUtcTimestamp(comment.created_at)) {
    throw new Error('latest upstream issue comment created_at must be a valid UTC timestamp');
  }

  if (!isValidUtcTimestamp(comment.updated_at)) {
    throw new Error('latest upstream issue comment updated_at must be a valid UTC timestamp');
  }

  if (Date.parse(comment.created_at) > Date.parse(comment.updated_at)) {
    throw new Error('latest upstream issue comment cannot have created_at after updated_at');
  }

  return {
    id: comment.id,
    author,
    authorAssociation: comment.author_association,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    url: comment.html_url,
  };
}

function getCheckedAt(clock = () => new Date()) {
  const checkedAt = clock();
  if (!(checkedAt instanceof Date) || !Number.isFinite(checkedAt.getTime())) {
    throw new Error('upstream issue check clock returned an invalid date');
  }

  return checkedAt.toISOString();
}

async function fetchJsonEvidence(fetchImpl, url, request, label) {
  const response = await fetchImpl(url, request);

  if (!response || typeof response.ok !== 'boolean') {
    throw new Error(`${label} request returned an invalid response`);
  }

  if (!response.ok) {
    throw new Error(`${label} request failed with HTTP ${response.status ?? 'unknown'}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} response was not valid JSON: ${error.message}`);
  }
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
  const request = {
    headers,
    redirect: 'error',
    signal,
  };

  const issuePayload = await fetchJsonEvidence(fetchImpl, UPSTREAM_ISSUE_API_URL, request, 'upstream issue');
  const issue = normalizeUpstreamIssue(issuePayload);
  const fixPullRequestPayload = await fetchJsonEvidence(
    fetchImpl,
    UPSTREAM_FIX_PR_API_URL,
    request,
    'upstream fix pull request',
  );
  const fixPullRequest = normalizeUpstreamFixPullRequest(fixPullRequestPayload);
  const latestCommentUrl = getLatestCommentApiUrl(issue.commentCount);
  let latestComment = null;

  if (latestCommentUrl) {
    const latestCommentPayload = await fetchJsonEvidence(
      fetchImpl,
      latestCommentUrl,
      request,
      'latest upstream issue comment',
    );
    latestComment = normalizeLatestUpstreamIssueComment(latestCommentPayload);
  }

  const checkedAt = getCheckedAt(clock);
  const newestUpstreamTimestamp = Math.max(
    Date.parse(issue.updatedAt),
    Date.parse(fixPullRequest.updatedAt),
    latestComment ? Date.parse(latestComment.updatedAt) : Number.NEGATIVE_INFINITY,
  );
  if (Date.parse(checkedAt) < newestUpstreamTimestamp) {
    throw new Error('upstream issue check clock is earlier than upstream evidence updated_at');
  }

  return {
    ...issue,
    checkedAt,
    latestComment,
    fixPullRequest,
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
    `comment count: ${issue.commentCount}\n` +
    `checked at: ${issue.checkedAt}\n` +
    `updated at: ${issue.updatedAt}\n` +
    `closed at: ${issue.closedAt ?? 'none'}\n` +
    `url: ${issue.url}\n` +
    `latest comment id: ${issue.latestComment?.id ?? 'none'}\n` +
    `latest comment author: ${issue.latestComment?.author ?? 'none'}\n` +
    `latest comment author association: ${issue.latestComment?.authorAssociation ?? 'none'}\n` +
    `latest comment created at: ${issue.latestComment?.createdAt ?? 'none'}\n` +
    `latest comment updated at: ${issue.latestComment?.updatedAt ?? 'none'}\n` +
    `latest comment url: ${issue.latestComment?.url ?? 'none'}\n` +
    `upstream fix PR: #${issue.fixPullRequest.pullRequestNumber}\n` +
    `fix PR state: ${issue.fixPullRequest.state}\n` +
    `fix PR merged: ${issue.fixPullRequest.merged}\n` +
    `fix PR base: ${issue.fixPullRequest.baseRef}\n` +
    `fix PR merge commit: ${issue.fixPullRequest.mergeCommitSha}\n` +
    `fix PR merged at: ${issue.fixPullRequest.mergedAt}\n` +
    `fix PR updated at: ${issue.fixPullRequest.updatedAt}\n` +
    `fix PR url: ${issue.fixPullRequest.url}\n`
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
    comment_count: String(issue.commentCount),
    checked_at: issue.checkedAt,
    updated_at: issue.updatedAt,
    closed_at: issue.closedAt ?? 'none',
    url: issue.url,
    latest_comment_id: issue.latestComment ? String(issue.latestComment.id) : 'none',
    latest_comment_author: issue.latestComment?.author ?? 'none',
    latest_comment_author_association: issue.latestComment?.authorAssociation ?? 'none',
    latest_comment_created_at: issue.latestComment?.createdAt ?? 'none',
    latest_comment_updated_at: issue.latestComment?.updatedAt ?? 'none',
    latest_comment_url: issue.latestComment?.url ?? 'none',
    fix_pr_number: String(issue.fixPullRequest.pullRequestNumber),
    fix_pr_state: issue.fixPullRequest.state,
    fix_pr_merged: String(issue.fixPullRequest.merged),
    fix_pr_base_ref: issue.fixPullRequest.baseRef,
    fix_pr_merge_commit_sha: issue.fixPullRequest.mergeCommitSha,
    fix_pr_merged_at: issue.fixPullRequest.mergedAt,
    fix_pr_updated_at: issue.fixPullRequest.updatedAt,
    fix_pr_url: issue.fixPullRequest.url,
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
    process.stderr.write(`Failed to fetch Prisma upstream issue evidence: ${error.message}\n`);
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
  UPSTREAM_FIX_PR_API_URL,
  UPSTREAM_FIX_PR_BASE_REF,
  UPSTREAM_FIX_PR_MERGE_COMMIT_SHA,
  UPSTREAM_FIX_PR_NUMBER,
  UPSTREAM_ISSUE_API_URL,
  UPSTREAM_ISSUE_COMMENTS_API_URL,
  UPSTREAM_ISSUE_NUMBER,
  UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  getCheckedAt,
  getLatestCommentApiUrl,
  normalizeLatestUpstreamIssueComment,
  normalizeUpstreamFixPullRequest,
  normalizeUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
};
