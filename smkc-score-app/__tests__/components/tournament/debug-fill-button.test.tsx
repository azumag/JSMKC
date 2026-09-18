/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DebugFillButton } from '@/components/tournament/debug-fill-button';

jest.mock('next-intl', () => {
  const translations: Record<'en' | 'ja', Record<string, Record<string, string>>> = {
    en: {
      common: { networkError: 'common.networkError' },
      debugFill: {
        title: '{mode} qualification scores auto-fill (debug mode)',
        button: 'Auto-fill qualification scores',
        busyButton: 'Auto-filling…',
        running: 'Running…',
        success: 'Done: {filled} filled / {skipped} skipped',
        failure: 'Failed: {message}',
      },
    },
    ja: {
      common: { networkError: 'common.networkError' },
      debugFill: {
        title: '{mode} 予選スコアを自動入力 (debug mode)',
        button: '予選スコア自動入力',
        busyButton: '自動入力中…',
        running: '実行中…',
        success: '完了: {filled} 件入力 / {skipped} 件スキップ',
        failure: '失敗: {message}',
      },
    },
  };
  let locale: 'en' | 'ja' = 'ja';

  return {
    __setMockLocale: (nextLocale: 'en' | 'ja') => {
      locale = nextLocale;
    },
    useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
      const template = translations[locale]?.[namespace]?.[key] ?? `${namespace}.${key}`;
      return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? `{${name}}`));
    },
  };
});

jest.mock('@/lib/client-logger', () => {
  const error = jest.fn();
  return {
    __mockLoggerError: error,
    createLogger: () => ({ error, warn: jest.fn(), info: jest.fn() }),
  };
});

const setMockLocale = (jest.requireMock('next-intl') as { __setMockLocale: (locale: 'en' | 'ja') => void })
  .__setMockLocale;
const mockLoggerError = (jest.requireMock('@/lib/client-logger') as { __mockLoggerError: jest.Mock }).__mockLoggerError;

describe('DebugFillButton', () => {
  beforeEach(() => {
    setMockLocale('ja');
    mockLoggerError.mockClear();
  });

  afterEach(() => {
    // jest.spyOn allows jest.restoreAllMocks() to fully reset fetch without manual originalFetch tracking
    jest.restoreAllMocks();
  });

  it('TC-2687: renders button with correct mode-specific title', () => {
    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('title', 'BM 予選スコアを自動入力 (debug mode)');
    expect(btn).toHaveTextContent('予選スコア自動入力');
  });

  it('localizes the button, title, and status text for English', async () => {
    setMockLocale('en');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ filled: 2, skipped: 1 }), { status: 200 }));

    render(<DebugFillButton tournamentId="t-1" mode="gp" />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'GP qualification scores auto-fill (debug mode)');
    expect(button).toHaveTextContent('Auto-fill qualification scores');

    fireEvent.click(button);
    expect(button).toHaveTextContent('Auto-filling…');
    expect(screen.getByRole('status')).toHaveTextContent('Running…');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Done: 2 filled / 1 skipped'));
  });

  it('TC-2688: shows 実行中… while the fetch is in-flight', async () => {
    let resolve!: (r: Response) => void;
    jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolve = res;
        }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="ta" />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('status')).toHaveTextContent('実行中…');
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');

    resolve(new Response(JSON.stringify({ filled: 5, skipped: 2 }), { status: 200 }));
    // Verify button is re-enabled after finally block completes
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('実行中…')).toBeNull();
  });

  it('TC-2689: prevents duplicate clicks in the same render batch and unlocks after completion', async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(new Response(JSON.stringify({ filled: 1, skipped: 0 }), { status: 200 }));

    render(<DebugFillButton tournamentId="t-1" mode="gp" />);
    const btn = screen.getByRole('button');

    // React batches these native activations, so state alone still has the old `busy=false`
    // value for each handler call. The synchronous ref lock must admit only the first one.
    act(() => {
      btn.click();
      btn.click();
      btn.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();

    await act(async () => {
      resolveFirst(new Response(JSON.stringify({ filled: 0, skipped: 0 }), { status: 200 }));
    });
    await waitFor(() => expect(btn).not.toBeDisabled());

    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('TC-2690: calls the correct debug-fill endpoint on click', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ filled: 3, skipped: 0 }), { status: 200 }));

    render(<DebugFillButton tournamentId="tourney-42" mode="mr" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/tourney-42/mr/debug-fill', { method: 'POST' }),
    );
  });

  it('TC-2691: shows success status with filled/skipped counts', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ filled: 12, skipped: 3 }), { status: 200 }));

    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('完了: 12 件入力 / 3 件スキップ'));
  });

  it('TC-2692: calls onFilled callback after successful API response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ filled: 5, skipped: 0 }), { status: 200 }));
    const onFilled = jest.fn();

    render(<DebugFillButton tournamentId="t-1" mode="bm" onFilled={onFilled} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onFilled).toHaveBeenCalledTimes(1));
  });

  it('TC-2693: redacts HTTP error details, does not call onFilled, and allows retry', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not enough players' }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ filled: 2, skipped: 0 }), { status: 200 }));
    const onFilled = jest.fn();

    render(<DebugFillButton tournamentId="t-1" mode="ta" onFilled={onFilled} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('common.networkError'));
    expect(screen.queryByText(/Not enough players/)).toBeNull();
    expect(onFilled).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onFilled).toHaveBeenCalledTimes(1));
  });

  it('TC-2694: redacts rejected request details, logs diagnostics, and re-enables button', async () => {
    const rejection = new Error('Network down at internal-debug-gateway');
    jest.spyOn(global, 'fetch').mockRejectedValue(rejection);

    render(<DebugFillButton tournamentId="t-1" mode="gp" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('common.networkError'));
    expect(screen.queryByText(/エラー:/)).toBeNull();
    expect(screen.queryByText(/internal-debug-gateway/)).toBeNull();
    expect(mockLoggerError).toHaveBeenCalledWith('Debug fill request failed:', {
      error: rejection,
      tournamentId: 't-1',
      mode: 'gp',
    });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('TC-2695: shows 0 件 when filled/skipped fields are missing from the response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('完了: 0 件入力 / 0 件スキップ'));
  });
});
