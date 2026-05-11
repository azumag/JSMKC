describe('archive E2E fixtures', () => {
  async function loadArchiveSuite(commonOverrides: Record<string, unknown> = {}) {
    jest.resetModules();

    const common = {
      makeResults: jest.fn(() => []),
      makeLog: jest.fn(() => jest.fn()),
      apiCreatePlayer: jest.fn(async (_page, name, nickname) => ({ id: `${nickname}-id`, nickname, name })),
      apiCreateTournament: jest.fn(async () => 'tournament-1'),
      apiJson: jest.fn(async (_page, path, options = {}) => ({
        status: options && typeof options === 'object' && 'method' in options ? 200 : 200,
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
});
