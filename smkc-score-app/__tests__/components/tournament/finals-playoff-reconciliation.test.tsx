/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsPlayoffReconciliation } from '@/components/tournament/finals-playoff-reconciliation';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const r2 = [5, 6, 7, 8].map((matchNumber) => ({
  id: `playoff-${matchNumber}`,
  stage: 'playoff',
  round: 'playoff_r2',
  completed: true,
  version: matchNumber,
}));

describe('FinalsPlayoffReconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends only current versions and refreshes after a successful targeted reconciliation', async () => {
    const onSaved = jest.fn();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            upperReconciliation: {
              status: 'stale',
              changes: [{ targetMatchNumber: 1, slot: 2, beforePlayerId: 'old', afterPlayerId: 'new' }],
              affectedMatches: [],
              expectedVersions: { 'final-1': 3, 'playoff-5': 5, 'playoff-6': 6, 'playoff-7': 7, 'playoff-8': 8 },
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'updated' } }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { upperReconciliation: { status: 'in_sync', changes: [], affectedMatches: [], expectedVersions: {} } },
        }),
      } as Response);
    render(
      <FinalsPlayoffReconciliation
        matches={[{ id: 'final-1', stage: 'finals', round: 'winners_r1', completed: false, version: 3 }]}
        playoffMatches={r2}
        endpoint="/api/t/finals"
        onSaved={onSaved}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'reconcileUpperSlotsRun' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/t/finals',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          upperReconciliation: {
            expectedVersions: { 'final-1': 3, 'playoff-5': 5, 'playoff-6': 6, 'playoff-7': 7, 'playoff-8': 8 },
          },
        }),
      }),
    );
  });

  it('shows the server-provided impact list before allowing a protected operation', async () => {
    const onSaved = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          upperReconciliation: {
            status: 'blocked',
            changes: [{ targetMatchNumber: 1, slot: 2 }],
            affectedMatches: [
              { id: 'final-31', matchNumber: 31, round: 'grand_final_reset', reasons: ['DOWNSTREAM_MATCH_STARTED'] },
            ],
            expectedVersions: {},
          },
        },
      }),
    } as Response);
    render(
      <FinalsPlayoffReconciliation
        matches={[{ id: 'final-1', stage: 'finals', round: 'winners_r1', completed: false, version: 3 }]}
        playoffMatches={r2}
        endpoint="/api/t/finals"
        onSaved={onSaved}
      />,
    );

    expect(await screen.findByText('M31: grand_final_reset: DOWNSTREAM_MATCH_STARTED')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'reconcileUpperSlotsRun' })).not.toBeInTheDocument();
  });
});
