/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsPlayoffReconciliation } from '@/components/tournament/finals-playoff-reconciliation';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const r2 = [5, 6, 7, 8].map((matchNumber) => ({
  id: `playoff-${matchNumber}`,
  stage: 'playoff',
  round: 'playoff_r2',
  completed: true,
  version: matchNumber,
}));

const stalePreview = {
  data: {
    upperReconciliation: {
      status: 'stale',
      changes: [{ targetMatchNumber: 1, slot: 2, beforePlayerId: 'old', afterPlayerId: 'new' }],
      affectedMatches: [],
      expectedVersions: { 'final-1': 3, 'playoff-5': 5, 'playoff-6': 6, 'playoff-7': 7, 'playoff-8': 8 },
    },
  },
};

function renderReconciliation(onSaved = jest.fn()) {
  render(
    <FinalsPlayoffReconciliation
      matches={[{ id: 'final-1', stage: 'finals', round: 'winners_r1', completed: false, version: 3 }]}
      playoffMatches={r2}
      endpoint="/api/t/finals"
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('FinalsPlayoffReconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends only current versions and refreshes after a successful targeted reconciliation', async () => {
    const onSaved = jest.fn();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => stalePreview } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'updated' } }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { upperReconciliation: { status: 'in_sync', changes: [], affectedMatches: [], expectedVersions: {} } },
        }),
      } as Response);
    renderReconciliation(onSaved);

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

  it('serializes same-render reconciliation applies while the first PATCH is pending', async () => {
    let resolvePatch!: (value: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => stalePreview } as Response)
      .mockReturnValue(pendingPatch);
    const onSaved = renderReconciliation();

    const runButton = await screen.findByRole('button', { name: 'reconcileUpperSlotsRun' });

    act(() => {
      runButton.click();
      runButton.click();
    });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      resolvePatch({ ok: false, json: async () => ({ code: 'TEST_CONFLICT' }) } as Response);
      await pendingPatch;
    });

    await waitFor(() => expect(runButton).toBeEnabled());
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
    renderReconciliation(onSaved);

    expect(await screen.findByText('M31: grand_final_reset: DOWNSTREAM_MATCH_STARTED')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'reconcileUpperSlotsRun' })).not.toBeInTheDocument();
  });

  it('shows a localized retry state when the preview request rejects and recovers after retry', async () => {
    const rawNetworkError = 'connect ECONNREFUSED 10.0.0.4:443';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error(rawNetworkError))
      .mockResolvedValueOnce({ ok: true, json: async () => stalePreview } as Response);
    renderReconciliation();

    expect(await screen.findByRole('alert')).toHaveTextContent('networkError');
    expect(screen.queryByText(rawNetworkError)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }));

    expect(await screen.findByRole('button', { name: 'reconcileUpperSlotsRun' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats preview HTTP failures as retryable without reading the failure body', async () => {
    const rawServerError = 'internal shard=prod-a database timeout';
    const failureJson = jest.fn(async () => ({ error: rawServerError }));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, json: failureJson } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => stalePreview } as Response);
    renderReconciliation();

    expect(await screen.findByRole('alert')).toHaveTextContent('networkError');
    expect(screen.queryByText(rawServerError)).not.toBeInTheDocument();
    expect(failureJson).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }));

    expect(await screen.findByRole('button', { name: 'reconcileUpperSlotsRun' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the retry state when a successful preview response has an invalid shape', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { upperReconciliation: { status: 'stale' } } }),
    } as Response);
    renderReconciliation();

    expect(await screen.findByRole('alert')).toHaveTextContent('networkError');
    expect(screen.getByRole('button', { name: 'tryAgain' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'reconcileUpperSlotsRun' })).not.toBeInTheDocument();
  });

  it('keeps reconciliation retryable and does not save when the PATCH request rejects', async () => {
    const rawNetworkError = 'socket hang up from internal proxy';
    const onSaved = jest.fn();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => stalePreview } as Response)
      .mockRejectedValueOnce(new Error(rawNetworkError));
    renderReconciliation(onSaved);

    const runButton = await screen.findByRole('button', { name: 'reconcileUpperSlotsRun' });
    fireEvent.click(runButton);

    expect(await screen.findByRole('alert')).toHaveTextContent('networkError');
    expect(screen.queryByText(rawNetworkError)).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(runButton).toBeEnabled());
  });
});
