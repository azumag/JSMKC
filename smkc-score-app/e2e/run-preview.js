const { spawn } = require('child_process');
const { spawnSync } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const path = require('path');

const {
  resolveE2EBaseUrl,
  resolveE2EProfileDir,
} = require('./lib/env');
const {
  assertPreviewD1Schema,
} = require('./lib/preview-schema-preflight');
const {
  createPlaywrightBrowserInstallEnv,
} = require('./lib/browser-env');

function buildPreviewRuntimeEnv(env = process.env) {
  const runtimeEnv = {
    ...env,
    E2E_BASE_URL: resolveE2EBaseUrl(env),
    E2E_HEADLESS: env.E2E_HEADLESS || '1',
    E2E_PROFILE_DIR: resolveE2EProfileDir(env),
  };

  return createPlaywrightBrowserInstallEnv(runtimeEnv);
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

async function launchPreviewAdminSessionBrowser(env) {
  const { launchPersistentChromiumContext } = require('./lib/common');
  // launchPersistentChromiumContext reads process.env for E2E_HOST_RESOLVER_RULES,
  // E2E_MAC_SINGLE_PROCESS, E2E_EXECUTABLE_PATH, and E2E_BROWSER_CHANNEL internally,
  // so env must be written to process.env before calling it and restored after.
  const previousEnv = {};
  for (const [key, value] of Object.entries(env)) {
    previousEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await launchPersistentChromiumContext(env.E2E_PROFILE_DIR, {
      headless: env.E2E_HEADLESS === '1',
      viewport: { width: 1280, height: 720 },
    });
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function queryPreviewAdminSession(page) {
  return await page.evaluate(async () => {
    try {
      const response = await fetch('/api/auth/session-status', { credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      return {
        status: response.status,
        authenticated: body?.data?.authenticated === true,
        body,
      };
    } catch (error) {
      return {
        status: 0,
        authenticated: false,
        body: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function isMissingPlaywrightExecutableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Executable doesn't exist") &&
    (
      message.includes('chrome-headless-shell') ||
      message.includes('chromium_headless_shell') ||
      message.includes('playwright install')
    )
  );
}

function installPreviewBrowser(env) {
  console.warn('[preview] managed Playwright browser executable is missing; running e2e/install-browser.js chromium once.');
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'install-browser.js'), 'chromium'],
    {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(`[preview] failed to bootstrap Playwright browser cache: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`[preview] failed to bootstrap Playwright browser cache: install-browser exited ${result.status ?? 1}`);
  }
}

function previewAdminSessionError(env, session) {
  const detail = session?.error
    ? session.error
    : session?.body?.error
      ? session.body.error
      : JSON.stringify(session?.body ?? {});
  return new Error([
    'Preview E2E admin session preflight failed before shared fixture setup.',
    `/api/auth/session-status returned HTTP ${session?.status ?? 'unknown'} and did not confirm an authenticated admin session.`,
    `Detail: ${detail || '<empty response>'}.`,
    `Restore the persistent preview admin profile with: E2E_PROFILE_DIR=${env.E2E_PROFILE_DIR} npm run e2e:preview:login`,
    'Wrangler/D1 preflight warnings are separate; this browser admin session absence is blocking.',
  ].join(' '));
}

async function assertPreviewAdminSession(env, launchBrowser = launchPreviewAdminSessionBrowser) {
  if (env.E2E_SKIP_PREVIEW_ADMIN_PREFLIGHT === '1') {
    return { skipped: true };
  }

  let browser;
  try {
    browser = await launchBrowser(env);
  } catch (error) {
    if (!isMissingPlaywrightExecutableError(error)) {
      throw error;
    }
    installPreviewBrowser(env);
    browser = await launchBrowser(env);
  }

  try {
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(`${env.E2E_BASE_URL}/tournaments`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const session = await queryPreviewAdminSession(page);
    if (!session.authenticated) {
      throw previewAdminSessionError(env, session);
    }
    console.log(`[preview] admin session preflight passed for ${env.E2E_BASE_URL}`);
    return session;
  } finally {
    await browser.close().catch(() => {});
  }
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
  assertPreviewD1Schema(childEnv);
  await assertPreviewAdminSession(childEnv);

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
  assertPreviewAdminSession,
  buildPreviewRuntimeEnv,
  installPreviewBrowser,
  isMissingPlaywrightExecutableError,
  resolveHostViaPublicDns,
  runTargetScript,
  assertPreviewD1Schema,
};
