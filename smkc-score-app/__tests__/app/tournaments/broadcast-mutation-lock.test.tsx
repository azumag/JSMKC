/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3800: broadcast save / clear mutations must
 * acquire a synchronous lock before React commits the `saving` state.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import BroadcastPage from '@/app/tournaments/[id]/broadcast/page';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 'tournament-1' }),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } } }),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

type FetchResult = {
  ok: boolean;
  json?: () => Promise<unknown>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderPage() {
  return render(<BroadcastPage params={Promise.resolve({ id: 'tournament-1' })} />);
}

describe('BroadcastPage mutation serialization (issue #3800)', () => {
  let fetchMock: jest.Mock;
  let pendingPut: ReturnType<typeof deferred<FetchResult>>;

  beforeEach(() => {
    pendingPut = deferred<FetchResult>();
    fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === 'PUT') {
        return pendingPut.promise;
      }
      if (url === '/api/players') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/api/tournaments/tournament-1/broadcast') {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: false });
    });
    global.fetch = fetchMock as typeof fetch;
  });

  async function settleInitialReads() {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/players'));
    fetchMock.mockClear();
  }

  async function releaseMutation() {
    await act(async () => {
      pendingPut.resolve({ ok: false });
      await pendingPut.promise;
    });
  }

  it('sends only one PUT when Save is activated twice before the saving render commits', async () => {
    renderPage();
    await settleInitialReads();

    const save = screen.getByRole('button', { name: 'broadcastReflect' });

    act(() => {
      save.click();
      save.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tournaments/tournament-1/broadcast',
      expect.objectContaining({ method: 'PUT' }),
    );

    await releaseMutation();
    await waitFor(() => expect(save).not.toBeDisabled());
  });

  it('does not send Clear while a same-render Save is already in flight', async () => {
    renderPage();
    await settleInitialReads();

    const save = screen.getByRole('button', { name: 'broadcastReflect' });
    const clear = screen.getByRole('button', { name: 'clear' });

    act(() => {
      save.click();
      clear.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        player1Name: '',
        player2Name: '',
        matchLabel: '',
      }),
    );

    await releaseMutation();
    await waitFor(() => expect(save).not.toBeDisabled());
  });
});
