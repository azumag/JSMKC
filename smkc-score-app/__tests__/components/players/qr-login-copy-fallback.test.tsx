/**
 * @jest-environment jsdom
 */
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

async function renderIssuedQr() {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { token: 'raw-token-abc', issuedAt: '2026-01-01T00:00:00.000Z' },
      }),
    });
  global.fetch = fetchMock as unknown as typeof fetch;

  render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);
  fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'POST' }),
  );
  await waitFor(() => expect(screen.getByLabelText('qrLoginUrl')).toBeInTheDocument());

  return screen.getByLabelText('qrLoginUrl') as HTMLInputElement;
}

describe('QrLoginDialog copy fallback (issue #3649)', () => {
  beforeEach(() => {
    window.confirm = jest.fn(() => true);
  });

  it('copies the login URL with the Clipboard API when available', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const input = await renderIssuedQr();
    fireEvent.click(screen.getByRole('button', { name: 'copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(input.value));
  });

  it('selects the URL for manual copy when Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    const input = await renderIssuedQr();
    const focusSpy = jest.spyOn(input, 'focus');
    const selectSpy = jest.spyOn(input, 'select');

    fireEvent.click(screen.getByRole('button', { name: 'copy' }));

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  });

  it('handles Clipboard API rejection and falls back to selecting the URL', async () => {
    const writeText = jest.fn(() => Promise.reject(new Error('clipboard denied')));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const input = await renderIssuedQr();
    const focusSpy = jest.spyOn(input, 'focus');
    const selectSpy = jest.spyOn(input, 'select');

    fireEvent.click(screen.getByRole('button', { name: 'copy' }));

    await waitFor(() => expect(selectSpy).toHaveBeenCalled());
    expect(focusSpy).toHaveBeenCalled();
  });
});
