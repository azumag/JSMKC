import { describe, expect, it, jest } from '@jest/globals';

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

describe('assertResetApiBlocked', () => {
  it('posts reset=true to the selected finals route and accepts the locked response', async () => {
    const common = loadCommon();
    const page = {
      evaluate: jest.fn(async (_fn, args) => {
        expect(args).toEqual(['tournament-1', 'mr']);
        return { s: 409, b: { code: 'QUALIFICATION_LOCKED' } };
      }),
    };

    await expect(common.assertResetApiBlocked(page, 'tournament-1', 'mr')).resolves.toEqual({
      s: 409,
      b: { code: 'QUALIFICATION_LOCKED' },
    });
  });

  it('throws a diagnostic error when reset is not blocked', async () => {
    const common = loadCommon();
    const page = {
      evaluate: jest.fn(async () => ({ s: 200, b: { message: 'Bracket reset' } })),
    };

    await expect(common.assertResetApiBlocked(page, 'tournament-1', 'gp')).rejects.toThrow(
      'GP reset API allowed locked qualification (200)',
    );
  });
});
