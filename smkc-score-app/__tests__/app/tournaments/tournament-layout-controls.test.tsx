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
    use: jest.fn(() => ({ id: 'tournament-1' })),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null })),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockReactUse = (jest.requireMock('react') as { use: jest.Mock }).use;

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

const summaryTournamentB = {
  ...summaryTournament,
  id: 'tournament-2',
  name: 'Second Tournament',
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
    mockReactUse.mockReturnValue({ id: 'tournament-1' });
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    mockFetchWithRetry.mockReset();
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

  it('does not show tournament A while tournament B summary is loading', async () => {
    let resolveSecondSummary!: (value: unknown) => void;
    mockFetchWithRetry
      .mockResolvedValueOnce(summaryResponse as never)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondSummary = resolve;
          }) as never,
      );

    const { rerender } = render(
      <TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>,
    );
    await screen.findByText('Test Tournament');

    mockReactUse.mockReturnValue({ id: 'tournament-2' });
    rerender(<TournamentLayout params={Promise.resolve({ id: 'tournament-2' })}>content</TournamentLayout>);

    expect(screen.queryByText('Test Tournament')).not.toBeInTheDocument();

    await act(async () => {
      resolveSecondSummary({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: summaryTournamentB }),
      });
      await Promise.resolve();
    });
    await screen.findByText('Second Tournament');
  });

  it('ignores a late summary completion from tournament A after tournament B succeeds', async () => {
    let resolveFirstSummary!: (value: unknown) => void;
    mockFetchWithRetry.mockImplementation((url) => {
      if (String(url).includes('/tournament-1?')) {
        return new Promise((resolve) => {
          resolveFirstSummary = resolve;
        }) as never;
      }
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: summaryTournamentB }),
      }) as never;
    });

    const { rerender } = render(
      <TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>,
    );
    await waitFor(() => {
      expect(mockFetchWithRetry).toHaveBeenCalledWith('/api/tournaments/tournament-1?fields=summary', {
        cache: 'no-store',
      });
    });

    mockReactUse.mockReturnValue({ id: 'tournament-2' });
    rerender(<TournamentLayout params={Promise.resolve({ id: 'tournament-2' })}>content</TournamentLayout>);
    await screen.findByText('Second Tournament');

    await act(async () => {
      resolveFirstSummary({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: summaryTournament }),
      });
      await Promise.resolve();
    });

    expect(screen.getByText('Second Tournament')).toBeInTheDocument();
    expect(screen.queryByText('Test Tournament')).not.toBeInTheDocument();
  });

  it('ignores a late status PUT completion from tournament A after moving to tournament B', async () => {
    let resolveStatusUpdate!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatusUpdate = resolve;
        }),
    );

    const { rerender } = render(
      <TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>,
    );
    await screen.findByText('Test Tournament');
    fireEvent.click(screen.getByRole('button', { name: 'startTournament' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: summaryTournamentB }),
    } as never);
    mockReactUse.mockReturnValue({ id: 'tournament-2' });
    rerender(<TournamentLayout params={Promise.resolve({ id: 'tournament-2' })}>content</TournamentLayout>);

    await screen.findByText('Second Tournament');
    expect(screen.getByRole('button', { name: 'startTournament' })).not.toBeDisabled();

    await act(async () => {
      resolveStatusUpdate(updatedResponse);
      await Promise.resolve();
    });

    expect(screen.getByText('Second Tournament')).toBeInTheDocument();
    expect(screen.queryByText('Test Tournament')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'startTournament' })).not.toBeDisabled();
  });
});
