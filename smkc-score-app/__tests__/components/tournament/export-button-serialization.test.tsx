/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportButton } from '@/components/tournament/export-button';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn() }),
}));

// Invoke the supplied click handler twice during one native activation so the
// regression does not depend on React committing `isExporting` between calls.
jest.mock('@/components/ui/button', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    Button: ({ onClick, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      ReactActual.createElement(
        'button',
        {
          ...props,
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            onClick?.(event);
          },
        },
        children,
      ),
  };
});

describe('ExportButton serialization', () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockImplementation(async () => new Response(new Blob(['export']), { status: 200 })) as unknown as typeof fetch;
    window.URL.createObjectURL = jest.fn(() => 'blob:test-export');
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  it('starts one export per activation and unlocks after completion', async () => {
    render(<ExportButton tournamentId="tournament-1">Export</ExportButton>);
    const button = screen.getByRole('button', { name: 'Export' });

    fireEvent.click(button);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.click(button);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2));
  });
});
