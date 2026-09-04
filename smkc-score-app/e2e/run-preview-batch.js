const { buildPreviewRuntimeEnv, runTargetScript } = require('./run-preview');

function parseTargetScripts(argv = process.argv.slice(2)) {
  const targetScripts = argv.filter(Boolean);
  if (targetScripts.length === 0) {
    throw new Error('Missing preview E2E target script names.');
  }
  return targetScripts;
}

async function runTargetScripts(
  targetScripts,
  env = buildPreviewRuntimeEnv(process.env),
  runTarget = runTargetScript,
) {
  for (const targetScript of targetScripts) {
    console.log(`[preview-batch] running ${targetScript}`);
    const exitCode = await runTarget(targetScript, env);
    if (exitCode !== 0) {
      console.error(`[preview-batch] ${targetScript} failed with exit code ${exitCode}`);
      return exitCode;
    }
  }

  return 0;
}

async function main(argv = process.argv.slice(2)) {
  const targetScripts = parseTargetScripts(argv);
  const env = buildPreviewRuntimeEnv(process.env);
  const exitCode = await runTargetScripts(targetScripts, env);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  parseTargetScripts,
  runTargetScripts,
};
