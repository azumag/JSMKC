/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3661: QR token mutations must remain
 * disabled while the current dialog session's server status is unknown.
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

describe('QR login status fail-closed behavior (issue #3661)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('disables token mutation after an initial status failure and enables it after retry succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      });

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));

    await waitFor(() => expect(screen.getByText('failedToLoadQrStatus')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeDisabled();
    expect(screen.queryByText('qrCodeNotIssued')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('qrCodeNotIssued')).toBeInTheDocument());
    expect(screen.queryByText('failedToLoadQrStatus')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'issueQrCode' })).not.toBeDisabled();
  });

  it('does not reuse an active status from the previous dialog session when reopen loading fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: true, issuedAt: '2026-09-17T03:00:00.000Z' } }),
      })
      .mockResolvedValueOnce({ ok: false });

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: 'revokeQrCode' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('failedToLoadQrStatus')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'revokeQrCode' })).not.toBeInTheDocument();
    expect(screen.queryByText('qrCodeActiveNote')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tryAgain' })).toBeInTheDocument();
  });
});
