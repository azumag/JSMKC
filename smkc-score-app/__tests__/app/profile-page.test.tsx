/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import ProfilePage from '@/app/profile/page';

const mockUseSession = jest.fn();
const profileTranslations = (key: string) => `profile.${key}`;
const commonTranslations = (key: string) => (key === 'networkError' ? 'Network error' : `common.${key}`);

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (namespace === 'common' ? commonTranslations : profileTranslations),
}));

jest.mock('@/components/players/qr-login-dialog', () => ({
  QrLoginDialog: () => null,
}));

describe('ProfilePage accessibility', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Player One',
          email: 'player@example.com',
          role: 'player',
          playerId: 'player-1',
        },
      },
      status: 'authenticated',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'Profile unavailable' }),
    }) as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('announces a player-record fetch failure as an alert', async () => {
    render(<ProfilePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Profile unavailable');
    expect(global.fetch).toHaveBeenCalledWith('/api/players/player-1');
  });
});
