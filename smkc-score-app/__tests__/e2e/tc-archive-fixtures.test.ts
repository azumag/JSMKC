describe('archive E2E fixtures', () => {
  async function loadArchiveSuite(commonOverrides: Record<string, unknown> = {}) {
    jest.resetModules();

    const common = {
      makeResults: jest.fn(() => []),
      makeLog: jest.fn(() => jest.fn()),
      apiCreatePlayer: jest.fn(async (_page, name, nickname) => ({ id: `${nickname}-id`, nickname, name })),
      apiCreateTournament: jest.fn(async () => 'tournament-1'),
      apiJson: jest.fn(async (_page, path) => ({
        status: 200,
        body: { data: { archived: true, path } },
      })),
      apiDeletePlayer: jest.fn(async () => undefined),
      apiDeleteTournament: jest.fn(async () => undefined),
      apiSetupBmGroup: jest.fn(async () => ({ s: 201, b: {} })),
      apiPutAllBmQualScores: jest.fn(async () => undefined),
      apiUpdateTournament: jest.fn(async () => ({ s: 200, b: {} })),
      launchPersistentChromiumContext: jest.fn(),
      resolveE2EProfileDir: jest.fn(() => '/tmp/e2e-profile'),
      BASE: 'http://localhost:3000',
      ...commonOverrides,
    };

    jest.doMock('../../e2e/lib/common', () => common);
    jest.doMock('../../e2e/lib/runner', () => ({
      closeBrowser: jest.fn(),
      envMs: jest.fn((_name, fallback) => fallback),
      exitAfterCleanup: jest.fn(),
    }));

    const suite = await import('../../e2e/tc-archive');
    return { suite, common };
  }

  it('scores BM qualification matches before archiving the completed public fixture', async () => {
    const { suite, common } = await loadArchiveSuite();

    await suite.createCompletedPublicBmArchive({}, 'TCARC06', 'TC-ARC-06');

    expect(common.apiSetupBmGroup).toHaveBeenCalledWith(expect.anything(), 'tournament-1', expect.any(Array));
    expect(common.apiPutAllBmQualScores).toHaveBeenCalledWith(
      expect.anything(),
      'tournament-1',
      { score1: 3, score2: 1, randomize: false },
    );
    expect(common.apiPutAllBmQualScores.mock.invocationCallOrder[0])
      .toBeLessThan(common.apiUpdateTournament.mock.invocationCallOrder[0]);
    expect(common.apiUpdateTournament).toHaveBeenCalledWith(
      expect.anything(),
      'tournament-1',
      expect.objectContaining({ status: 'completed', publicModes: ['bm', 'overall'] }),
    );
  });

  it('attempts every cleanup deletion and warns instead of throwing on failures', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { suite, common } = await loadArchiveSuite({
      apiDeleteTournament: jest.fn(async () => {
        throw new Error('tournament delete failed');
      }),
      apiDeletePlayer: jest.fn(async (_page, id) => {
        if (id === 'player-2') throw new Error('player delete failed');
      }),
    });

    await expect(suite.cleanupArchiveFixture({}, {
      tournamentId: 'tournament-1',
      players: [{ id: 'player-1' }, { id: 'player-2' }],
    })).resolves.toBeUndefined();

    expect(common.apiDeleteTournament).toHaveBeenCalledWith(expect.anything(), 'tournament-1');
    expect(common.apiDeletePlayer).toHaveBeenCalledTimes(2);
    expect(common.apiDeletePlayer).toHaveBeenNthCalledWith(1, expect.anything(), 'player-1');
    expect(common.apiDeletePlayer).toHaveBeenNthCalledWith(2, expect.anything(), 'player-2');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cleanup failed for tournament tournament-1'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cleanup failed for player player-2'));
    warn.mockRestore();
  });

  it('classifies qualification page runtime fetch requests', async () => {
    const { suite } = await loadArchiveSuite();

    expect(suite.requestKindForQualificationFetch(
      'https://preview.example.test/api/tournaments/tournament-1/bm',
      'tournament-1',
      'bm',
    )).toBe('mode');
    expect(suite.requestKindForQualificationFetch(
      'https://preview.example.test/api/players?limit=100',
      'tournament-1',
      'bm',
    )).toBe('players');
    expect(suite.requestKindForQualificationFetch(
      'https://preview.example.test/api/players?limit=50',
      'tournament-1',
      'bm',
    )).toBeNull();
  });

  it('waits for both qualification requests before fulfilling either response', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
    const { suite } = await loadArchiveSuite({ BASE: 'https://preview.example.test' });
    const fulfillOrder: string[] = [];
    const continueOrder: string[] = [];
    const pendingRequests: Array<{ predicate: (request: { url: () => string }) => boolean; resolve: (request: unknown) => void }> = [];
    let routeHandler: ((route: unknown) => Promise<void>) | null = null;

    const requestFor = (url: string) => ({ url: () => url });
    const routeFor = (kind: string, url: string) => ({
      request: () => requestFor(url),
      fulfill: jest.fn(async () => {
        fulfillOrder.push(kind);
      }),
      continue: jest.fn(async () => {
        continueOrder.push(kind);
      }),
    });
    const resolveWaiters = (url: string) => {
      const request = requestFor(url);
      for (const waiter of pendingRequests) {
        if (waiter.predicate(request)) waiter.resolve(request);
      }
    };

    const page = {
      route: jest.fn(async (_pattern, handler) => {
        routeHandler = handler;
      }),
      unroute: jest.fn(async () => undefined),
      waitForRequest: jest.fn((predicate) =>
        new Promise((resolve) => pendingRequests.push({ predicate, resolve }))),
      goto: jest.fn(async () => {
        if (!routeHandler) throw new Error('route handler missing');
        const modeUrl = 'https://preview.example.test/api/tournaments/tournament-1/bm';
        const playersUrl = 'https://preview.example.test/api/players?limit=100';
        resolveWaiters(modeUrl);
        const modePromise = routeHandler(routeFor('mode', modeUrl));
        await routeHandler(routeFor('mode-duplicate', modeUrl));
        await Promise.resolve();
        expect(fulfillOrder).toEqual([]);
        resolveWaiters(playersUrl);
        const playersPromise = routeHandler(routeFor('players', playersUrl));
        await Promise.all([modePromise, playersPromise]);
      }),
    };

    await expect(suite.assertQualificationFetchesStartInParallel(page, 'tournament-1', 'bm'))
      .resolves.toBe(0);
    expect(fulfillOrder.sort()).toEqual(['mode', 'players']);
    expect(page.goto).toHaveBeenCalledWith(
      'https://preview.example.test/tournaments/tournament-1/bm',
      { waitUntil: 'domcontentloaded' },
    );
    expect(continueOrder).toEqual(['mode-duplicate']);
    jest.useRealTimers();
  });

  it('does not double-fulfill when timeout wins before the paired request arrives', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
    const { suite } = await loadArchiveSuite({ BASE: 'https://preview.example.test' });
    const timeoutMs = suite.QUALIFICATION_FETCH_TIMEOUT_MS;
    const fulfillStatuses: number[] = [];
    const continueOrder: string[] = [];
    const pendingRequests: Array<{ predicate: (request: { url: () => string }) => boolean; resolve: (request: unknown) => void }> = [];
    let routeHandler: ((route: unknown) => Promise<void>) | null = null;

    const requestFor = (url: string) => ({ url: () => url });
    const routeFor = (kind: string, url: string) => ({
      request: () => requestFor(url),
      fulfill: jest.fn(async (response) => {
        fulfillStatuses.push(response.status);
      }),
      continue: jest.fn(async () => {
        continueOrder.push(kind);
      }),
    });
    const resolveWaiters = (url: string) => {
      const request = requestFor(url);
      for (const waiter of pendingRequests) {
        if (waiter.predicate(request)) waiter.resolve(request);
      }
    };

    const page = {
      route: jest.fn(async (_pattern, handler) => {
        routeHandler = handler;
      }),
      unroute: jest.fn(async () => undefined),
      waitForRequest: jest.fn((predicate) =>
        new Promise((resolve) => pendingRequests.push({ predicate, resolve }))),
      goto: jest.fn(async () => {
        if (!routeHandler) throw new Error('route handler missing');
        const modeUrl = 'https://preview.example.test/api/tournaments/tournament-1/bm';
        const playersUrl = 'https://preview.example.test/api/players?limit=100';
        resolveWaiters(modeUrl);
        const modePromise = routeHandler(routeFor('mode', modeUrl));
        await jest.advanceTimersByTimeAsync(timeoutMs);
        await modePromise;
        resolveWaiters(playersUrl);
        await routeHandler(routeFor('players-late', playersUrl));
      }),
    };

    await expect(suite.assertQualificationFetchesStartInParallel(page, 'tournament-1', 'bm'))
      .rejects.toThrow('bm: missing mode or players request');
    expect(fulfillStatuses).toEqual([504]);
    expect(continueOrder).toEqual(['players-late']);
    jest.useRealTimers();
  });
});
