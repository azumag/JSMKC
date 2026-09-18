/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsCupAssignment } from '@/components/tournament/finals-cup-assignment';
import { FinalsRoundCoursesSettings } from '@/components/tournament/finals-round-courses-settings';
import { FinalsRoundSettings } from '@/components/tournament/finals-round-settings';
import enMessages from '../../../messages/en.json';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => enMessages.finals[key],
}));

describe('finals settings HTTP error redaction', () => {
  const originalFetch = global.fetch;
  const originalAlert = window.alert;

  afterEach(() => {
    global.fetch = originalFetch;
    window.alert = originalAlert;
  });

  function mockHttpFailureThenSuccess() {
    return jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'private database detail' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  }

  it('redacts round-format HTTP detail and allows retry', async () => {
    const alertMock = jest.fn();
    const onSaved = jest.fn();
    const fetchMock = mockHttpFailureThenSuccess();
    window.alert = alertMock;
    global.fetch = fetchMock;

    render(
      <FinalsRoundSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 },
        ]}
        endpoint="/api/test"
        effectiveTargetWins={7}
        onSaved={onSaved}
      />,
    );

    const button = screen.getByRole('button', { name: 'Apply to pending' });
    fireEvent.click(button);

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to update the round format'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(alertMock).not.toHaveBeenCalledWith(expect.stringContaining('private database detail'));
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('redacts round-courses HTTP detail and allows retry', async () => {
    const alertMock = jest.fn();
    const onSaved = jest.fn();
    const fetchMock = mockHttpFailureThenSuccess();
    window.alert = alertMock;
    global.fetch = fetchMock;

    render(
      <FinalsRoundCoursesSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4 }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4, assignedCourses: ['MC1'] },
        ]}
        endpoint="/api/test"
        onSaved={onSaved}
      />,
    );

    const button = screen.getByRole('button', { name: 'Apply courses to pending' });
    fireEvent.click(button);

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to update round courses'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(alertMock).not.toHaveBeenCalledWith(expect.stringContaining('private database detail'));
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('redacts cup-assignment HTTP detail and allows retry', async () => {
    const alertMock = jest.fn();
    const onSaved = jest.fn();
    const fetchMock = mockHttpFailureThenSuccess();
    window.alert = alertMock;
    global.fetch = fetchMock;

    render(
      <FinalsCupAssignment match={{ id: 'm1', version: 4, cup: 'Mushroom' }} endpoint="/api/test" onSaved={onSaved} />,
    );

    const button = screen.getByRole('button', { name: 'Save match cup' });
    fireEvent.click(button);

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to update match cup'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(alertMock).not.toHaveBeenCalledWith(expect.stringContaining('private database detail'));
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
