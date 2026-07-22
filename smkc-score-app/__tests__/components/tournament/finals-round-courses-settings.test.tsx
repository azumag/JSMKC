/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsRoundCoursesSettings } from '@/components/tournament/finals-round-courses-settings';

describe('FinalsRoundCoursesSettings', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
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
});
