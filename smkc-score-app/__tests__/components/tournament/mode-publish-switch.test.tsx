/**
 * @jest-environment jsdom
 *
 * Unit tests for the ModePublishSwitch component (TC-2663 through TC-2668).
 *
 * ModePublishSwitch is the per-mode publish toggle rendered on each mode page.
 * It wraps useModePublish and shows a badge reflecting the current publish state.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModePublishSwitch } from '@/components/tournament/mode-publish-switch';

const toggleMock = jest.fn();

// Default state: not published, not loading/updating
const defaultPublishState = {
  isPublic: false,
  toggle: toggleMock,
  updating: false,
  loading: false,
};

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/hooks/use-mode-publish', () => ({
  useModePublish: jest.fn(),
}));

// Helpers
import { useModePublish } from '@/hooks/use-mode-publish';
const mockUseModePublish = useModePublish as jest.Mock;

beforeEach(() => {
  toggleMock.mockClear();
  mockUseModePublish.mockReturnValue(defaultPublishState);
});

describe('ModePublishSwitch', () => {
  it('TC-2663: shows unpublishMode badge when isPublic is false', () => {
    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    // useTranslations returns the key as-is
    expect(screen.getByText('unpublishMode')).toBeInTheDocument();
    expect(screen.queryByText('publishMode')).toBeNull();
  });

  it('TC-2664: shows publishMode badge when isPublic is true', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, isPublic: true });

    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    expect(screen.getByText('publishMode')).toBeInTheDocument();
    expect(screen.queryByText('unpublishMode')).toBeNull();
  });

  it('TC-2665: switch is disabled while loading', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, loading: true });

    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    // Switch renders as a button with role="switch"
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeDisabled();
  });

  it('TC-2666: switch is disabled while updating', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, updating: true });

    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('TC-2667: clicking switch calls toggle()', async () => {
    // userEvent is preferred over fireEvent for Radix UI Switch, which relies
    // on pointer events internally — userEvent fires the full pointer-event
    // sequence (pointerdown → mousedown → pointerup → mouseup → click) so the
    // test is resilient to future internal event-handling changes.
    const user = userEvent.setup();
    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    await user.click(screen.getByRole('switch'));

    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('TC-2668: switch aria-label includes modeLabelKey and current state key', () => {
    render(
      <ModePublishSwitch
        tournamentId="t-1"
        mode="BM"
        modeLabelKey="battleMode"
      />,
    );

    // aria-label = "${tc(modeLabelKey)}: ${stateLabel}"
    // useTranslations mock returns the key, so: "battleMode: unpublishMode"
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-label', 'battleMode: unpublishMode');
  });
});
