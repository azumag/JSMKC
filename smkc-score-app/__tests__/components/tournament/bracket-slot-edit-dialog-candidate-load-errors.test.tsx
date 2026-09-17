/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BracketSlotEditDialog, type SlotEditMatchData } from '@/components/tournament/bracket-slot-edit-dialog';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/client-logger', () => {
  const error = jest.fn();
  return {
    __mockLoggerError: error,
    createLogger: () => ({ error, warn: jest.fn(), info: jest.fn() }),
  };
});

const mockLoggerError = (jest.requireMock('@/lib/client-logger') as { __mockLoggerError: jest.Mock }).__mockLoggerError;

const player1 = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
const player2 = { id: 'p2', name: 'Bob B', nickname: 'Bob' };

const match: SlotEditMatchData = {
  id: 'm1',
  matchNumber: 1,
  round: 'winners_qf',
  completed: false,
  isBye: false,
  version: 2,
  player1Id: player1.id,
  player2Id: player2.id,
  player1,
  player2,
};

const bracketStructure = [{ matchNumber: 1, round: 'winners_qf', bracket: 'winners' as const }];

function renderDialog() {
  return render(
    <BracketSlotEditDialog
      open
      onOpenChange={jest.fn()}
      finalsApiPath="/api/tournaments/t1/bm/finals"
      qualificationApiPath="/api/tournaments/t1/bm"
      match={match}
      slot={1}
      matches={[match]}
      bracketStructure={bracketStructure}
      onSaved={jest.fn()}
    />,
  );
}

describe('BracketSlotEditDialog candidate loading errors', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockLoggerError.mockClear();
  });

  it('shows a network error instead of "No eligible candidates" when the request rejects', async () => {
    const rejection = new Error('internal qualification gateway unavailable');
    fetchMock.mockRejectedValue(rejection);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Assign a different player' }));

    expect(await screen.findByTestId('slot-edit-candidate-load-error')).toBeInTheDocument();
    expect(screen.queryByText('No eligible candidates')).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith('Failed to load bracket slot assign candidates:', {
      error: rejection,
      qualificationApiPath: '/api/tournaments/t1/bm',
    });
  });

  it('treats a non-2xx candidate response as a load failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'temporary outage' }),
    });

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Assign a different player' }));

    expect(await screen.findByTestId('slot-edit-candidate-load-error')).toBeInTheDocument();
    expect(screen.queryByText('No eligible candidates')).not.toBeInTheDocument();
    await waitFor(() => expect(mockLoggerError).toHaveBeenCalledTimes(1));
  });

  it('shows "No eligible candidates" only after a successful empty response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { qualifications: [] } }),
    });

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Assign a different player' }));

    expect(await screen.findByText('No eligible candidates')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-edit-candidate-load-error')).not.toBeInTheDocument();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
