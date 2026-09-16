/**
 * @jest-environment jsdom
 *
 * @module Test Suite: profile/page
 *
 * Covers the profile page's player-session card, QR one-scan login card,
 * and linked-player fetch error fallback contract:
 * - The QR login card renders only when a player record is loaded
 * - No QR card is shown for admin-only sessions (no linked player)
 * - API-specific errors are preferred over the shared generic fallback
 * - Generic HTTP and network failures use common.networkError
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import ProfilePage from '@/app/profile/page';

jest.mock('next-intl', () => {
  const translate = (key: string) => key;
  return { useTranslations: () => translate };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

describe('ProfilePage', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('shows the QR login card once the linked player record loads', async () => {
    (useSession as jest.Mock).mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Test Player', email: 'test@player.local', role: 'player', playerId: 'player-1' } },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'player-1', name: 'Test Player', nickname: 'test-player' } }),
    });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('qrLoginCardTitle')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'qrLogin' })).toBeInTheDocument();
  });

  it('does not show the QR login card for an admin session with no linked player', async () => {
    (useSession as jest.Mock).mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Admin', email: 'admin@example.com', role: 'admin' } },
    });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('noPlayerSession')).toBeInTheDocument());
    expect(screen.queryByText('qrLoginCardTitle')).not.toBeInTheDocument();
  });

  it('prefers an API-specific error when linked player loading fails', async () => {
    (useSession as jest.Mock).mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Test Player', role: 'player', playerId: 'player-1' } },
    });
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Player lookup unavailable' }),
    });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('Player lookup unavailable')).toBeInTheDocument());
    expect(screen.queryByText('qrLoginCardTitle')).not.toBeInTheDocument();
  });

  it('uses common.networkError when a non-2xx response has no API error', async () => {
    (useSession as jest.Mock).mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Test Player', role: 'player', playerId: 'player-1' } },
    });
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('networkError')).toBeInTheDocument());
  });

  it('uses common.networkError when the linked player request rejects', async () => {
    (useSession as jest.Mock).mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Test Player', role: 'player', playerId: 'player-1' } },
    });
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('networkError')).toBeInTheDocument());
  });
});
