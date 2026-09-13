'use strict';

const {
  UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
  writeGitHubSummary,
} = require('./security-audit-upstream-issue-single-pass');

function toStableSnapshot(issue) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
    throw new Error('upstream issue evidence must be an object');
  }

  return {
    issueNumber: issue.issueNumber,
    state: issue.state,
    stateReason: issue.stateReason,
    commentCount: issue.commentCount,
    updatedAt: issue.updatedAt,
    closedAt: issue.closedAt,
    url: issue.url,
    latestComment: issue.latestComment,
    fixPullRequest: issue.fixPullRequest,
  };
}

function assertConsistentUpstreamIssueEvidence(first, second) {
  const firstSnapshot = toStableSnapshot(first);
  const secondSnapshot = toStableSnapshot(second);

  if (JSON.stringify(firstSnapshot) !== JSON.stringify(secondSnapshot)) {
    throw new Error('Prisma upstream issue evidence changed during consistency check; retry the probe');
  }
}

async function fetchConsistentUpstreamIssue({
  fetchIssue = fetchUpstreamIssue,
  signal = AbortSignal.timeout(UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS),
  ...fetchOptions
} = {}) {
  if (typeof fetchIssue !== 'function') {
    throw new Error('fetchIssue must be a function');
  }

  const sharedFetchOptions = { ...fetchOptions, signal };
  const first = await fetchIssue(sharedFetchOptions);
  const second = await fetchIssue(sharedFetchOptions);
  assertConsistentUpstreamIssueEvidence(first, second);
  return second;
}

async function main() {
  let cliOptions;
  try {
    cliOptions = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid upstream issue consistency probe arguments: ${error.message}\n`);
    process.exit(1);
  }

  let issue;
  try {
    issue = await fetchConsistentUpstreamIssue();
  } catch (error) {
    process.stderr.write(`Failed to fetch consistent Prisma upstream issue evidence: ${error.message}\n`);
    process.exit(1);
  }

  process.stdout.write(formatUpstreamIssue(issue, cliOptions));

  try {
    writeGitHubOutputs(issue);
    writeGitHubSummary(issue);
  } catch (error) {
    process.stderr.write(`Failed to publish consistent upstream issue outputs: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertConsistentUpstreamIssueEvidence,
  fetchConsistentUpstreamIssue,
  main,
  toStableSnapshot,
};
