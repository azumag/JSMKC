/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsRoundCoursesSettings } from '@/components/tournament/finals-round-courses-settings';
import enMessages from '../../../messages/en.json';
import jaMessages from '../../../messages/ja.json';

const mockFinalsMessages = { en: enMessages.finals, ja: jaMessages.finals };
let mockLocale: keyof typeof mockFinalsMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => mockFinalsMessages[mockLocale][key],
}));

describe('FinalsRoundCoursesSettings', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockLocale = 'en';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the localized associated label as the input accessible name', () => {
    mockLocale = 'ja';
    render(
      <FinalsRoundCoursesSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4 }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4, assignedCourses: ['MC1'] },
        ]}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('ラウンドのコース')).toHaveValue('MC1');
  });

  it('resets unsaved input when the selected match changes even if the saved courses are the same', () => {
    const { rerender } = render(
      <FinalsRoundCoursesSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4 }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4, assignedCourses: ['MC1'] },
        ]}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Round courses'), { target: { value: 'DP1' } });
    expect(screen.getByLabelText('Round courses')).toHaveValue('DP1');

    rerender(
      <FinalsRoundCoursesSettings
        match={{ id: 'm2', stage: 'finals', round: 'winners_qf', completed: false, version: 2 }}
        matches={[
          { id: 'm2', stage: 'finals', round: 'winners_qf', completed: false, version: 2, assignedCourses: ['MC1'] },
        ]}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round courses')).toHaveValue('MC1');
  });

  it('resynchronizes the input when assigned courses change for the current round', () => {
    const { rerender } = render(
      <FinalsRoundCoursesSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4 }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4, assignedCourses: ['MC1'] },
        ]}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    rerender(
      <FinalsRoundCoursesSettings
        match={{ id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 5 }}
        matches={[
          {
            id: 'm1',
            stage: 'finals',
            round: 'winners_qf',
            completed: false,
            version: 5,
            assignedCourses: ['DP1', 'GV1'],
          },
        ]}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round courses')).toHaveValue('DP1, GV1');
  });

  it('sends every pending match version and leaves completed matches out of the update contract', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSaved = jest.fn();
    render(
      <FinalsRoundCoursesSettings
        match={{
          id: 'm1',
          stage: 'finals',
          round: 'winners_qf',
          completed: false,
          version: 4,
          assignedCourses: ['MC1'],
        }}
        matches={[
          { id: 'm1', stage: 'finals', round: 'winners_qf', completed: false, version: 4, assignedCourses: ['MC1'] },
          { id: 'm2', stage: 'finals', round: 'winners_qf', completed: false, version: 2, assignedCourses: ['MC1'] },
          { id: 'old', stage: 'finals', round: 'winners_qf', completed: true, version: 9, assignedCourses: ['GV1'] },
        ]}
        endpoint="/api/test"
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText('Round courses'), { target: { value: 'MC1, DP1, GV1, BC1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply courses to pending' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ body: expect.stringContaining('"expectedVersions":{"m1":4,"m2":2}') }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows a localized failure and restores the apply button when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();

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

    const applyButton = screen.getByRole('button', { name: 'Apply courses to pending' });
    fireEvent.click(applyButton);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to update round courses'));
    expect(onSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(applyButton).not.toBeDisabled());
  });

  it('serializes same-render apply activations into one PATCH', async () => {
    const onSaved = jest.fn();
    let resolveSave!: (response: Response) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSave = resolve;
      }),
    );

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

    const applyButton = screen.getByRole('button', { name: 'Apply courses to pending' });
    act(() => {
      applyButton.click();
      applyButton.click();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          matchId: 'm1',
          roundCourses: { courses: ['MC1'], expectedVersions: { m1: 4 } },
        }),
      }),
    );

    await act(async () => {
      resolveSave({ ok: true } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(applyButton).not.toBeDisabled());
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
