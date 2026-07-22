/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsCupAssignment } from '@/components/tournament/finals-cup-assignment';

describe('FinalsCupAssignment', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requires a visible keep-or-clear selection when cup details exist and sends keep by default', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <FinalsCupAssignment
        match={{ id: 'm1', version: 4, cup: 'Mushroom', cupResults: [{ cup: 'Mushroom' }] }}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Cup details resolution')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save match cup' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ body: expect.stringContaining('"resolution":"keep"') }),
    );
  });

  it('treats a participant race report as conflicting detail', () => {
    render(
      <FinalsCupAssignment
        match={{ id: 'm1', version: 4, cup: 'Mushroom', player1ReportedRaces: [{ course: 'MC1' }] }}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Cup details resolution')).toBeInTheDocument();
  });
});
