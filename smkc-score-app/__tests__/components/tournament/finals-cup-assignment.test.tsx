/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalsCupAssignment } from '@/components/tournament/finals-cup-assignment';
import enMessages from '../../../messages/en.json';
import jaMessages from '../../../messages/ja.json';

const finalsMessages = { en: enMessages.finals, ja: jaMessages.finals };
let mockLocale: keyof typeof finalsMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => finalsMessages[mockLocale][key],
}));

describe('FinalsCupAssignment', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    mockLocale = 'en';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses localized accessible names for cup controls', () => {
    mockLocale = 'ja';
    render(
      <FinalsCupAssignment
        match={{ id: 'm1', version: 4, cup: 'Mushroom', cupResults: [{ cup: 'Mushroom' }] }}
        endpoint="/api/test"
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('試合のカップ')).toBeInTheDocument();
    expect(screen.getByLabelText('保存済みカップ詳細')).toBeInTheDocument();
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

  it('shows a localized failure and restores the save button when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();

    render(
      <FinalsCupAssignment match={{ id: 'm1', version: 4, cup: 'Mushroom' }} endpoint="/api/test" onSaved={onSaved} />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save match cup' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to update match cup'));
    expect(onSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });
});
