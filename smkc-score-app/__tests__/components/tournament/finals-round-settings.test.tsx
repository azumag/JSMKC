/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsRoundSettings } from '@/components/tournament/finals-round-settings';
import enMessages from '../../../messages/en.json';
import jaMessages from '../../../messages/ja.json';

const mockFinalsMessages = { en: enMessages.finals, ja: jaMessages.finals };
let mockLocale: keyof typeof mockFinalsMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => mockFinalsMessages[mockLocale][key],
}));

describe('FinalsRoundSettings', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockLocale = 'en';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses a localized accessible name for the target wins input', () => {
    mockLocale = 'ja';
    render(
      <FinalsRoundSettings
        match={{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 }}
        matches={[{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 }]}
        endpoint="/api/test"
        effectiveTargetWins={7}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('ラウンド形式')).toHaveValue(7);
  });

  it('uses the pending round format when opened from a completed historic FT card', () => {
    render(
      <FinalsRoundSettings
        match={{ id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 }}
        matches={[
          { id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 },
          { id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 },
        ]}
        endpoint="/api/test"
        effectiveTargetWins={5}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round format')).toHaveValue(7);
  });

  it('shows a localized failure and restores the apply button when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();

    render(
      <FinalsRoundSettings
        match={{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 }}
        matches={[{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 }]}
        endpoint="/api/test"
        effectiveTargetWins={7}
        onSaved={onSaved}
      />,
    );

    const applyButton = screen.getByRole('button', { name: 'Apply to pending' });
    fireEvent.click(applyButton);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to update the round format'));
    expect(onSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(applyButton).not.toBeDisabled());
  });
});
