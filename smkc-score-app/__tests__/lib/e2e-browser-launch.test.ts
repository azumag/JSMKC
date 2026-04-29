import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import os from 'os';
import path from 'path';
import * as common from '../../e2e/lib/common';

describe('E2E browser launch helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.E2E_BROWSER_HOME;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    delete process.env.E2E_EXECUTABLE_PATH;
    delete process.env.E2E_BROWSER_CHANNEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults Playwright browsers to a writable temp path', () => {
    expect(common.resolveE2EBrowserHome()).toBe(path.join(os.tmpdir(), 'playwright-e2e-home'));
    expect(common.resolvePlaywrightBrowsersPath()).toBe(
      path.join(os.tmpdir(), 'playwright-e2e-home', 'ms-playwright'),
    );
  });

  it('respects caller-provided browser home and installs path env', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    const env = common.createPlaywrightBrowserInstallEnv();

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
  });

  it('syncs Playwright browser cache into process.env before launch', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';

    const env = common.ensurePlaywrightBrowserRuntimeEnv();

    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-browser-home/ms-playwright');
    expect(process.env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(process.env.PLAYWRIGHT_BROWSERS_PATH);
  });

  it('propagates explicit executable path into the chromium launch config', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    process.env.E2E_EXECUTABLE_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';
    process.env.E2E_BROWSER_CHANNEL = 'chrome';

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
});
