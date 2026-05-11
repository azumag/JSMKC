const { spawn } = require('child_process');
const { spawnSync } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const path = require('path');

const {
  resolveE2EBaseUrl,
  resolveE2EProfileDir,
} = require('./lib/env');

function buildPreviewRuntimeEnv(env = process.env) {
  const runtimeEnv = {
    ...env,
    E2E_BASE_URL: resolveE2EBaseUrl(env),
    E2E_PROFILE_DIR: resolveE2EProfileDir(env),
  };

  return runtimeEnv;
}

async function assertBaseUrlResolvable(baseUrl) {
  const { hostname } = new URL(baseUrl);
  try {
    await dns.lookup(hostname);
    return null;
  } catch (error) {
    const fallbackAddress = resolveHostViaPublicDns(hostname);
    if (fallbackAddress) {
      return fallbackAddress;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `E2E target host "${hostname}" could not be resolved (${detail}).`,
        'The preview custom domain may be missing or DNS may not be ready.',
        `Rerun with a reachable preview host via E2E_BASE_URL=${baseUrl.replace(hostname, '<reachable-host>')}.`,
        'Production runs still require E2E_ALLOW_PRODUCTION=1.',
      ].join(' '),
    );
  }
}

function resolveHostViaPublicDns(hostname) {
  const records = [
    { type: 'A', family: 4 },
    { type: 'AAAA', family: 6 },
  ];

  for (const record of records) {
    const result = spawnSync('dig', ['+short', record.type, hostname, '@1.1.1.1'], {
      encoding: 'utf8',
    });
    if (result.status !== 0) continue;

    const addresses = (result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => net.isIP(line) === record.family);

    if (addresses[0]) return addresses[0];
  }

  return null;
}

async function runTargetScript(targetScript, env = buildPreviewRuntimeEnv()) {
  if (!targetScript) throw new Error('Missing preview E2E target script name.');
  const { hostname } = new URL(env.E2E_BASE_URL);
  const fallbackAddress = await assertBaseUrlResolvable(env.E2E_BASE_URL);
  const childEnv = {
    ...env,
  };
  if (fallbackAddress && !childEnv.E2E_HOST_RESOLVER_RULES) {
    childEnv.E2E_HOST_RESOLVER_RULES = `MAP ${hostname} ${fallbackAddress}`;
  }

  const targetPath = path.join(__dirname, targetScript);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [targetPath], {
      cwd: path.join(__dirname, '..'),
      env: childEnv,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Preview E2E child exited via signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main(argv = process.argv.slice(2)) {
  const [targetScript] = argv;
  const env = buildPreviewRuntimeEnv(process.env);
  const exitCode = await runTargetScript(targetScript, env);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  assertBaseUrlResolvable,
  buildPreviewRuntimeEnv,
  resolveHostViaPublicDns,
  runTargetScript,
};
