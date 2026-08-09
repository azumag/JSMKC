/**
 * @jest-environment jsdom
 *
 * Behavior tests for the tournament detail layout lifecycle controls
 * (src/app/tournaments/[id]/layout.tsx). Issue #2895: the previous static
 * string-match test only verified that certain source fragments existed; this
 * renders the actual component and exercises the fetch/status-update flow.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import TournamentLayout from '@/app/tournaments/[id]/layout';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 'tournament-1' }),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null })),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

jest.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1',
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const summaryTournament = {
  id: 'tournament-1',
  name: 'Test Tournament',
  date: '2026-01-01',
  status: 'draft',
  publicModes: ['ta'],
  taBattleRoyaleMode: false,
};

const summaryResponse = {
  ok: true,
  json: jest.fn().mockResolvedValue({ data: summaryTournament }),
};

const updatedResponse = {
  ok: true,
  json: jest.fn().mockResolvedValue({ data: { ...summaryTournament, status: 'active' } }),
};

const errorResponse = {
  ok: false,
  status: 409,
  json: jest.fn().mockResolvedValue({ error: 'Status transition rejected', code: 'INVALID_STATUS_TRANSITION' }),
};

describe('TournamentLayout lifecycle controls (issue #2895)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    mockFetchWithRetry.mockResolvedValue(summaryResponse as never);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('renders the status badge from the fetched tournament summary', async () => {
    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });
    expect(mockFetchWithRetry).toHaveBeenCalledWith('/api/tournaments/tournament-1?fields=summary', {
      cache: 'no-store',
    });
  });

  it('applies the successful PUT result immediately (badge reflects the new status)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(updatedResponse);

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    const activeButton = screen.getByRole('button', { name: 'startTournament' });
    fireEvent.click(activeButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tournaments/tournament-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'active' }),
        }),
      );
    });
  });

  it('shows the error in role="alert" when the status update is rejected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(errorResponse);

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'startTournament' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Status transition rejected');
    });
  });

  it('blocks duplicate clicks while a status update is in flight', async () => {
    let resolveFetch: (value: unknown) => void;
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    const activeButton = screen.getByRole('button', { name: 'startTournament' });
    fireEvent.click(activeButton);
    fireEvent.click(activeButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    resolveFetch!(updatedResponse);
    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
  });
});
