/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3822. Token-changing QR login actions must
 * serialize synchronously, before React commits the `submitting` render state.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QrLoginDialog } from '@/components/players/qr-login-dialog';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toString: jest.fn(() => Promise.resolve('<svg>mock-qr</svg>')),
  },
}));

// Invoke mutation handlers twice from one native activation. The second call
// happens before React can commit `submitting`, reproducing the same-render
// re-entry window that a state-only guard cannot close.
jest.mock('@/components/ui/button', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const mutationLabels = new Set(['issueQrCode', 'reissueQrCode', 'revokeQrCode']);

  const Button = ReactActual.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ onClick, children, ...props }, ref) =>
      ReactActual.createElement(
        'button',
        {
          ...props,
          ref,
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            if (mutationLabels.has(String(children))) onClick?.(event);
          },
        },
        children,
      ),
  );
  Button.displayName = 'Button';

  return { Button };
});

interface DeferredResponse {
  promise: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  resolve: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
}

function deferredResponse(): DeferredResponse {
  let resolve!: DeferredResponse['resolve'];
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function mutationCalls(fetchMock: jest.Mock, method: 'POST' | 'DELETE') {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

async function openDialog(fetchMock: jest.Mock, active: boolean) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: { active, issuedAt: active ? '2026-01-01T00:00:00.000Z' : null } }),
  });

  render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);
  fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));

  const expectedAction = active ? 'reissueQrCode' : 'issueQrCode';
  await waitFor(() => expect(screen.getByRole('button', { name: expectedAction })).toBeInTheDocument());
}

describe('QrLoginDialog mutation serialization', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn(() => true);
  });

  it('starts one issue request per activation and unlocks after completion', async () => {
    await openDialog(fetchMock, false);
    const firstPost = deferredResponse();
    fetchMock.mockImplementationOnce(() => firstPost.promise);

    fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));

    expect(mutationCalls(fetchMock, 'POST')).toHaveLength(1);

    firstPost.resolve({
      ok: true,
      json: async () => ({ success: true, data: { token: 'first-token', issuedAt: '2026-01-01T00:00:00.000Z' } }),
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { token: 'second-token', issuedAt: '2026-01-02T00:00:00.000Z' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'reissueQrCode' }));

    await waitFor(() => expect(mutationCalls(fetchMock, 'POST')).toHaveLength(2));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('starts one revoke request and one confirmation per activation', async () => {
    await openDialog(fetchMock, true);
    const deleteResponse = deferredResponse();
    fetchMock.mockImplementationOnce(() => deleteResponse.promise);

    fireEvent.click(screen.getByRole('button', { name: 'revokeQrCode' }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(mutationCalls(fetchMock, 'DELETE')).toHaveLength(1);

    deleteResponse.resolve({
      ok: true,
      json: async () => ({ success: true, data: { active: false } }),
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'revokeQrCode' })).not.toBeInTheDocument());
  });
});
