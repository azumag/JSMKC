/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CdmArchiveReconcileButton } from '@/components/tournament/cdm-archive-reconcile-button';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn() }),
}));

// Deliberately invoke the component's click handler twice during one native
// activation. This models re-entrant/same-render callers without giving React a
// chance to commit the `busy` state between calls.
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

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body };
}

function renderButton() {
  render(
    React.createElement(CdmArchiveReconcileButton, {
      tournamentId: 'tournament-1',
      tournamentName: 'Tournament One',
      status: 'completed',
      excluded: false,
      archivePending: false,
    }),
  );
}

describe('CdmArchiveReconcileButton serialization', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(false, {})) as unknown as typeof fetch;
    window.alert = jest.fn();
    window.prompt = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts one reconcile flow per activation and unlocks after failure', async () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' });

    fireEvent.click(button);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    await waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.click(button);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
