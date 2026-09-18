/**
 * @jest-environment jsdom
 *
 * Unit tests for the LoadingOverlay component (TC-2726 through TC-2730).
 *
 * LoadingOverlay renders a full-screen blocking overlay with a spinner
 * and message, or returns null when isOpen=false.
 */
import { render, screen } from '@testing-library/react';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import enLoadingOverlay from '../../../messages/loading-overlay/en.json';
import jaLoadingOverlay from '../../../messages/loading-overlay/ja.json';

const mockLoadingMessages = {
  en: { loadingOverlay: enLoadingOverlay },
  ja: { loadingOverlay: jaLoadingOverlay },
};
let mockLocale: keyof typeof mockLoadingMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enLoadingOverlay) => mockLoadingMessages[mockLocale].loadingOverlay[key],
}));

beforeEach(() => {
  mockLocale = 'en';
});

describe('LoadingOverlay — visibility', () => {
  it('TC-2726: renders nothing when isOpen=false', () => {
    const { container } = render(<LoadingOverlay isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('TC-2727: renders the overlay dialog when isOpen=true', () => {
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('LoadingOverlay — message', () => {
  it('TC-2728: shows the localized default processing message when no message prop is given', () => {
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('TC-2729: shows custom message when message prop is provided', () => {
    mockLocale = 'ja';
    render(<LoadingOverlay isOpen={true} message="ブラケット生成中" />);
    expect(screen.getByText('ブラケット生成中')).toBeInTheDocument();
    expect(screen.queryByText('処理中...')).not.toBeInTheDocument();
  });

  it('localizes default and helper copy for Japanese', () => {
    mockLocale = 'ja';
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByText('処理中...')).toBeInTheDocument();
    expect(screen.getByText('処理が完了するまでしばらくお待ちください。')).toBeInTheDocument();
    expect(screen.queryByText('Please wait while we complete this operation.')).not.toBeInTheDocument();
  });
});

describe('LoadingOverlay — accessibility', () => {
  it('TC-2730: exposes a localized modal dialog as a polite live region', () => {
    render(<LoadingOverlay isOpen={true} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-live', 'polite');
    expect(dialog).not.toHaveAttribute('aria-busy');
    expect(dialog).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses the Japanese aria-label for Japanese locale', () => {
    mockLocale = 'ja';
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '読み込み中');
  });
});

describe('LoadingOverlay — catalog parity', () => {
  it('keeps English and Japanese loading-overlay keys aligned', () => {
    expect(Object.keys(jaLoadingOverlay).sort()).toEqual(Object.keys(enLoadingOverlay).sort());
  });
});
