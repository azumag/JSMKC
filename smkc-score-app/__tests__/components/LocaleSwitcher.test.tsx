/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

const mockRefresh = jest.fn();

jest.mock('next-intl', () => ({
  useLocale: jest.fn(),
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

function mockLocale(locale: 'en' | 'ja') {
  const { useLocale } = jest.requireMock('next-intl') as { useLocale: jest.Mock };
  useLocale.mockReturnValue(locale);
}

function mockFetch(ok: boolean) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue({}),
  } as unknown as Response);
}

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-2989: EN ロケールのとき aria-checked=false でレンダリングされる', () => {
    mockLocale('en');
    render(<LocaleSwitcher />);

    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-checked', 'false');
  });

  it('TC-2990: JA ロケールのとき aria-checked=true でレンダリングされる', () => {
    mockLocale('ja');
    render(<LocaleSwitcher />);

    const button = screen.getByRole('switch');
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

  it('TC-2992: API 成功後に router.refresh が呼ばれる', async () => {
    mockLocale('en');
    const fetchSpy = mockFetch(true);
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('switch'));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
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
});
