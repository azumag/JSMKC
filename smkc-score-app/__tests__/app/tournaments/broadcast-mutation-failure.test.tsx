/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3802: failed broadcast mutations must keep the
 * current form state, release the synchronous mutation lock, and remain retryable.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('BroadcastPage mutation failures (issue #3802)', () => {
  let fetchMock: jest.Mock;
  let putHandler: () => Promise<FetchResult>;

  beforeEach(() => {
    putHandler = async () => ({ ok: false });
    fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === 'PUT') {
        return putHandler();
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

  const putCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

  it('keeps the current form state and unlocks after a non-2xx Clear response', async () => {
    render(<BroadcastPage params={Promise.resolve({ id: 'tournament-1' })} />);
    await settleInitialReads();

    const player1Input = screen.getAllByPlaceholderText('playerNamePlaceholder')[0];
    const clear = screen.getByRole('button', { name: 'clear' });
    fireEvent.change(player1Input, { target: { value: 'Alice' } });

    fireEvent.click(clear);

    await waitFor(() => expect(clear).not.toBeDisabled());
    expect(player1Input).toHaveValue('Alice');
    expect(putCalls()).toHaveLength(1);

    fireEvent.click(clear);
    await waitFor(() => expect(putCalls()).toHaveLength(2));
  });

  it('catches a Save transport rejection, unlocks, and permits retry', async () => {
    let attempt = 0;
    putHandler = () => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: false });
    };

    render(<BroadcastPage params={Promise.resolve({ id: 'tournament-1' })} />);
    await settleInitialReads();

    const save = screen.getByRole('button', { name: 'broadcastReflect' });
    fireEvent.click(save);

    await waitFor(() => expect(save).not.toBeDisabled());
    expect(putCalls()).toHaveLength(1);

    fireEvent.click(save);
    await waitFor(() => expect(putCalls()).toHaveLength(2));
  });

  it('catches a Clear transport rejection without discarding the form and permits retry', async () => {
    let attempt = 0;
    putHandler = () => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: false });
    };

    render(<BroadcastPage params={Promise.resolve({ id: 'tournament-1' })} />);
    await settleInitialReads();

    const player1Input = screen.getAllByPlaceholderText('playerNamePlaceholder')[0];
    const clear = screen.getByRole('button', { name: 'clear' });
    fireEvent.change(player1Input, { target: { value: 'Alice' } });

    fireEvent.click(clear);

    await waitFor(() => expect(clear).not.toBeDisabled());
    expect(player1Input).toHaveValue('Alice');
    expect(putCalls()).toHaveLength(1);

    fireEvent.click(clear);
    await waitFor(() => expect(putCalls()).toHaveLength(2));
  });
});
