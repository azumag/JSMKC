#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  createPlaywrightBrowserInstallEnv,
  resolvePlaywrightBrowsersPath,
} = require('./lib/common');

function printUsage() {
  console.log([
    'Install the Playwright-managed browser used by the E2E scripts.',
    '',
    'Usage:',
    '  node e2e/install-browser.js [browser]',
    '',
    'Examples:',
    '  node e2e/install-browser.js',
    '  node e2e/install-browser.js chromium',
  ].join('\n'));
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const browser = process.argv[2] || 'chromium';
const env = createPlaywrightBrowserInstallEnv();

console.log(`[e2e:install-browser] browser: ${browser}`);
console.log(`[e2e:install-browser] PLAYWRIGHT_BROWSERS_PATH=${resolvePlaywrightBrowsersPath()}`);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'install', browser],
  { stdio: 'inherit', env },
);

if (result.error) {
  console.error('[e2e:install-browser] failed:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
