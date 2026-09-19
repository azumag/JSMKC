import {
  canUpdateTournamentStatus,
  isUserFacingTournamentStatusUpdateError,
  parseTournamentStatusUpdateResponse,
} from '@/lib/tournament-status-update';

function responseWithUrl(body: unknown, status: number, url: string): Response {
  const response = new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('tournament status updates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('restores an archived-only tournament when the ordinary reopen PUT returns 404', async () => {
    const restored = { id: 'archived-1', status: 'active', publicModes: [] };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        responseWithUrl(
          { success: true, data: restored },
          200,
          'https://example.test/api/tournaments/archived-1/restore',
        ),
      );
    const response = responseWithUrl(
      { success: false, error: 'Tournament not found' },
      404,
      'https://example.test/api/tournaments/archived-1',
    );

    await expect(parseTournamentStatusUpdateResponse(response)).resolves.toEqual(restored);
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/archived-1/restore', { method: 'POST' });
  });

  it('classifies a concrete restore API error as user-facing', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        responseWithUrl(
          { success: false, error: 'Failed to restore tournament archive' },
          500,
          'https://example.test/api/tournaments/archived-1/restore',
        ),
      );
    const response = responseWithUrl(
      { success: false, error: 'Tournament not found' },
      404,
      'https://example.test/api/tournaments/archived-1',
    );

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Failed to restore tournament archive');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(true);
  });

  it('classifies a concrete API transition error as user-facing', async () => {
    const response = new Response(
      JSON.stringify({ success: false, error: 'Cannot change tournament status from completed to active' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Cannot change tournament status from completed to active');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(true);
  });

  it('classifies a nested data.error transition error as user-facing', async () => {
    const response = new Response(
      JSON.stringify({ success: false, data: { error: 'Archived tournament must be restored first' } }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Archived tournament must be restored first');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(true);
  });

  it('classifies a top-level message transition error as user-facing', async () => {
    const response = new Response(JSON.stringify({ success: false, message: 'Tournament status is locked' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Tournament status is locked');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(true);
  });

  it('does not promote whitespace-only API detail to a user-facing error', async () => {
    const response = new Response(
      JSON.stringify({ success: false, error: '   ', message: '\t', data: { error: '\n' } }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('HTTP 409');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(false);
  });

  it('classifies non-JSON HTTP fallback details as generic', async () => {
    const response = new Response('upstream failure', { status: 502 });

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('HTTP 502');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(false);
  });

  it('classifies malformed success responses as generic', async () => {
    const response = new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const error = await parseTournamentStatusUpdateResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid tournament status update response');
    expect(isUserFacingTournamentStatusUpdateError(error)).toBe(false);
  });
});
