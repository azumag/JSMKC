/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3578: the tournament detail layout must not
 * report generic API/network failures as "tournament not found" while its
 * outer retry loop is still running or after those retries are exhausted.
 */
import { act, render, screen } from '@testing-library/react';
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
  name: 'Recovered Tournament',
  date: '2026-01-01',
  status: 'draft',
  publicModes: ['ta'],
  taBattleRoyaleMode: false,
};

const summaryResponse = {
  ok: true,
  status: 200,
  json: jest.fn().mockResolvedValue({ data: summaryTournament }),
};

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ error: 'server error' }),
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceRetryDelay() {
  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderLayout() {
  return render(<TournamentLayout params={Promise.resolve({ id: 'tournament-1' })}>content</TournamentLayout>);
}

describe('TournamentLayout fetch failure states (issue #3578)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchWithRetry.mockReset();
    mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows tournamentNotFound only after retries exhaust for a 404', async () => {
    mockFetchWithRetry.mockResolvedValue(errorResponse(404) as never);

    renderLayout();
    await flushAsyncWork();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advanceRetryDelay();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advanceRetryDelay();

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('alert')).toHaveTextContent('tournamentNotFound');
    expect(screen.getByRole('alert')).not.toHaveTextContent('networkError');
  });

  it('shows networkError after retries exhaust for a non-404 response', async () => {
    mockFetchWithRetry.mockResolvedValue(errorResponse(500) as never);

    renderLayout();
    await flushAsyncWork();
    await advanceRetryDelay();
    await advanceRetryDelay();

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    expect(screen.getByRole('alert')).not.toHaveTextContent('tournamentNotFound');
  });

  it('shows networkError after retries exhaust for a fetch rejection', async () => {
    mockFetchWithRetry.mockRejectedValue(new Error('offline'));

    renderLayout();
    await flushAsyncWork();
    await advanceRetryDelay();
    await advanceRetryDelay();

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    expect(screen.getByRole('alert')).not.toHaveTextContent('tournamentNotFound');
  });

  it('recovers normally when a retry succeeds', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(errorResponse(500) as never)
      .mockResolvedValueOnce(summaryResponse as never);

    renderLayout();
    await flushAsyncWork();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advanceRetryDelay();

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Recovered Tournament')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
