/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import ProfilePage from '@/app/profile/page';

const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    if (namespace === 'common' && key === 'networkError') return 'Network error';
    return `${namespace}.${key}`;
  },
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
      json: jest.fn().mockResolvedValue({ error: 'Internal profile lookup detail' }),
    }) as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('announces an HTTP player-record fetch failure without exposing API details', async () => {
    render(<ProfilePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.queryByText('Internal profile lookup detail')).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/players/player-1');
  });

  it('announces a transport failure with the same generic localized error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('socket failed')) as jest.MockedFunction<typeof fetch>;

    render(<ProfilePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.queryByText('socket failed')).toBeNull();
  });
});