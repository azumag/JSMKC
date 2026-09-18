/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

const mockRefresh = jest.fn();

jest.mock('next-intl', () => ({
  useLocale: jest.fn(),
  useTranslations: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn() }),
}));

const translations = {
  en: {
    common: {
      networkError: 'EN network error',
    },
    localeSwitcher: {
      switchToJapanese: 'Switch to Japanese',
      switchToEnglish: 'Switch to English',
      switchedToJapanese: 'Switched to Japanese',
      switchedToEnglish: 'Switched to English',
    },
  },
  ja: {
    common: {
      networkError: 'JA network error',
    },
    localeSwitcher: {
      switchToJapanese: '日本語に切り替え',
      switchToEnglish: '英語に切り替え',
      switchedToJapanese: '日本語に切り替えました',
      switchedToEnglish: '英語に切り替えました',
    },
  },
} as const;

function mockLocale(locale: 'en' | 'ja') {
  const { useLocale, useTranslations } = jest.requireMock('next-intl') as {
    useLocale: jest.Mock;
    useTranslations: jest.Mock;
  };
  useLocale.mockReturnValue(locale);
  useTranslations.mockImplementation((namespace: 'common' | 'localeSwitcher') => (key: string) => {
    const namespaceMessages = translations[locale][namespace] as Record<string, string>;
    return namespaceMessages[key] ?? `${namespace}.${key}`;
  });
}

function mockFetch(ok: boolean) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue({}),
  } as unknown as Response);
}

function getToastMock() {
  return (jest.requireMock('sonner') as { toast: { success: jest.Mock; error: jest.Mock } }).toast;
}

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-2989: EN ロケールのとき aria-checked=false かつ英語の accessible name でレンダリングされる', () => {
    mockLocale('en');
    render(<LocaleSwitcher />);

    const button = screen.getByRole('switch', { name: 'Switch to Japanese' });
    expect(button).toHaveAttribute('aria-checked', 'false');
  });

  it('TC-2990: JA ロケールのとき aria-checked=true かつ日本語の accessible name でレンダリングされる', () => {
    mockLocale('ja');
    render(<LocaleSwitcher />);

    const button = screen.getByRole('switch', { name: '英語に切り替え' });
    expect(button).toHaveAttribute('aria-checked', 'true');
  });

  it('TC-2991: クリックで /api/locale へ POST リクエストが送られる', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(fetchSpy).toHaveBeenCalledWith('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'ja' }),
    });
    fetchSpy.mockRestore();
  });

  it('TC-2992: API 成功後に current locale の成功通知を表示して router.refresh が呼ばれる', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(getToastMock().success).toHaveBeenCalledWith('Switched to Japanese');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('JA 表示中の API 成功後は日本語の成功通知を表示する', async () => {
    mockLocale('ja');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(getToastMock().success).toHaveBeenCalledWith('英語に切り替えました');
    fetchSpy.mockRestore();
  });

  it('TC-2993: API エラー時に router.refresh が呼ばれない', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(false);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(mockRefresh).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('TC-2994: Enter キーでもロケール切り替えが発動する', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    const button = screen.getByRole('switch');
    button.focus();
    await userEvent.keyboard('{Enter}');

    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each([' ', 'Enter'])('repeat=true の %p keydown は native activation を抑止して POST しない', (key) => {
    mockLocale('en');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    const wasNotCanceled = fireEvent.keyDown(screen.getByRole('switch'), { key, repeat: true });

    expect(wasNotCanceled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('EN 表示中の切り替え失敗は現在 locale の network error を表示する', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(false);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(getToastMock().error).toHaveBeenCalledWith('EN network error');
    fetchSpy.mockRestore();
  });

  it('JA 表示中の切り替え失敗は現在 locale の network error を表示する', async () => {
    mockLocale('ja');
    const fetchSpy = mockFetch(false);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(getToastMock().error).toHaveBeenCalledWith('JA network error');
    fetchSpy.mockRestore();
  });
});
