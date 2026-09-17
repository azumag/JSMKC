/**
 * @jest-environment jsdom
 *
 * Regression coverage for issues #3655 and #3657: one-time QR bearer
 * credentials and async dialog state must not survive or leak across dialog
 * sessions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('QR login dialog session cleanup (issues #3655 and #3657)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.confirm = jest.fn(() => true);
    jest.mocked(QRCode.toString).mockClear();
  });

  it('clears sensitive and read-only loading state on every dialog transition without releasing mutation lock', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/players/qr-login-dialog.tsx'), 'utf8');
    const handler = source.slice(source.indexOf('const handleOpenChange'), source.indexOf('const handleIssue'));

    expect(handler).toContain('dialogSessionRef.current = dialogSession;');
    expect(handler).toContain('setLoading(false);');
    expect(handler).not.toContain('setSubmitting(false);');
    expect(handler).toContain('setRawToken(null);');
    expect(handler).toContain('setQrImageUrl(null);');
    expect(handler).toContain('void fetchStatus(dialogSession);');
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const issueButton = await screen.findByRole('button', { name: 'issueQrCode' });
    await waitFor(() => expect(issueButton).not.toBeDisabled());

    fireEvent.click(issueButton);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'POST' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled();

    await act(async () => {
      resolveIssue({
        ok: true,
        json: async () => ({
          success: true,
          data: { token: 'stale-raw-token', issuedAt: '2026-09-17T00:00:00.000Z' },
        }),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled());
    expect(screen.queryByLabelText('qrLoginUrl')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(QRCode.toString).not.toHaveBeenCalled();
  });

  it('ignores an old status response that finishes after the reopened session has loaded', async () => {
    let resolveOldStatus!: (value: unknown) => void;
    const oldStatusResponse = new Promise((resolve) => {
      resolveOldStatus = resolve;
    });

    fetchMock.mockReturnValueOnce(oldStatusResponse).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { active: true, issuedAt: '2026-09-17T01:00:00.000Z' } }),
    });

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument());

    await act(async () => {
      resolveOldStatus({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      });
      await Promise.resolve();
    });

    expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reissueQrCode' })).toBeInTheDocument();
  });

  it('keeps a pending issue mutation serialized across close and reopen until that request settles', async () => {
    let resolveIssue!: (value: unknown) => void;
    const issueResponse = new Promise((resolve) => {
      resolveIssue = resolve;
    });
    const inactiveStatus = {
      ok: true,
      json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
    };

    fetchMock
      .mockResolvedValueOnce(inactiveStatus)
      .mockReturnValueOnce(issueResponse)
      .mockResolvedValueOnce(inactiveStatus);

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    const savingButton = screen.getByRole('button', { name: 'saving' });
    expect(savingButton).toBeDisabled();
    fireEvent.click(savingButton);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveIssue({
        ok: true,
        json: async () => ({
          success: true,
          data: { token: 'stale-token', issuedAt: '2026-09-17T01:00:00.000Z' },
        }),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).not.toBeDisabled());
    expect(screen.queryByLabelText('qrLoginUrl')).not.toBeInTheDocument();
    expect(QRCode.toString).not.toHaveBeenCalled();
  });

  it('ignores a revoke response from a dialog session that has already closed', async () => {
    let resolveRevoke!: (value: unknown) => void;
    const revokeResponse = new Promise((resolve) => {
      resolveRevoke = resolve;
    });
    const activeStatus = {
      ok: true,
      json: async () => ({ success: true, data: { active: true, issuedAt: '2026-09-17T02:00:00.000Z' } }),
    };

    fetchMock
      .mockResolvedValueOnce(activeStatus)
      .mockReturnValueOnce(revokeResponse)
      .mockResolvedValueOnce(activeStatus);

    render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);

    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'revokeQrCode' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'revokeQrCode' })).toBeDisabled();

    await act(async () => {
      resolveRevoke({ ok: true });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).not.toBeDisabled());
    expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'revokeQrCode' })).not.toBeDisabled();
  });
});
