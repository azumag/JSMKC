/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { useMatchReportAuth } from '@/lib/hooks/useMatchReportAuth';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const MATCH_A = {
  player1Id: 'player-1-id',
  player2Id: 'player-2-id',
};

const MATCH_B = {
  player1Id: 'player-1-id',
  player2Id: 'player-3-id',
};

describe('useMatchReportAuth match identity', () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it('does not carry a manual selection into a different participant match', () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'player', playerId: 'player-1-id' } },
      status: 'authenticated',
    });

    const { result, rerender } = renderHook(({ match }) => useMatchReportAuth(match), {
      initialProps: { match: MATCH_A },
    });

    expect(result.current.selectedPlayer).toBe(1);
    act(() => {
      result.current.setSelectedPlayer(2);
    });
    expect(result.current.selectedPlayer).toBe(2);

    rerender({ match: MATCH_B });

    expect(result.current.selectedPlayer).toBe(1);
  });

  it('returns an admin to no selection when the match changes', () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      status: 'authenticated',
    });

    const { result, rerender } = renderHook(({ match }) => useMatchReportAuth(match), {
      initialProps: { match: MATCH_A },
    });

    act(() => {
      result.current.setSelectedPlayer(2);
    });
    expect(result.current.selectedPlayer).toBe(2);

    rerender({ match: MATCH_B });

    expect(result.current.selectedPlayer).toBeNull();
  });
});
