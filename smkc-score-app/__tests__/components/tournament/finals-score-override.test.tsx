/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsScoreOverride } from '@/components/tournament/finals-score-override';

describe('FinalsScoreOverride', () => {
  const originalFetch = global.fetch;
  const originalAlert = window.alert;

  afterEach(() => {
    global.fetch = originalFetch;
    window.alert = originalAlert;
  });

  it('shows API advancement warnings inside the success response envelope', async () => {
    const onSaved = jest.fn();
    const alertMock = jest.fn();
    window.alert = alertMock;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { advancementWarnings: [{ matchNumber: 5 }] } }),
    });

    render(
      <FinalsScoreOverride
        match={{
          id: 'm1',
          version: 4,
          player1Id: 'p1',
          player2Id: 'p2',
          player1: { nickname: 'One' },
          player2: { nickname: 'Two' },
        }}
        endpoint="/api/test"
        score1={0}
        score2={-1}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByLabelText('Record corrected result (admin)'));
    fireEvent.click(screen.getByRole('button', { name: 'Save corrected result' }));

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('downstream slots')));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing player-2 tie override when the correction form is opened again', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });

    render(
      <FinalsScoreOverride
        match={{
          id: 'm1',
          version: 5,
          player1Id: 'p1',
          player2Id: 'p2',
          winnerOverrideId: 'p2',
          player1: { nickname: 'One' },
          player2: { nickname: 'Two' },
        }}
        endpoint="/api/test"
        score1={3}
        score2={3}
        onSaved={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Record corrected result (admin)'));
    expect(screen.getByRole('combobox')).toHaveValue('p2');
    fireEvent.click(screen.getByRole('button', { name: 'Save corrected result' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ body: expect.stringContaining('"winnerId":"p2"') }),
    );
  });
});
