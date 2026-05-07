import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import packageJson from '../../package.json';

const lookupMock = jest.fn();
const existsSyncMock = jest.fn();
const spawnSyncMock = jest.fn();

jest.mock('dns', () => ({
  promises: {
    lookup: (...args: unknown[]) => lookupMock(...args),
  },
}));

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

type PreviewRunner = typeof import('../../e2e/run-preview');

function loadRunner() {
  let loaded: PreviewRunner | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/run-preview') as PreviewRunner;
  });
  if (!loaded) throw new Error('Failed to load preview runner');
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
    lookupMock.mockReset();
    existsSyncMock.mockReset();
    spawnSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: '' });
    runner = loadRunner();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds preview runtime env with default preview target', () => {
    const env = runner.buildPreviewRuntimeEnv({});

    expect(env.E2E_BASE_URL).toBe('https://preview.smkc.bluemoon.works');
    expect(env.E2E_PROFILE_DIR).toBe('/tmp/playwright-smkc-preview-profile');
  });

  it('exposes npm run e2e:preview as the official all-suite preview alias', () => {
    expect(packageJson.scripts['e2e:preview']).toBe('node e2e/run-preview.js tc-all.js');
    expect(packageJson.scripts['e2e:preview:all']).toBe(packageJson.scripts['e2e:preview']);
  });

  it('defaults to the installed Chrome channel on macOS preview runs', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    existsSyncMock.mockReturnValue(true);

    const env = runner.buildPreviewRuntimeEnv({});

    expect(env.E2E_BROWSER_CHANNEL).toBe('chrome');

    if (platform) {
      Object.defineProperty(process, 'platform', platform);
    }
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

  it('falls back to public DNS when local resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND preview.smkc.bluemoon.works'));
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '104.21.41.48\n172.67.159.248\n', stderr: '' });

    await expect(
      runner.assertBaseUrlResolvable('https://preview.smkc.bluemoon.works'),
    ).resolves.toBe('104.21.41.48');
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
