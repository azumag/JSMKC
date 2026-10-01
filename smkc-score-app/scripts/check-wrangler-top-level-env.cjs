'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ENV_WARNING = 'Multiple environments are defined in the Wrangler configuration file';
const appRoot = path.resolve(__dirname, '..');
const wranglerBin = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

function runDryRun(configPath, outputDir, explicitTopLevel) {
  const args = ['deploy', '--dry-run', '--config', configPath, '--outdir', outputDir];
  if (explicitTopLevel) args.splice(1, 0, '--env=');

  const result = spawnSync(wranglerBin, args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    error: result.error,
  };
}

function assertSuccess(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}:\n${result.output}`);
  }
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smkc-wrangler-env-'));

  try {
    const configPath = path.join(tempRoot, 'wrangler.toml');
    const workerPath = path.join(tempRoot, 'worker.mjs');
    fs.writeFileSync(workerPath, 'export default { fetch() { return new Response("ok"); } };\n');
    fs.writeFileSync(
      configPath,
      [
        'name = "smkc-top-level-env-probe"',
        'main = "worker.mjs"',
        'compatibility_date = "2026-03-17"',
        '',
        '[vars]',
        'TARGET = "top-level"',
        '',
        '[env.preview]',
        'name = "smkc-top-level-env-probe-preview"',
        '',
        '[env.preview.vars]',
        'TARGET = "preview"',
        '',
      ].join('\n'),
    );

    const implicit = runDryRun(configPath, path.join(tempRoot, 'implicit'), false);
    assertSuccess(implicit, 'implicit-environment dry run');
    if (!implicit.output.includes(ENV_WARNING)) {
      throw new Error('expected Wrangler to warn when multiple environments exist and no target is specified');
    }

    const explicit = runDryRun(configPath, path.join(tempRoot, 'explicit'), true);
    assertSuccess(explicit, 'explicit top-level dry run');
    if (explicit.output.includes(ENV_WARNING)) {
      throw new Error('Wrangler still reported an ambiguous environment with --env=""');
    }

    process.stdout.write('Wrangler --env="" top-level dry-run contract verified.\n');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`check-wrangler-top-level-env: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  ENV_WARNING,
  runDryRun,
};
