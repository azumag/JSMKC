import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
    spawnSyncMock.mockReset();
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

  it('exposes a focused preview debug-fill coverage script', () => {
    expect(packageJson.scripts['e2e:debug-fill']).toBe('node e2e/tc-debug-fill.js');
    expect(packageJson.scripts['e2e:preview:debug-fill']).toBe('node e2e/run-preview.js tc-debug-fill.js');
  });

  it('exposes a focused preview archive coverage script', () => {
    expect(packageJson.scripts['e2e:archive']).toBe('node e2e/tc-archive.js');
    expect(packageJson.scripts['e2e:preview:archive']).toBe('node e2e/run-preview.js tc-archive.js');
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

  it('preserves caller-provided browser channel override', () => {
    const env = runner.buildPreviewRuntimeEnv({
      E2E_BROWSER_CHANNEL: 'chrome',
    });

    expect(env.E2E_BROWSER_CHANNEL).toBe('chrome');
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
