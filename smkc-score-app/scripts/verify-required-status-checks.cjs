#!/usr/bin/env node

const DEFAULT_REQUIRED_CHECKS = ['Lint & Test', 'Prisma / D1 migration parity'];

function observedCheckNames(requiredStatusChecks) {
  const names = new Set();

  for (const context of requiredStatusChecks?.contexts ?? []) {
    if (typeof context === 'string' && context.length > 0) {
      names.add(context);
    }
  }

  for (const check of requiredStatusChecks?.checks ?? []) {
    if (typeof check?.context === 'string' && check.context.length > 0) {
      names.add(check.context);
    }
  }

  return [...names].sort();
}

function assessRequiredStatusChecks(branch, requiredChecks = DEFAULT_REQUIRED_CHECKS) {
  const requiredStatusChecks = branch?.protection?.required_status_checks;
  const observedChecks = observedCheckNames(requiredStatusChecks);
  const missingChecks = requiredChecks.filter((name) => !observedChecks.includes(name));
  const enforcementLevel = requiredStatusChecks?.enforcement_level ?? 'off';
  const protectedBranch = branch?.protected === true && branch?.protection?.enabled === true;
  const enforced = protectedBranch && enforcementLevel !== 'off';

  return {
    ok: enforced && missingChecks.length === 0,
    branch: branch?.name ?? null,
    protectedBranch,
    enforcementLevel,
    requiredChecks,
    observedChecks,
    missingChecks,
  };
}

function parseArgs(argv) {
  const options = {
    stdin: false,
    json: false,
    repository: process.env.GITHUB_REPOSITORY || 'azumag/JSMKC',
    branch: 'main',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--stdin') {
      options.stdin = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--repo') {
      options.repository = argv[index + 1];
      index += 1;
    } else if (arg === '--branch') {
      options.branch = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.repository || !options.repository.includes('/')) {
    throw new Error('--repo must be in owner/name form');
  }

  if (!options.branch) {
    throw new Error('--branch must not be empty');
  }

  return options;
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

async function fetchBranch(repository, branch) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jsmkc-required-status-check-verifier',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub branch query failed (${response.status}): ${body}`);
  }

  return response.json();
}

function printHuman(result) {
  console.log(`Branch: ${result.branch ?? 'unknown'}`);
  console.log(`Protected: ${result.protectedBranch ? 'yes' : 'no'}`);
  console.log(`Required-check enforcement: ${result.enforcementLevel}`);
  console.log(`Observed required checks: ${result.observedChecks.join(', ') || '(none)'}`);

  if (result.ok) {
    console.log('Required status check policy is enforced.');
  } else {
    console.error(
      `Required status check policy is not ready. Missing: ${result.missingChecks.join(', ') || '(none)'}`,
    );
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const branch = options.stdin
      ? JSON.parse(await readStdin())
      : await fetchBranch(options.repository, options.branch);
    const result = assessRequiredStatusChecks(branch);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
    }

    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_REQUIRED_CHECKS,
  assessRequiredStatusChecks,
  observedCheckNames,
};
