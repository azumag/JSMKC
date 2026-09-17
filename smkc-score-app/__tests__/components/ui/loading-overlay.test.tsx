/**
 * @jest-environment jsdom
 *
 * Unit tests for the LoadingOverlay component (TC-2726 through TC-2730).
 *
 * LoadingOverlay renders a full-screen blocking overlay with a spinner
 * and message, or returns null when isOpen=false.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import enLoadingOverlay from '../../../messages/loading-overlay/en.json';
import jaLoadingOverlay from '../../../messages/loading-overlay/ja.json';

const loadingMessages = {
  en: { loadingOverlay: enLoadingOverlay },
  ja: { loadingOverlay: jaLoadingOverlay },
};

function renderLoadingOverlay(
  props: React.ComponentProps<typeof LoadingOverlay>,
  locale: keyof typeof loadingMessages = 'en',
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={loadingMessages[locale]}>
      <LoadingOverlay {...props} />
    </NextIntlClientProvider>,
  );
}

describe('LoadingOverlay — visibility', () => {
  it('TC-2726: renders nothing when isOpen=false', () => {
    const { container } = renderLoadingOverlay({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('TC-2727: renders the overlay dialog when isOpen=true', () => {
    renderLoadingOverlay({ isOpen: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('LoadingOverlay — message', () => {
  it('TC-2728: shows the localized default processing message when no message prop is given', () => {
    renderLoadingOverlay({ isOpen: true });
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('TC-2729: shows custom message when message prop is provided', () => {
    renderLoadingOverlay({ isOpen: true, message: 'ブラケット生成中' }, 'ja');
    expect(screen.getByText('ブラケット生成中')).toBeInTheDocument();
    expect(screen.queryByText('処理中...')).not.toBeInTheDocument();
  });

  it('localizes default and helper copy for Japanese', () => {
    renderLoadingOverlay({ isOpen: true }, 'ja');
    expect(screen.getByText('処理中...')).toBeInTheDocument();
    expect(screen.getByText('処理が完了するまでしばらくお待ちください。')).toBeInTheDocument();
    expect(screen.queryByText('Please wait while we complete this operation.')).not.toBeInTheDocument();
  });
});

describe('LoadingOverlay — accessibility', () => {
  it('TC-2730: has role="dialog" and localized aria-label', () => {
    renderLoadingOverlay({ isOpen: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses the Japanese aria-label for Japanese locale', () => {
    renderLoadingOverlay({ isOpen: true }, 'ja');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '読み込み中');
  });
});

describe('LoadingOverlay — catalog parity', () => {
  it('keeps English and Japanese loading-overlay keys aligned', () => {
    expect(Object.keys(jaLoadingOverlay).sort()).toEqual(Object.keys(enLoadingOverlay).sort());
  });
});
