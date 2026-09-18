/**
 * @jest-environment jsdom
 *
 * Unit tests for the UpdateIndicator component (TC-2731 through TC-2740).
 *
 * UpdateIndicator shows polling status and a localized relative
 * "last updated" time that refreshes every second via setInterval.
 */
import { act, render, screen } from '@testing-library/react';

import { UpdateIndicator } from '@/components/ui/update-indicator';
import enUpdateIndicator from '../../../messages/update-indicator/en.json';
import jaUpdateIndicator from '../../../messages/update-indicator/ja.json';

const mockUpdateIndicatorMessages = {
  en: enUpdateIndicator,
  ja: jaUpdateIndicator,
};
let mockLocale: keyof typeof mockUpdateIndicatorMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enUpdateIndicator, values?: Record<string, string | number>) => {
    let message = mockUpdateIndicatorMessages[mockLocale][key];
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replace(`{${name}}`, String(value));
    }
    return message;
  },
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockLocale = 'en';
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('UpdateIndicator — polling badge', () => {
  it('TC-2731: shows "Live" badge when isPolling=true', () => {
    render(<UpdateIndicator lastUpdated={null} isPolling={true} />);
    const label = screen.getByText('Live');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(label).not.toHaveClass('hidden');
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });

  it('TC-2732: shows "Paused" badge when isPolling=false', () => {
    render(<UpdateIndicator lastUpdated={null} isPolling={false} />);
    const label = screen.getByText('Paused');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(label).not.toHaveClass('hidden');
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('uses Japanese polling labels for Japanese locale', () => {
    mockLocale = 'ja';
    render(<UpdateIndicator lastUpdated={null} isPolling={false} />);

    expect(screen.getByText('一時停止')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });
});

describe('UpdateIndicator — time display', () => {
  it('TC-2733: shows no "Last updated" text when lastUpdated=null', () => {
    render(<UpdateIndicator lastUpdated={null} isPolling={false} />);
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it('TC-2734: shows seconds-ago when lastUpdated is < 60s in the past', () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    render(<UpdateIndicator lastUpdated={tenSecondsAgo} isPolling={false} />);
    expect(screen.getByText(/Last updated:.*\ds ago/)).toBeInTheDocument();
  });

  it('TC-2735: shows minutes-ago when lastUpdated is 90s in the past', () => {
    const ninetySecondsAgo = new Date(Date.now() - 90_000);
    render(<UpdateIndicator lastUpdated={ninetySecondsAgo} isPolling={false} />);
    expect(screen.getByText(/Last updated:.*1m ago/)).toBeInTheDocument();
  });

  it('TC-2736: shows hours-ago when lastUpdated is 2h in the past', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    render(<UpdateIndicator lastUpdated={twoHoursAgo} isPolling={false} />);
    expect(screen.getByText(/Last updated:.*2h ago/)).toBeInTheDocument();
  });

  it('keeps relative time available to assistive technology on mobile', () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    render(<UpdateIndicator lastUpdated={tenSecondsAgo} isPolling={false} />);

    const relativeTime = screen.getByText('Last updated: 10s ago');
    expect(relativeTime).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(relativeTime).not.toHaveClass('hidden');
  });

  it('uses Japanese relative time for Japanese locale', () => {
    mockLocale = 'ja';
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    render(<UpdateIndicator lastUpdated={tenSecondsAgo} isPolling={false} />);

    expect(screen.getByText('最終更新: 10秒前')).toBeInTheDocument();
  });

  it('clamps a future lastUpdated timestamp to zero seconds ago', () => {
    const future = new Date(Date.now() + 5_000);
    render(<UpdateIndicator lastUpdated={future} isPolling={false} />);

    expect(screen.getByText('Last updated: 0s ago')).toBeInTheDocument();
    expect(screen.queryByText(/-\d+s ago/)).not.toBeInTheDocument();
  });
});

describe('UpdateIndicator — live timer', () => {
  it('TC-2737: increments displayed time after 1s passes', () => {
    const now = new Date();
    render(<UpdateIndicator lastUpdated={now} isPolling={true} />);
    // Initially 0s ago
    expect(screen.getByText(/Last updated:.*0s ago/)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Last updated:.*1s ago/)).toBeInTheDocument();
  });

  it('TC-2738: interval is cleared on component unmount (no setState after unmount)', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<UpdateIndicator lastUpdated={new Date()} isPolling={true} />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('TC-2739: restarting interval when lastUpdated prop changes', () => {
    const first = new Date(Date.now() - 30_000);
    const { rerender } = render(<UpdateIndicator lastUpdated={first} isPolling={false} />);
    expect(screen.getByText('Last updated: 30s ago')).toBeInTheDocument();

    // Update to a fresh timestamp. The displayed age must reset immediately,
    // before the next one-second interval tick.
    const fresh = new Date();
    act(() => {
      rerender(<UpdateIndicator lastUpdated={fresh} isPolling={false} />);
    });
    expect(screen.getByText('Last updated: 0s ago')).toBeInTheDocument();
    expect(screen.queryByText('Last updated: 30s ago')).not.toBeInTheDocument();
  });

  it('TC-2740: initial secondsAgo is computed synchronously from lastUpdated', () => {
    // 5 seconds in the past — should display "5s ago" before any tick fires
    const fiveSecondsAgo = new Date(Date.now() - 5_000);
    render(<UpdateIndicator lastUpdated={fiveSecondsAgo} isPolling={false} />);
    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
  });
});

describe('UpdateIndicator translation catalog', () => {
  it('keeps English and Japanese update-indicator keys aligned', () => {
    expect(Object.keys(jaUpdateIndicator).sort()).toEqual(Object.keys(enUpdateIndicator).sort());
  });
});
