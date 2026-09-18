/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsScoreOverride } from '@/components/tournament/finals-score-override';
import enMessages from '../../../messages/en.json';
import jaMessages from '../../../messages/ja.json';

const mockFinalsMessages = { en: enMessages.finals, ja: jaMessages.finals };
let mockLocale: keyof typeof mockFinalsMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => mockFinalsMessages[mockLocale][key],
}));

describe('FinalsScoreOverride', () => {
  const originalFetch = global.fetch;
  const originalAlert = window.alert;

  beforeEach(() => {
    mockLocale = 'en';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.alert = originalAlert;
  });

  it('uses localized, player-specific accessible names for corrected score inputs', () => {
    mockLocale = 'ja';
    render(
      <FinalsScoreOverride
        match={{
          id: 'm1',
          version: 4,
          player1Id: 'p1',
          player2Id: 'p2',
          player1: { nickname: '一郎' },
          player2: { nickname: '次郎' },
        }}
        endpoint="/api/test"
        score1={2}
        score2={1}
        onSaved={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('訂正した結果を記録（管理者）'));
    expect(screen.getByLabelText('訂正した結果（負の値を含む合計を入力可）: 一郎')).toHaveValue('2');
    expect(screen.getByLabelText('訂正した結果（負の値を含む合計を入力可）: 次郎')).toHaveValue('1');
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

  it('shows a generic failure and allows retry after a network rejection', async () => {
    const onSaved = jest.fn();
    const alertMock = jest.fn();
    window.alert = alertMock;
    global.fetch = jest.fn().mockRejectedValue(new TypeError('private network detail'));

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
        score1={2}
        score2={1}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByLabelText('Record corrected result (admin)'));
    const saveButton = screen.getByRole('button', { name: 'Save corrected result' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to save corrected result'));
    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalledWith(expect.stringContaining('private network detail'));
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
