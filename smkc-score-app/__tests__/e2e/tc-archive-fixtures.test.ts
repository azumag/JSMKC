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
    expect(common.apiPutAllBmQualScores).toHaveBeenCalledWith(expect.anything(), 'tournament-1', {
      score1: 3,
      score2: 1,
      randomize: false,
    });
    expect(common.apiPutAllBmQualScores.mock.invocationCallOrder[0]).toBeLessThan(
      common.apiUpdateTournament.mock.invocationCallOrder[0],
    );
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

    await expect(
      suite.cleanupArchiveFixture(
        {},
        {
          tournamentId: 'tournament-1',
          players: [{ id: 'player-1' }, { id: 'player-2' }],
        },
      ),
    ).resolves.toBeUndefined();

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

    expect(
      suite.requestKindForQualificationFetch(
        'https://preview.example.test/api/tournaments/tournament-1/bm',
        'tournament-1',
        'bm',
      ),
    ).toBe('mode');
    expect(
      suite.requestKindForQualificationFetch(
        'https://preview.example.test/api/players?limit=100',
        'tournament-1',
        'bm',
      ),
    ).toBe('players');
    expect(
      suite.requestKindForQualificationFetch('https://preview.example.test/api/players?limit=50', 'tournament-1', 'bm'),
    ).toBeNull();
  });

  it('uses the status field when summarizing archive failures', async () => {
    const { suite } = await loadArchiveSuite();

    expect(
      suite.countArchiveFailures([
        { tc: 'TC-ARC-01', status: 'PASS' },
        { tc: 'TC-ARC-02', status: 'FAIL' },
        { tc: 'TC-ARC-03', s: 'FAIL' },
      ]),
    ).toBe(1);
  });

  it('runs TA qualification hydration on an isolated fresh page and closes it', async () => {
    const { suite } = await loadArchiveSuite({ BASE: 'https://preview.example.test' });
    const targetPage = {
      bringToFront: jest.fn(async () => undefined),
      route: jest.fn(async () => undefined),
      unroute: jest.fn(async () => undefined),
      goto: jest.fn(async () => undefined),
      waitForFunction: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const newPage = jest.fn(async () => targetPage);
    const rootPage = {
      context: jest.fn(() => ({ newPage })),
      goto: jest.fn(async () => undefined),
    };

    await expect(suite.assertQualificationFetchesStartInParallel(rootPage, 'tournament-1', 'ta')).resolves.toBe(0);

    expect(rootPage.context).toHaveBeenCalled();
    expect(newPage).toHaveBeenCalled();
    expect(rootPage.goto).not.toHaveBeenCalled();
    expect(targetPage.bringToFront).toHaveBeenCalled();
    expect(targetPage.goto).toHaveBeenCalledWith('https://preview.example.test/tournaments/tournament-1/ta', {
      waitUntil: 'domcontentloaded',
    });
    expect(targetPage.waitForFunction).toHaveBeenCalledWith(expect.any(Function), null, {
      timeout: suite.QUALIFICATION_FETCH_TIMEOUT_MS,
    });
    expect(targetPage.close).toHaveBeenCalled();
  });

  it('hydrates BM from the mode payload without requesting the global player registry', async () => {
    const { suite } = await loadArchiveSuite({ BASE: 'https://preview.example.test' });
    const fulfilled: string[] = [];
    let routeHandler: ((route: unknown) => Promise<void>) | null = null;

    const requestFor = (url: string) => ({ url: () => url });
    const routeFor = (kind: string, url: string) => ({
      request: () => requestFor(url),
      fulfill: jest.fn(async () => {
        fulfilled.push(kind);
      }),
      continue: jest.fn(async () => undefined),
    });

    const targetPage = {
      route: jest.fn(async (_pattern, handler) => {
        routeHandler = handler;
      }),
      unroute: jest.fn(async () => undefined),
      waitForFunction: jest.fn(async () => undefined),
      bringToFront: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      goto: jest.fn(async () => {
        if (!routeHandler) throw new Error('route handler missing');
        const modeUrl = 'https://preview.example.test/api/tournaments/tournament-1/bm';
        await routeHandler(routeFor('mode', modeUrl));
      }),
    };
    const page = {
      context: jest.fn(() => ({
        newPage: jest.fn(async () => targetPage),
      })),
    };

    await expect(suite.assertQualificationFetchesStartInParallel(page, 'tournament-1', 'bm')).resolves.toBe(1);
    expect(fulfilled).toEqual(['mode']);
    expect(targetPage.goto).toHaveBeenCalledWith('https://preview.example.test/tournaments/tournament-1/bm', {
      waitUntil: 'domcontentloaded',
    });
    expect(targetPage.waitForFunction).toHaveBeenCalled();
    expect(targetPage.unroute).toHaveBeenCalledWith('**/api/**', expect.any(Function));
    expect(targetPage.close).toHaveBeenCalled();
  });

  it('fails closed when the qualification page requests the global player registry', async () => {
    const { suite } = await loadArchiveSuite({ BASE: 'https://preview.example.test' });
    const fulfilled: string[] = [];
    let routeHandler: ((route: unknown) => Promise<void>) | null = null;

    const requestFor = (url: string) => ({ url: () => url });
    const routeFor = (kind: string, url: string) => ({
      request: () => requestFor(url),
      fulfill: jest.fn(async () => {
        fulfilled.push(kind);
      }),
      continue: jest.fn(async () => undefined),
    });

    const targetPage = {
      route: jest.fn(async (_pattern, handler) => {
        routeHandler = handler;
      }),
      unroute: jest.fn(async () => undefined),
      waitForFunction: jest.fn(async () => undefined),
      bringToFront: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      goto: jest.fn(async () => {
        if (!routeHandler) throw new Error('route handler missing');
        await routeHandler(routeFor('mode', 'https://preview.example.test/api/tournaments/tournament-1/bm'));
        await routeHandler(routeFor('players', 'https://preview.example.test/api/players?limit=100'));
      }),
    };
    const page = {
      context: jest.fn(() => ({
        newPage: jest.fn(async () => targetPage),
      })),
    };

    await expect(suite.assertQualificationFetchesStartInParallel(page, 'tournament-1', 'bm')).rejects.toThrow(
      'requested global player registry',
    );
    expect(fulfilled).toEqual(['mode', 'players']);
    expect(targetPage.waitForFunction).toHaveBeenCalled();
    expect(targetPage.unroute).toHaveBeenCalledWith('**/api/**', expect.any(Function));
    expect(targetPage.close).toHaveBeenCalled();
  });
});
