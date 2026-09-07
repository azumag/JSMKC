const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildPreviewRuntimeEnv, runTargetScript } = require('./run-preview');
const { runTargetScripts } = require('./run-preview-batch');

const CDM_TEST_CASE = 'TC-3040';
const CDM_TARGETS = [
  { track: 'BM', script: 'tc-bm.js' },
  { track: 'MR', script: 'tc-mr.js' },
  { track: 'GP', script: 'tc-gp.js' },
];
const DEFAULT_EVIDENCE_PATH = path.join('artifacts', 'cdm-acceptance-TC-3040.json');

function parseCliArgs(argv = process.argv.slice(2)) {
  let outputPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--output') {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for --output.');
    }
    outputPath = value;
    index += 1;
  }

  return { outputPath };
}

function resolveCommitSha(run = spawnSync) {
  const result = run('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.signal || result.status !== 0 || !result.stdout) {
    const reason =
      result.error?.message ||
      (result.signal ? `git rev-parse terminated by signal ${result.signal}` : '') ||
      (!result.stdout ? 'git rev-parse produced no output' : `git rev-parse exited with status ${result.status}`);
    throw new Error(`Failed to resolve acceptance-test commit SHA: ${reason}`);
  }

  const commitSha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error(`Acceptance-test commit SHA is not a full 40-character Git SHA: ${commitSha || '<empty>'}`);
  }

  return commitSha;
}

function isoTimestamp(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('Acceptance evidence clock must return a valid Date.');
  }
  return value.toISOString();
}

async function runCdmAcceptance({
  env = process.env,
  runTarget = runTargetScript,
  now = () => new Date(),
  commitSha,
  outputPath,
  writeFile = fs.writeFileSync,
  mkdir = fs.mkdirSync,
} = {}) {
  const runtimeEnv = buildPreviewRuntimeEnv({ ...env, E2E_TESTS: CDM_TEST_CASE });
  const resolvedCommitSha = commitSha || resolveCommitSha();
  const resolvedOutputPath = outputPath || env.CDM_ACCEPTANCE_EVIDENCE_PATH || DEFAULT_EVIDENCE_PATH;
  const startedAt = isoTimestamp(now);
  const observedResults = [];

  const targetByScript = new Map(CDM_TARGETS.map((target) => [target.script, target]));
  const wrappedRunTarget = async (targetScript, targetEnv) => {
    const target = targetByScript.get(targetScript);
    const targetStartedAt = isoTimestamp(now);

    try {
      const exitCode = await runTarget(targetScript, targetEnv);
      observedResults.push({
        track: target?.track || targetScript,
        script: targetScript,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode,
        startedAt: targetStartedAt,
        finishedAt: isoTimestamp(now),
      });
      return exitCode;
    } catch (error) {
      observedResults.push({
        track: target?.track || targetScript,
        script: targetScript,
        status: 'FAIL',
        exitCode: null,
        error: error instanceof Error ? error.message : String(error),
        startedAt: targetStartedAt,
        finishedAt: isoTimestamp(now),
      });
      return 1;
    }
  };

  const exitCode = await runTargetScripts(
    CDM_TARGETS.map((target) => target.script),
    runtimeEnv,
    wrappedRunTarget,
  );

  const tracks = CDM_TARGETS.map((target) => {
    const observed = observedResults.find((result) => result.script === target.script);
    return (
      observed || {
        track: target.track,
        script: target.script,
        status: 'NOT_RUN',
        exitCode: null,
        startedAt: null,
        finishedAt: null,
      }
    );
  });

  const evidence = {
    schemaVersion: 1,
    testCase: CDM_TEST_CASE,
    environment: 'preview',
    appUrl: runtimeEnv.E2E_BASE_URL,
    commitSha: resolvedCommitSha,
    startedAt,
    finishedAt: isoTimestamp(now),
    resultSummary: exitCode === 0 ? 'PASS' : 'FAIL',
    tracks,
  };

  mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  writeFile(resolvedOutputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  return { exitCode, evidence, outputPath: resolvedOutputPath };
}

async function main(argv = process.argv.slice(2)) {
  const { outputPath } = parseCliArgs(argv);
  const result = await runCdmAcceptance({ outputPath });
  console.log(`[cdm-acceptance] evidence written to ${result.outputPath}`);
  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  CDM_TARGETS,
  CDM_TEST_CASE,
  DEFAULT_EVIDENCE_PATH,
  parseCliArgs,
  resolveCommitSha,
  runCdmAcceptance,
};
