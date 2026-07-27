/**
 * @jest-environment jsdom
 *
 * @module Test Suite: QrLoginDialog (issue #3055)
 *
 * Covers the QR one-scan login management dialog:
 * - Fetches and displays current status (active/inactive) on open
 * - Issuing a token shows the QR image + login URL exactly once
 * - Reissuing/revoking require confirmation and call the right endpoints
 * - Errors from each network call surface a message instead of crashing
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderDialog() {
  return render(<QrLoginDialog playerId="player-1" playerNickname="TestPlayer" />);
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'qrLogin' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/players/player-1/qr-login-token'));
}

describe('QrLoginDialog', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
    window.confirm = jest.fn(() => true);
  });

  it('fetches and shows "not issued" status on open', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
    });

    renderDialog();
    await openDialog();

    await waitFor(() => expect(screen.getByText('qrCodeNotIssued')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'revokeQrCode' })).not.toBeInTheDocument();
  });

  it('shows the active note and a reissue/revoke option when a token already exists', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { active: true, issuedAt: '2026-01-01T00:00:00.000Z' } }),
    });

    renderDialog();
    await openDialog();

    await waitFor(() => expect(screen.getByText('qrCodeActiveNote')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'reissueQrCode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'revokeQrCode' })).toBeInTheDocument();
  });

  it('issues a token and displays the QR image + login URL exactly once', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { token: 'raw-token-abc', issuedAt: '2026-01-01T00:00:00.000Z' } }),
      });

    renderDialog();
    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'POST' }),
    );
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    const urlInput = screen.getByLabelText('qrLoginUrl') as HTMLInputElement;
    expect(urlInput.value).toContain('raw-token-abc');
    expect(urlInput).toHaveAttribute('readonly');
  });

  it('asks for confirmation before reissuing and shows the new QR on confirm', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: true, issuedAt: '2025-01-01T00:00:00.000Z' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { token: 'new-token', issuedAt: '2026-01-01T00:00:00.000Z' } }),
      });

    renderDialog();
    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'reissueQrCode' }));

    expect(window.confirm).toHaveBeenCalledWith('confirmReissueQrCode');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'POST' }),
    );
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('does not reissue when the confirmation is declined', async () => {
    window.confirm = jest.fn(() => false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { active: true, issuedAt: '2025-01-01T00:00:00.000Z' } }),
    });

    renderDialog();
    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'reissueQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'reissueQrCode' }));

    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial status GET
  });

  it('revokes the token after confirmation and shows "not issued" again', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: true, issuedAt: '2025-01-01T00:00:00.000Z' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false } }),
      });

    renderDialog();
    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'revokeQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'revokeQrCode' }));

    expect(window.confirm).toHaveBeenCalledWith('confirmRevokeQrCode');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/players/player-1/qr-login-token', { method: 'DELETE' }),
    );
    await waitFor(() => expect(screen.getByText('qrCodeNotIssued')).toBeInTheDocument());
  });

  it('shows an error message when the status fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    renderDialog();
    await openDialog();

    await waitFor(() => expect(screen.getByText('failedToLoadQrStatus')).toBeInTheDocument());
  });

  it('shows an error message when issuing fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { active: false, issuedAt: null } }),
      })
      .mockResolvedValueOnce({ ok: false });

    renderDialog();
    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));

    await waitFor(() => expect(screen.getByText('failedToIssueQrCode')).toBeInTheDocument());
  });

  describe('print', () => {
    async function issueAndOpenPrintReady() {
      fetchMock
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

      renderDialog();
      await openDialog();
      await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'printQrCode' })).toBeInTheDocument());
    }

    it('renders a nickname containing markup as inert text via DOM APIs, never as raw HTML', async () => {
      // A malicious/unsanitized nickname must not become executable markup in the print window
      // (regression test for the document.write + string interpolation XSS fix).
      const maliciousNickname = '<img src=x onerror=alert(1)>';
      fetchMock
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

      render(<QrLoginDialog playerId="player-1" playerNickname={maliciousNickname} />);
      await openDialog();
      await waitFor(() => expect(screen.getByRole('button', { name: 'issueQrCode' })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'issueQrCode' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'printQrCode' })).toBeInTheDocument());

      const fakeBody = { style: {}, appendChild: jest.fn() };
      const fakeDoc = { title: '', body: fakeBody, createElement: (tag: string) => document.createElement(tag) };
      const fakePrintWindow = { document: fakeDoc, focus: jest.fn(), print: jest.fn() };
      window.open = jest.fn(() => fakePrintWindow as unknown as Window);

      fireEvent.click(screen.getByRole('button', { name: 'printQrCode' }));

      expect(fakeDoc.title).toBe(maliciousNickname);
      const appendedNodes = fakeBody.appendChild.mock.calls.map((call) => call[0] as HTMLElement);
      const heading = appendedNodes.find((node) => node.tagName === 'H1')!;
      const img = appendedNodes.find((node) => node.tagName === 'IMG')! as HTMLImageElement;
      expect(heading.textContent).toBe(maliciousNickname);
      expect(heading.innerHTML).not.toContain('<img');
      expect(img.alt).toBe(`${maliciousNickname} QR login`);
      expect(fakePrintWindow.print).toHaveBeenCalled();
    });

    it('shows an error message when the print window is blocked by a popup blocker', async () => {
      await issueAndOpenPrintReady();
      window.open = jest.fn(() => null);

      fireEvent.click(screen.getByRole('button', { name: 'printQrCode' }));

      await waitFor(() => expect(screen.getByText('printPopupBlocked')).toBeInTheDocument());
    });
  });
});
