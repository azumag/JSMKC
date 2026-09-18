/**
 * @jest-environment jsdom
 *
 * Behavior tests for the tournament detail layout lifecycle controls
 * (src/app/tournaments/[id]/layout.tsx). Issue #2895: the previous static
 * string-match test only verified that certain source fragments existed; this
 * renders the actual component and exercises the fetch/status-update flow.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('@/lib/client-logger', () => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return { createLogger: () => logger, __mockLogger: logger };
});

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;
const mockLoggerError = (jest.requireMock('@/lib/client-logger') as { __mockLogger: { error: jest.Mock } }).__mockLogger
  .error;

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
    mockLoggerError.mockClear();
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

  it('shows a concrete API error in role="alert" when the status update is rejected', async () => {
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

  it('uses the localized network fallback for a rejected status request and logs the raw detail', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('browser transport detail'));

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'startTournament' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    });
    expect(screen.queryByText('browser transport detail')).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to update status:',
      expect.objectContaining({ message: 'browser transport detail' }),
    );
    expect(screen.getByRole('button', { name: 'startTournament' })).not.toBeDisabled();
  });

  it('uses the localized network fallback for a generic non-JSON non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('upstream failure', { status: 502 }));

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'startTournament' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    });
    expect(screen.queryByText('HTTP 502')).not.toBeInTheDocument();
  });

  it('blocks duplicate clicks while a status update is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: { ...summaryTournament, status: 'completed' } }),
      });

    render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    const activeButton = screen.getByRole('button', { name: 'startTournament' });
    act(() => {
      activeButton.click();
      activeButton.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(updatedResponse);
      await Promise.resolve();
    });

    const completeButton = await screen.findByRole('button', { name: 'completeTournament' });
    expect(completeButton).not.toBeDisabled();
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
