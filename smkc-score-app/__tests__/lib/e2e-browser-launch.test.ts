import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
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
    jest.restoreAllMocks();
    jest.dontMock('playwright');
  });

  function withPlatform<T>(platformValue: NodeJS.Platform, fn: () => T): T {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: platformValue });
    try {
      return fn();
    } finally {
      if (platform) {
        Object.defineProperty(process, 'platform', platform);
      }
    }
  }

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

  it('adds the macOS single-process launch guard unless explicitly disabled', () => {
    withPlatform('darwin', () => {
      const args = common.getChromiumArgs();

      expect(common.shouldUseMacSingleProcessLaunch()).toBe(true);
      expect(args).toContain('--single-process');
      expect(args).toContain('--no-zygote');

      process.env.E2E_MAC_SINGLE_PROCESS = '0';
      expect(common.shouldUseMacSingleProcessLaunch()).toBe(false);
      expect(common.getChromiumArgs()).not.toContain('--single-process');
    });
  });

  it('keeps Chromium argument generation free of filesystem side effects', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    common = loadCommon();
    const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

    const args = common.getChromiumArgs();

    expect(args).toContain('--crash-dumps-dir=/tmp/jsmkc-browser-home/Crashpad');
    expect(mkdirSyncSpy).not.toHaveBeenCalled();
  });

  it('prepares Crashpad under the browser home when creating the launch config', () => {
    process.env.E2E_BROWSER_HOME = '/tmp/jsmkc-browser-home';
    common = loadCommon();
    const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

    common.getChromiumLaunchConfig();

    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-browser-home', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-browser-home/.config', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-browser-home/.cache', { recursive: true });
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/tmp/jsmkc-browser-home/Crashpad', { recursive: true });
  });

  it('keeps the install-browser bootstrap hint visible when Playwright provides a stack', () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/jsmkc-browser-home/ms-playwright';
    common = loadCommon();
    const error = new Error("Executable doesn't exist at /tmp/jsmkc-browser-home/ms-playwright/chromium/chrome");
    error.stack = 'browserType.launchPersistentContext: Executable does not exist stack';

    const formatted = common.formatE2EErrorForLog(common.addChromiumLaunchHelp(error));

    expect(formatted).toContain('Recommended bootstrap:');
    expect(formatted).toContain('PLAYWRIGHT_BROWSERS_PATH=/tmp/jsmkc-browser-home/ms-playwright npm run e2e:install-browser');
    expect(formatted).toContain('E2E_EXECUTABLE_PATH=/absolute/path/to/chromium-compatible-browser');
  });

  describe('detectSingletonLockOwner', () => {
    it('returns null when SingletonLock does not exist', () => {
      jest.spyOn(fs, 'readlinkSync').mockImplementation(() => {
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
      });

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toBeNull();
    });

    it('returns null when SingletonLock is not a symlink', () => {
      jest.spyOn(fs, 'readlinkSync').mockImplementation(() => {
        const err = Object.assign(new Error('EINVAL'), { code: 'EINVAL' });
        throw err;
      });

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toBeNull();
    });

    it('returns alive owner when lock target process is running', () => {
      jest.spyOn(fs, 'readlinkSync').mockReturnValue('AzMacMiniM4.local-28661');
      (jest.spyOn(process, 'kill') as jest.Mock).mockReturnValue(true);

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toEqual({
        pid: 28661,
        target: 'AzMacMiniM4.local-28661',
        alive: true,
      });
    });

    it('returns dead owner when lock target process no longer exists', () => {
      jest.spyOn(fs, 'readlinkSync').mockReturnValue('AzMacMiniM4.local-99999');
      (jest.spyOn(process, 'kill') as jest.Mock).mockImplementation(() => {
        throw Object.assign(new Error('kill ESRCH 99999'), { code: 'ESRCH' });
      });

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toEqual({
        pid: 99999,
        target: 'AzMacMiniM4.local-99999',
        alive: false,
      });
    });

    it('treats EPERM as alive because the process exists but cannot be signaled', () => {
      jest.spyOn(fs, 'readlinkSync').mockReturnValue('host-55555');
      (jest.spyOn(process, 'kill') as jest.Mock).mockImplementation(() => {
        throw Object.assign(new Error('kill EPERM 55555'), { code: 'EPERM' });
      });

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toEqual({
        pid: 55555,
        target: 'host-55555',
        alive: true,
      });
    });

    it('returns null when lock target contains no dash', () => {
      jest.spyOn(fs, 'readlinkSync').mockReturnValue('nodashhere');

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toBeNull();
    });

    it('returns null when lock target has no parseable PID', () => {
      jest.spyOn(fs, 'readlinkSync').mockReturnValue('AzMacMiniM4.local-notanumber');

      expect(common.detectSingletonLockOwner('/tmp/test-profile')).toBeNull();
    });

    it('keeps TC-2360 documented as SingletonLock live-owner fast-fail coverage', () => {
      const commonLib = fs.readFileSync(path.join(__dirname, '../../e2e/lib/common.js'), 'utf8');
      expect(commonLib).toContain("err.code === 'EPERM'");
      expect(commonLib).toContain('lockOwner?.alive');
    });
  });

  describe('launchPersistentChromiumContext SingletonLock guard', () => {
    it('throws with live owner PID before launching Chromium', async () => {
      const mockLaunchPersistentContext = jest.fn();
      jest.doMock('playwright', () => ({
        chromium: {
          launch: jest.fn(),
          launchPersistentContext: mockLaunchPersistentContext,
        },
      }));
      common = loadCommon();

      jest.spyOn(fs, 'readlinkSync').mockReturnValue('AzMacMiniM4.local-28661');
      (jest.spyOn(process, 'kill') as jest.Mock).mockReturnValue(true);

      await expect(common.launchPersistentChromiumContext('/tmp/test-profile')).rejects.toThrow(
        /PID 28661/,
      );
      expect(mockLaunchPersistentContext).not.toHaveBeenCalled();
    });
  });
});
