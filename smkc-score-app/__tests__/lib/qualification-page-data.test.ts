import {
  clearSetupPlayersForSetupCache,
  fetchAllPlayersForSetup,
  resolveAllPlayers,
} from '@/lib/qualification-page-data';

type SetupPlayer = {
  id: string;
  name: string;
  nickname: string;
};

const assignedPlayer: SetupPlayer = {
  id: 'assigned-1',
  name: 'Assigned Player',
  nickname: 'Assigned',
};

describe('qualification page player seed compatibility', () => {
  it('does not load a global player list from qualification polling', async () => {
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
  });

  it('uses the bounded player seed carried by the qualification payload', () => {
    expect(resolveAllPlayers<SetupPlayer>(null, [assignedPlayer])).toEqual([assignedPlayer]);
  });

  it('preserves the legacy explicit fetched-list precedence contract', () => {
    const fetchedPlayer = { ...assignedPlayer, id: 'fetched-1' };
    expect(resolveAllPlayers<SetupPlayer>([fetchedPlayer], [assignedPlayer])).toEqual([fetchedPlayer]);
  });

  it('falls back to an empty seed when the payload has no players', () => {
    expect(resolveAllPlayers<SetupPlayer>(null, undefined)).toEqual([]);
  });

  it('keeps the removed cache invalidation API as a harmless compatibility no-op', () => {
    expect(() => clearSetupPlayersForSetupCache()).not.toThrow();
  });
});
