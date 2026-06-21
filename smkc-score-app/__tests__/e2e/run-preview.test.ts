import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import packageJson from '../../package.json';

const lookupMock = jest.fn();
const spawnSyncMock = jest.fn();

jest.mock('dns', () => ({
  promises: {
    lookup: (...args: unknown[]) => lookupMock(...args),
  },
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

type PreviewRunner = typeof import('../../e2e/run-preview');
type E2ECommon = typeof import('../../e2e/lib/common');

function loadRunner() {
  let loaded: PreviewRunner | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/run-preview') as PreviewRunner;
  });
  if (!loaded) throw new Error('Failed to load preview runner');
  return loaded;
}

function loadCommon() {
  let loaded: E2ECommon | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/lib/common') as E2ECommon;
  });
  if (!loaded) throw new Error('Failed to load e2e common helpers');
  return loaded;
}

describe('preview E2E runner', () => {
  const originalEnv = { ...process.env };
  let runner: PreviewRunner;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.E2E_BASE_URL;
    delete process.env.E2E_ALLOW_PRODUCTION;
    delete process.env.E2E_PROFILE_DIR;
    delete process.env.E2E_BROWSER_CHANNEL;
    delete process.env.E2E_EXECUTABLE_PATH;
    delete process.env.E2E_BROWSER_HOME;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    lookupMock.mockReset();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: '' });
    runner = loadRunner();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('builds preview runtime env with default preview target', () => {
    const env = runner.buildPreviewRuntimeEnv({});

    expect(env.E2E_BASE_URL).toBe('https://preview.smkc.bluemoon.works');
    expect(env.E2E_PROFILE_DIR).toBe('/tmp/playwright-smkc-preview-profile');
  });

  it('passes the managed Playwright browser cache to the preview child process before import time', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_BROWSER_HOME: '/tmp/jsmkc-preview-browser-home',
    });

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-preview-browser-home/ms-playwright');
    expect(env.PLAYWRIGHT_SKIP_BROWSER_GC).toBe('1');
  });

  it('preserves a caller-provided Playwright browser cache for preview runs', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_BROWSER_HOME: '/tmp/jsmkc-preview-browser-home',
      PLAYWRIGHT_BROWSERS_PATH: '/tmp/jsmkc-explicit-preview-browsers',
    });

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/tmp/jsmkc-explicit-preview-browsers');
  });

  it('exposes npm run e2e:preview as the official all-suite preview alias', () => {
    expect(packageJson.scripts['e2e:preview']).toBe('node e2e/run-preview.js tc-all.js');
  });

  it('keeps e2e:preview:all as a delegated compatibility alias', () => {
    expect(packageJson.scripts['e2e:preview:all']).toBe('npm run e2e:preview --');
  });

  it('exposes the preview admin login helper as a selector-driven E2E setup script', () => {
    expect(packageJson.scripts['e2e:preview:login']).toBe('node e2e/login-preview-admin.js');
  });

  it('exposes preview schema preflight for E2E startup checks', () => {
    expect(typeof runner.assertPreviewD1Schema).toBe('function');
  });

  it('exposes preview admin session preflight for E2E startup checks', () => {
    expect(typeof runner.assertPreviewAdminSession).toBe('function');
  });

  it('exposes missing Playwright executable detection for preview bootstrap recovery', () => {
    // Path suffix is platform-specific (linux-x64, mac-arm64, etc.); detection uses substring match on chrome-headless-shell
    expect(runner.isMissingPlaywrightExecutableError(
      new Error("browserType.launchPersistentContext: Executable doesn't exist at /tmp/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell"),
    )).toBe(true);
    // Playwright may also emit a "playwright install" hint instead of the full path (issue #2431)
    expect(runner.isMissingPlaywrightExecutableError(
      new Error("browserType.launchPersistentContext: Executable doesn't exist\nRun: playwright install chromium"),
    )).toBe(true);
    expect(runner.isMissingPlaywrightExecutableError(new Error('No active session'))).toBe(false);
  });

  it('regenerates Prisma Client before Cloudflare builds used by preview deploys', () => {
    expect(packageJson.scripts['prebuild:cf']).toBe('prisma generate');
    expect(packageJson.scripts['deploy:preview']).toContain('npm run build:cf');
  });

  it('exposes a focused preview debug-fill coverage script', () => {
    expect(packageJson.scripts['e2e:debug-fill']).toBe('node e2e/tc-debug-fill.js');
    expect(packageJson.scripts['e2e:preview:debug-fill']).toBe('node e2e/run-preview.js tc-debug-fill.js');
  });

  it('exposes a focused preview archive coverage script', () => {
    expect(packageJson.scripts['e2e:archive']).toBe('node e2e/tc-archive.js');
    expect(packageJson.scripts['e2e:preview:archive']).toBe('node e2e/run-preview.js tc-archive.js');
  });

  it('exposes a focused browser launch smoke script for preview startup failures', () => {
    expect(packageJson.scripts['e2e:launch-smoke']).toBe('node e2e/browser-launch-smoke.js');
    expect(packageJson.scripts['e2e:preview:launch-smoke']).toBe('node e2e/run-preview.js browser-launch-smoke.js');
  });

  it('defaults preview E2E runs to headless browser launch', () => {
    const env = runner.buildPreviewRuntimeEnv({});

    expect(env.E2E_HEADLESS).toBe('1');
  });

  it('does not auto-select installed Chrome on macOS preview runs', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const env = runner.buildPreviewRuntimeEnv({});

    expect(env.E2E_BROWSER_CHANNEL).toBeUndefined();

    if (platform) {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('keeps Crashpad launch isolation in the executable launch helper contract', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-preview-browser-home';
    const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

    const config = loadCommon().getChromiumLaunchConfig();

    expect(config.env.HOME).toBe('/tmp/jsmkc-preview-browser-home');
    expect(config.env.XDG_CONFIG_HOME).toBe('/tmp/jsmkc-preview-browser-home/.config');
    expect(config.env.XDG_CACHE_HOME).toBe('/tmp/jsmkc-preview-browser-home/.cache');
    expect(config.args).toContain('--disable-crashpad-for-testing');
    expect(config.args).toContain('--disable-breakpad');
    expect(config.args).toContain('--crash-dumps-dir=/tmp/jsmkc-preview-browser-home/Crashpad');
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-preview-browser-home', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-preview-browser-home/.config', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-preview-browser-home/.cache', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-preview-browser-home/Crashpad', { recursive: true });
  });

  it('preserves caller-provided browser channel override', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_BROWSER_CHANNEL: 'chrome',
    });

    expect(env.E2E_BROWSER_CHANNEL).toBe('chrome');
  });

  it('preserves caller-provided headless override', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_HEADLESS: '0',
    });

    expect(env.E2E_HEADLESS).toBe('0');
  });

  it('preserves caller-provided executable path override', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_EXECUTABLE_PATH: '/usr/bin/chromium',
    });

    expect(env.E2E_EXECUTABLE_PATH).toBe('/usr/bin/chromium');
  });

  it('preserves caller-provided non-production base url override', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_BASE_URL: 'https://preview-alt.example.com/',
      E2E_PROFILE_DIR: '/tmp/custom-preview-profile',
    });

    expect(env.E2E_BASE_URL).toBe('https://preview-alt.example.com');
    expect(env.E2E_PROFILE_DIR).toBe('/tmp/custom-preview-profile');
  });

  it('checks host resolution before launching the child script', async () => {
    lookupMock.mockResolvedValue({ address: '127.0.0.1', family: 4 });

    await expect(
      runner.assertBaseUrlResolvable('https://preview-alt.example.com'),
    ).resolves.toBeNull();

    expect(lookupMock).toHaveBeenCalledWith('preview-alt.example.com');
  });

  it('passes preview admin session preflight when session-status confirms admin auth', async () => {
    const close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const goto = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const evaluate = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      status: 200,
      authenticated: true,
      body: { data: { authenticated: true, user: { role: 'admin' } } },
    });
    const launchBrowser = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      pages: () => [{ goto, evaluate }],
      close,
    });

    await expect(
      runner.assertPreviewAdminSession({
        E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
        E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
      }, launchBrowser as never),
    ).resolves.toMatchObject({ authenticated: true });

    expect(launchBrowser).toHaveBeenCalledWith({
      E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
      E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
    });
    expect(goto).toHaveBeenCalledWith(
      'https://preview.smkc.bluemoon.works/tournaments',
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    expect(close).toHaveBeenCalled();
  });

  it('fails preview admin session preflight before fixture setup when the profile is unauthenticated', async () => {
    const close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const goto = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const evaluate = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      status: 200,
      authenticated: false,
      body: { success: false, error: 'No active session', requiresAuth: true },
    });
    const launchBrowser = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      pages: () => [{ goto, evaluate }],
      close,
    });

    // Consolidate into a single call: catch the error once and assert all message parts (#2365).
    const err = await runner.assertPreviewAdminSession({
      E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
      E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
    }, launchBrowser as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Preview E2E admin session preflight failed/);
    expect((err as Error).message).toMatch(/No active session/);
    expect((err as Error).message).toMatch(/npm run e2e:preview:login/);
    expect(close).toHaveBeenCalled();
  });

  it('bootstraps a missing managed Playwright browser once before retrying admin session preflight', async () => {
    const close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const goto = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const evaluate = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      status: 200,
      authenticated: true,
      body: { data: { authenticated: true, user: { role: 'admin' } } },
    });
    const launchBrowser = jest.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("browserType.launchPersistentContext: Executable doesn't exist at /tmp/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell"))
      .mockResolvedValueOnce({
        pages: () => [{ goto, evaluate }],
        close,
      });
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    await expect(
      runner.assertPreviewAdminSession({
        E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
        E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
        PLAYWRIGHT_BROWSERS_PATH: '/tmp/playwright-e2e-home/ms-playwright',
      }, launchBrowser as never),
    ).resolves.toMatchObject({ authenticated: true });

    expect(spawnSyncMock).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('e2e/install-browser.js'), 'chromium'],
      expect.objectContaining({
        cwd: expect.stringContaining('smkc-score-app'),
        env: expect.objectContaining({
          PLAYWRIGHT_BROWSERS_PATH: '/tmp/playwright-e2e-home/ms-playwright',
        }),
        stdio: 'inherit',
      }),
    );
    expect(launchBrowser).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalled();
  });

  it('restores process.env entries when launchPersistentChromiumContext throws (TC-2446)', async () => {
    // launchPreviewAdminSessionBrowser writes env into process.env then restores via finally.
    // jest.doMock registers in the GLOBAL mock registry (not an isolated one), so it must be
    // cleaned up with jest.unmock after the test. jest.isolateModules ensures a fresh module
    // instance picks up the factory, but the factory itself lives in the global registry.
    const throwingLaunch = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('browser not available'));
    let isolatedRunner: PreviewRunner | undefined;
    jest.isolateModules(() => {
      jest.doMock('../../e2e/lib/common', () => ({
        launchPersistentChromiumContext: throwingLaunch,
        getChromiumLaunchConfig: jest.fn(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      isolatedRunner = require('../../e2e/run-preview') as PreviewRunner;
    });
    if (!isolatedRunner) throw new Error('isolation failed — run-preview module not loaded');

    const sentinelKey = 'E2E_RUN_PREVIEW_TEST_SENTINEL_2446';
    process.env[sentinelKey] = 'original-value';

    await expect(
      isolatedRunner.assertPreviewAdminSession({
        E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
        E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
        [sentinelKey]: 'modified-value',
      }),
    ).rejects.toThrow('browser not available');

    // finally block must have restored the sentinel to its original value
    expect(process.env[sentinelKey]).toBe('original-value');
    delete process.env[sentinelKey];
    // jest.doMock registers globally — unmock to prevent factory leaking to subsequent tests
    jest.unmock('../../e2e/lib/common');
  });

  it('restores process.env entries written before the write loop aborts mid-way (TC-2448)', async () => {
    // Covers the core correctness of the #2446 fix: moving the write loop inside try ensures
    // the finally block runs even when the loop itself throws mid-way (i.e. when a process.env
    // write is interrupted). The sentinel key is inserted before the throwing key in the env
    // object so its modified value is already in process.env when the throw occurs.
    // beforeEach replaces process.env with a plain object, so we use Object.defineProperty to
    // install a throwing setter on process.env['THROW_ON_WRITE'] — plain object assignment
    // does not coerce values, making the toString() trick ineffective here.
    const launchMock = jest.fn<() => Promise<never>>();
    let isolatedRunner: PreviewRunner | undefined;
    jest.isolateModules(() => {
      jest.doMock('../../e2e/lib/common', () => ({
        launchPersistentChromiumContext: launchMock,
        getChromiumLaunchConfig: jest.fn(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      isolatedRunner = require('../../e2e/run-preview') as PreviewRunner;
    });
    if (!isolatedRunner) throw new Error('isolation failed — run-preview module not loaded');

    const sentinelKey = 'E2E_RUN_PREVIEW_TEST_SENTINEL_2448';
    process.env[sentinelKey] = 'original-value';

    // Install a setter that throws when the write loop tries to assign THROW_ON_WRITE on
    // process.env. The sentinel key appears before THROW_ON_WRITE in the env object, so its
    // modified value ('modified-value') has already been written when the throw occurs.
    Object.defineProperty(process.env, 'THROW_ON_WRITE', {
      set() { throw new Error('env assignment failed'); },
      get() { return undefined; },
      configurable: true,
      enumerable: false,
    });

    await expect(
      isolatedRunner.assertPreviewAdminSession({
        E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
        E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
        [sentinelKey]: 'modified-value',
        THROW_ON_WRITE: 'any-value',
      }),
    ).rejects.toThrow('env assignment failed');

    // finally block must have restored the sentinel to its original value
    expect(process.env[sentinelKey]).toBe('original-value');
    delete process.env[sentinelKey];
    // launchPersistentChromiumContext is never reached when the loop aborts early
    expect(launchMock).not.toHaveBeenCalled();
    // jest.doMock registers globally — unmock to prevent factory leaking to subsequent tests
    jest.unmock('../../e2e/lib/common');
  });

  it('surfaces install-browser failure when managed cache bootstrap cannot recover', async () => {
    const launchBrowser = jest.fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error("browserType.launchPersistentContext: Executable doesn't exist at /tmp/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell"));
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'download failed' });

    await expect(
      runner.assertPreviewAdminSession({
        E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
        E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
      }, launchBrowser as never),
    ).rejects.toThrow(/failed to bootstrap Playwright browser cache/);

    expect(launchBrowser).toHaveBeenCalledTimes(1);
  });

  it('falls back to public DNS when local resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND preview.smkc.bluemoon.works'));
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '104.21.41.48\n172.67.159.248\n', stderr: '' });

    await expect(
      runner.assertBaseUrlResolvable('https://preview.smkc.bluemoon.works'),
    ).resolves.toBe('104.21.41.48');
  });

  it('falls back to public IPv6 DNS when local resolution and IPv4 public DNS fail', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND ipv6-preview.example.com'));
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '2606:4700:3037::6815:2930\n', stderr: '' });

    await expect(
      runner.assertBaseUrlResolvable('https://ipv6-preview.example.com'),
    ).resolves.toBe('2606:4700:3037::6815:2930');

    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      'dig',
      ['+short', 'A', 'ipv6-preview.example.com', '@1.1.1.1'],
      { encoding: 'utf8' },
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      2,
      'dig',
      ['+short', 'AAAA', 'ipv6-preview.example.com', '@1.1.1.1'],
      { encoding: 'utf8' },
    );
  });

  it('ignores invalid public IPv4 DNS lines before using a valid A record', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND preview.smkc.bluemoon.works'));
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: '999.999.999.999\n104.21.41.48\n',
      stderr: '',
    });

    await expect(
      runner.assertBaseUrlResolvable('https://preview.smkc.bluemoon.works'),
    ).resolves.toBe('104.21.41.48');
  });

  it('ignores invalid public IPv6 DNS lines before using a valid AAAA record', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND ipv6-preview.example.com'));
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'feed\n2606:4700:3037::6815:2930\n',
        stderr: '',
      });

    await expect(
      runner.assertBaseUrlResolvable('https://ipv6-preview.example.com'),
    ).resolves.toBe('2606:4700:3037::6815:2930');
  });

  it('throws a helpful error when the preview host does not resolve', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND preview.smkc.bluemoon.works'));

    await expect(
      runner.assertBaseUrlResolvable('https://preview.smkc.bluemoon.works'),
    ).rejects.toThrow(/could not be resolved/);
    await expect(
      runner.assertBaseUrlResolvable('https://preview.smkc.bluemoon.works'),
    ).rejects.toThrow(/E2E_BASE_URL=https:\/\/<reachable-host>/);
  });
});
