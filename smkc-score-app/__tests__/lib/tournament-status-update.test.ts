import { canUpdateTournamentStatus, parseTournamentStatusUpdateResponse } from '@/lib/tournament-status-update';

describe('tournament status updates', () => {
  it('keeps lifecycle updates available for any loaded tournament summary', () => {
    expect(canUpdateTournamentStatus(null)).toBe(false);
    expect(canUpdateTournamentStatus({ archived: true })).toBe(true);
    expect(canUpdateTournamentStatus({ archived: false })).toBe(true);
    expect(canUpdateTournamentStatus({})).toBe(true);
  });

  it('unwraps the standard success response', async () => {
    const tournament = { id: 't1', status: 'active', publicModes: [] };
    const response = new Response(JSON.stringify({ success: true, data: tournament }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseTournamentStatusUpdateResponse(response)).resolves.toEqual(tournament);
  });

  it('accepts a bare success payload for compatibility', async () => {
    const tournament = { id: 't1', status: 'active' };
    const response = new Response(JSON.stringify(tournament), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseTournamentStatusUpdateResponse(response)).resolves.toEqual(tournament);
  });

  it('surfaces the API error detail on a rejected transition', async () => {
    const response = new Response(
      JSON.stringify({ success: false, error: 'Cannot change tournament status from completed to active' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    await expect(parseTournamentStatusUpdateResponse(response)).rejects.toThrow(
      'Cannot change tournament status from completed to active',
    );
  });

  it('falls back to the HTTP status when the error response is not JSON', async () => {
    const response = new Response('upstream failure', { status: 502 });

    await expect(parseTournamentStatusUpdateResponse(response)).rejects.toThrow('HTTP 502');
  });

  it('rejects malformed success responses instead of leaving stale UI state', async () => {
    const response = new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseTournamentStatusUpdateResponse(response)).rejects.toThrow(
      'Invalid tournament status update response',
    );
  });
});
