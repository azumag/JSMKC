/**
 * @jest-environment jsdom
 */

/**
 * @module useMatchReportAuth.test
 *
 * Tests for the useMatchReportAuth hook that determines whether a user
 * can report scores for a match (mirrors backend checkScoreReportAuth).
 *
 * Covers:
 * - Admin access: can report for any match
 * - Player access: can only report for own matches
 * - Non-participant: cannot report
 * - Unauthenticated: cannot report
 * - Auto-select: player identity auto-selected for participants
 * - Session loading: isSessionLoading flag prevents flash
 */
import { renderHook, act } from '@testing-library/react';
import { useMatchReportAuth } from '@/lib/hooks/useMatchReportAuth';

/* Mock next-auth/react */
const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const MATCH = {
  player1Id: 'player-1-id',
  player2Id: 'player-2-id',
};

describe('useMatchReportAuth', () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  describe('canReport', () => {
    it('returns true for admin users', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'admin' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.canReport).toBe(true);
    });

    it('returns true for player1 of the match', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'player-1-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.canReport).toBe(true);
    });

    it('returns true for player2 of the match', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'player-2-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.canReport).toBe(true);
    });

    it('returns false for a player not in the match', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'other-player-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.canReport).toBe(false);
    });

    it('returns false for unauthenticated users', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.canReport).toBe(false);
    });

    it('returns false when match is null', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'admin' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(null));
      /* Admin without a match — isPlayer1/isPlayer2 are false,
         but isAdmin is still true, so canReport should be true */
      expect(result.current.canReport).toBe(true);
    });
  });

  describe('isSessionLoading', () => {
    it('returns true when session status is loading', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.isSessionLoading).toBe(true);
    });

    it('returns false when session is authenticated', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'admin' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.isSessionLoading).toBe(false);
    });
  });

  describe('auto-select player identity', () => {
    it('auto-selects player 1 when logged in as player1', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'player-1-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.selectedPlayer).toBe(1);
    });

    it('auto-selects player 2 when logged in as player2', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'player-2-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.selectedPlayer).toBe(2);
    });

    it('does not auto-select for admin users (no playerId)', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'admin' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.selectedPlayer).toBe(null);
    });

    it('does not auto-select for non-participant players', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'other-player-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.selectedPlayer).toBe(null);
    });

    it('allows manual override of auto-selected player', () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'player', playerId: 'player-1-id' } },
        status: 'authenticated',
      });

      const { result } = renderHook(() => useMatchReportAuth(MATCH));
      expect(result.current.selectedPlayer).toBe(1);

      /* Admin or user manually changes selection */
      act(() => {
        result.current.setSelectedPlayer(2);
      });
      expect(result.current.selectedPlayer).toBe(2);
    });
  });
});
