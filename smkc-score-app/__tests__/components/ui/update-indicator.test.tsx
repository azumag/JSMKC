/**
 * @jest-environment jsdom
 *
 * Unit tests for the UpdateIndicator component (TC-2731 through TC-2740).
 *
 * UpdateIndicator shows polling status (Live/Paused badge) and a relative
 * "last updated" time that refreshes every second via setInterval.
 */
import { act, render, screen } from '@testing-library/react';
import { UpdateIndicator } from '@/components/ui/update-indicator';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('UpdateIndicator — polling badge', () => {
  it('TC-2731: shows "Live" badge when isPolling=true', () => {
    render(<UpdateIndicator lastUpdated={null} isPolling={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });

  it('TC-2732: shows "Paused" badge when isPolling=false', () => {
    render(<UpdateIndicator lastUpdated={null} isPolling={false} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
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
});

describe('UpdateIndicator — live timer', () => {
  it('TC-2737: increments displayed time after 1s passes', () => {
    const now = new Date();
    render(<UpdateIndicator lastUpdated={now} isPolling={true} />);
    // Initially 0s ago
    expect(screen.getByText(/Last updated:.*0s ago/)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText(/Last updated:.*1s ago/)).toBeInTheDocument();
  });

  it('TC-2738: interval is cleared on component unmount (no setState after unmount)', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(
      <UpdateIndicator lastUpdated={new Date()} isPolling={true} />,
    );
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('TC-2739: restarting interval when lastUpdated prop changes', () => {
    const first = new Date(Date.now() - 30_000);
    const { rerender } = render(
      <UpdateIndicator lastUpdated={first} isPolling={false} />,
    );
    expect(screen.getByText(/30s ago/)).toBeInTheDocument();

    // Update to a fresh timestamp
    const fresh = new Date();
    act(() => { rerender(<UpdateIndicator lastUpdated={fresh} isPolling={false} />); });
    expect(screen.getByText(/0s ago/)).toBeInTheDocument();
  });

  it('TC-2740: initial secondsAgo is computed synchronously from lastUpdated', () => {
    // 5 seconds in the past — should display "5s ago" before any tick fires
    const fiveSecondsAgo = new Date(Date.now() - 5_000);
    render(<UpdateIndicator lastUpdated={fiveSecondsAgo} isPolling={false} />);
    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
  });
});
