/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3655: one-time QR bearer credentials must
 * not survive a dialog close or be restored by an async response from an
 * earlier dialog session.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { QrLoginDialog } from '@/components/players/qr-login-dialog';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toString: jest.fn(() => Promise.resolve('<svg>mock-qr</svg>')),
  },
}));

describe('QR login sensitive state cleanup (issue #3655)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn(() => true);
    jest.mocked(QRCode.toString).mockClear();
  });

  it('clears both sensitive states on every dialog transition', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/players/qr-login-dialog.tsx'), 'utf8');
    const handler = source.slice(source.indexOf('const handleOpenChange'), source.indexOf('const handleIssue'));

    expect(handler).toContain('dialogSessionRef.current += 1;');
    expect(handler).toContain('setRawToken(null);');
    expect(handler).toContain('setQrImageUrl(null);');
  });

  it('does not restore a bearer token when an old issue request finishes after close and reopen', async () => {
    let resolveIssue!: (value: unknown) => void;
    const issueResponse = new Promise((resolve) => {
      resolveIssue = resolve;
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      })
      .mockReturnValueOnce(issueResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: true, issuedAt: '2026-09-17T00:00:00.000Z' } }),
      });

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'POST' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument());

    resolveIssue({
      ok: true,
      json: async () => ({
        success: true,
        data: { token: 'stale-raw-token', issuedAt: '2026-09-17T00:00:00.000Z' },
      }),
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled());
    expect(screen.queryByLabelText('qrLoginUrl')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(QRCode.toString).not.toHaveBeenCalled();
  });
});
