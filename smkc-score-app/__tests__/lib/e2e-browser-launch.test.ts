import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import os from 'os';
import path from 'path';

type E2ECommon = typeof import('../../e2e/lib/common');

function loadCommon() {
  let loaded: E2ECommon | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/lib/common') as E2ECommon;
  });
  if (!loaded) throw new Error('Failed to load e2e common helpers');
  return loaded;
}

describe('E2E browser launch helpers', () => {
  const originalEnv = { ...process.env };
  let common: E2ECommon;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.E2E_BROWSER_HOME;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    delete process.env.E2E_EXECUTABLE_PATH;
    delete process.env.E2E_BROWSER_CHANNEL;
    delete process.env.E2E_HOST_RESOLVER_RULES;
    common = loadCommon();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.dontMock('playwright');
  });

  it('defaults Playwright browsers to a writable temp path', () => {
    expect(common.resolveE2EBrowserHome()).toBe(path.join(os.tmpdir(), 'playwright-e2e-home'));
    expect(common.resolvePlaywrightBrowsersPath()).toBe(
      path.join(os.tmpdir(), 'playwright-e2e-home', 'ms-playwright'),
    );
  });

  it('initializes Playwright cache env before importing Playwright', () => {
    process.env = {
      ...originalEnv,
      E2E_BROWSER_HOME: '/tmp/jsmkc-browser-home',
    };
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    let capturedBrowsersPath: string | undefined;
    let capturedSkipBrowserGc: string | undefined;

    jest.doMock('playwright', () => {
      capturedBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
      capturedSkipBrowserGc = process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
      return {
        chromium: {
          launch: jest.fn(),
          launchPersistentContext: jest.fn(),
        },
      };
    });

    common = loadCommon();

    expect(capturedBrowsersPath).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(capturedSkipBrowserGc).toBe('1');
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(process.env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
    expect(common.resolvePlaywrightBrowsersPath()).toBe('/tmp/jsmkc-browser-home/ms-playwright');
  });

  it('respects caller-provided browser home and installs path env', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    common = loadCommon();

    const env = common.createPlaywrightBrowserInstallEnv();

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
  });

  it('uses explicit Playwright browsers path env when provided', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/jsmkc-explicit-browsers';
    common = loadCommon();

    const env = common.createPlaywrightBrowserInstallEnv();

    expect(common.resolvePlaywrightBrowsersPath()).toBe('/tmp/jsmkc-explicit-browsers');
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-explicit-browsers');
  });

  it('syncs Playwright browser cache into process.env during explicit runtime initialization', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    common = loadCommon();

    const env = common.initializePlaywrightBrowserRuntimeEnv();

    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(process.env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(process.env.PLAYWRIGHT_BROWSERS_PATH);
  });

  it('propagates explicit executable path into the chromium launch config', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    process.env.E2E_EXECUTABLE_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';
    process.env.E2E_BROWSER_CHANNEL = 'chrome';
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    common = loadCommon();

    const config = common.getChromiumLaunchConfig();

    expect(config.executablePath).toBe('/Applications/Chromium.app/Contents/MacOS/Chromium');
    expect(config.channel).toBeUndefined();
    expect(config.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(config.env.HOME).toBe('/tmp/jsmkc-browser-home');
  });

  it('uses browser channel when no explicit executable path is set', () => {
    process.env.E2E_BROWSER_CHANNEL = 'chrome';

    const config = common.getChromiumLaunchConfig();

    expect(config.channel).toBe('chrome');
    expect(config.executablePath).toBeUndefined();
  });

  it('appends host resolver rules when provided', () => {
    process.env.E2E_HOST_RESOLVER_RULES = 'MAP preview.smkc.bluemoon.works 104.21.41.48';

    const config = common.getChromiumLaunchConfig();

    expect(config.args).toContain('--host-resolver-rules=MAP preview.smkc.bluemoon.works 104.21.41.48');
  });

  it('disables Crashpad for automated preview launches and keeps dumps in browser home', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    common = loadCommon();

    const config = common.getChromiumLaunchConfig();

    expect(config.args).toContain('--disable-crashpad-for-testing');
    expect(config.args).toContain('--disable-breakpad');
    expect(config.args).toContain('--crash-dumps-dir=/tmp/jsmkc-browser-home/Crashpad');
  });
});
