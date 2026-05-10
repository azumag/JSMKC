import { describe, expect, it, jest } from '@jest/globals';

type LoginPreviewAdmin = typeof import('../../e2e/login-preview-admin');

jest.mock('../../e2e/lib/common', () => ({
  launchPersistentChromiumContext: jest.fn(),
  resolveE2EProfileDir: jest.fn(() => '/tmp/playwright-smkc-preview-profile'),
}));

jest.mock('../../e2e/run-preview', () => ({
  buildPreviewRuntimeEnv: jest.fn(() => ({
    E2E_BASE_URL: 'https://preview.smkc.bluemoon.works',
    E2E_PROFILE_DIR: '/tmp/playwright-smkc-preview-profile',
  })),
  assertBaseUrlResolvable: jest.fn(),
}));

function loadLoginPreviewAdmin() {
  let loaded: LoginPreviewAdmin | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/login-preview-admin') as LoginPreviewAdmin;
  });
  if (!loaded) throw new Error('Failed to load preview login helper');
  return loaded;
}

describe('preview admin login helper', () => {
  it('returns authenticated when the session-status endpoint confirms the admin session', async () => {
    const page = {
      evaluate: jest.fn(async (callback: () => Promise<unknown>) => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => ({
          status: 200,
          json: async () => ({ data: { authenticated: true } }),
        })) as typeof fetch;
        try {
          return await callback();
        } finally {
          global.fetch = originalFetch;
        }
      }),
    };

    const helper = loadLoginPreviewAdmin();
    await expect(helper.isAuthenticated(page)).resolves.toMatchObject({
      status: 200,
      authenticated: true,
      body: { data: { authenticated: true } },
    });
  });

  it('returns unauthenticated when the session-status endpoint has no session', async () => {
    const page = {
      evaluate: jest.fn(async (callback: () => Promise<unknown>) => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => ({
          status: 200,
          json: async () => ({ data: { authenticated: false } }),
        })) as typeof fetch;
        try {
          return await callback();
        } finally {
          global.fetch = originalFetch;
        }
      }),
    };

    const helper = loadLoginPreviewAdmin();
    await expect(helper.isAuthenticated(page)).resolves.toMatchObject({
      status: 200,
      authenticated: false,
      body: { data: { authenticated: false } },
    });
  });

  it('returns unauthenticated when the session-status request fails', async () => {
    const page = {
      evaluate: jest.fn(async (callback: () => Promise<unknown>) => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => {
          throw new Error('network down');
        }) as typeof fetch;
        try {
          return await callback();
        } finally {
          global.fetch = originalFetch;
        }
      }),
    };

    const helper = loadLoginPreviewAdmin();
    await expect(helper.isAuthenticated(page)).resolves.toMatchObject({
      status: 0,
      authenticated: false,
      body: null,
      error: 'network down',
    });
  });

  it('waits for the admin tab and Discord button instead of a fixed sleep', async () => {
    const adminTab = {
      waitFor: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const discordButton = {
      waitFor: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const page = {
      getByRole: jest.fn((role: string, options: { name: RegExp }) => {
        if (role === 'tab' && options.name.test('Admin')) return adminTab;
        if (role === 'button' && options.name.test('Discord')) return discordButton;
        throw new Error(`unexpected role lookup: ${role}`);
      }),
      waitForTimeout: jest.fn(),
    };

    const helper = loadLoginPreviewAdmin();
    await helper.waitForPreviewAdminLoginReady(page);

    expect(page.getByRole).toHaveBeenCalledWith('tab', { name: /管理者|Admin/ });
    expect(adminTab.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 15000 });
    expect(adminTab.click).toHaveBeenCalledTimes(1);
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: /Discord/ });
    expect(discordButton.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 15000 });
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});
