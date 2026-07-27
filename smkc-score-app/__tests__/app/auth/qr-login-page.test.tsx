/**
 * @jest-environment jsdom
 *
 * @module Test Suite: /auth/qr-login page (issue #3055)
 *
 * Covers the QR one-scan login landing page:
 * - A valid token triggers signIn('player-qr-login', ...) and redirects on success
 * - An invalid/revoked token shows an error with a link back to sign-in
 * - A missing token shows a distinct "invalid QR code" message
 * - The token is stripped from the URL/history immediately (bearer credential)
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import QrLoginPage from '@/app/auth/qr-login/page';

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('QR login page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('signs in with the token from the URL and redirects to /tournaments on success', async () => {
    mockSearchParams = new URLSearchParams({ token: 'raw-token' });
    (signIn as jest.Mock).mockResolvedValue({ ok: true });

    await act(async () => {
      render(<QrLoginPage />);
    });

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('player-qr-login', { token: 'raw-token', redirect: false });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/tournaments'));
  });

  it('strips the token from the visible URL immediately via history.replaceState', async () => {
    mockSearchParams = new URLSearchParams({ token: 'raw-token' });
    (signIn as jest.Mock).mockResolvedValue({ ok: true });
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    await act(async () => {
      render(<QrLoginPage />);
    });

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/auth/qr-login');
    replaceStateSpy.mockRestore();
  });

  it('shows an error with a link back to sign-in when the token is invalid or revoked', async () => {
    mockSearchParams = new URLSearchParams({ token: 'bad-token' });
    (signIn as jest.Mock).mockResolvedValue({ ok: false, error: 'CredentialsSignin' });

    await act(async () => {
      render(<QrLoginPage />);
    });

    await waitFor(() => expect(screen.getByText('qrLoginInvalid')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'retryLogin' })).toHaveAttribute('href', '/auth/signin');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a distinct message when no token is present', async () => {
    mockSearchParams = new URLSearchParams();

    await act(async () => {
      render(<QrLoginPage />);
    });

    await waitFor(() => expect(screen.getByText('qrLoginMissingToken')).toBeInTheDocument());
    expect(signIn).not.toHaveBeenCalled();
  });

  it('shows an error when signIn throws unexpectedly', async () => {
    mockSearchParams = new URLSearchParams({ token: 'raw-token' });
    (signIn as jest.Mock).mockRejectedValue(new Error('network failure'));

    await act(async () => {
      render(<QrLoginPage />);
    });

    await waitFor(() => expect(screen.getByText('qrLoginInvalid')).toBeInTheDocument());
  });
});
