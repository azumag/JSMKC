/**
 * @jest-environment jsdom
 *
 * @module Test Suite: profile/page
 *
 * Covers the profile page's player-session card and the QR one-scan
 * login card added for issue #3055:
 * - The QR login card renders only when a player record is loaded
 * - No QR card is shown for admin-only sessions (no linked player)
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import ProfilePage from '@/app/profile/page';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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
});
