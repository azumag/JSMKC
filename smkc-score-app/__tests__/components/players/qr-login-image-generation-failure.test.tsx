/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3663: once the server has successfully
 * issued a one-time QR login token, local QR rendering failure must not hide
 * the raw login URL or misreport the server mutation as failed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { QrLoginDialog } from '@/components/players/qr-login-dialog';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toString: jest.fn(() => Promise.resolve('<svg>mock-qr</svg>')),
  },
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

describe('QR login image generation failure fallback (issue #3663)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn(() => true);
    mockLogger.error.mockClear();
    jest.mocked(QRCode.toString).mockReset();
  });

  it('keeps the issued login URL usable when local QR rendering fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { token: 'issued-token', issuedAt: '2026-09-17T11:30:00.000Z' },
        }),
      });
    jest.mocked(QRCode.toString).mockRejectedValueOnce(new Error('renderer failed'));

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    const issueButton = await screen.findByRole('button', { name: 'issueQrCode' });
    await waitFor(() => expect(issueButton).not.toBeDisabled());

    fireEvent.click(issueButton);

    const loginUrlInput = await screen.findByLabelText('qrLoginUrl');
    expect(loginUrlInput).toHaveValue(expect.stringContaining('token=issued-token'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'printQrCode' })).not.toBeInTheDocument();
    expect(screen.queryByText('failedToIssueQrCode')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'revokeQrCode' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to generate QR login image',
      expect.objectContaining({ message: 'renderer failed' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
