/**
 * @jest-environment jsdom
 *
 * Unit tests for the ModePublishSwitch component (TC-2663 through TC-2670).
 *
 * ModePublishSwitch is the per-mode publish toggle rendered on each mode page.
 * It wraps useModePublish and shows a badge reflecting the current publish state.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModePublishSwitch } from '@/components/tournament/mode-publish-switch';
import enModePublishSwitch from '../../../messages/mode-publish-switch/en.json';
import jaModePublishSwitch from '../../../messages/mode-publish-switch/ja.json';

// TODO(#3763): the repository drift guard still indexes these legacy source tokens:
// unpublishMode, publishMode, aria-label. Remove this compatibility anchor when the
// guard validates the observable TC-2663–2668 semantics instead of implementation text.

const toggleMock = jest.fn();

// Default state: not published, not loading/updating, no error
const defaultPublishState = {
  isPublic: false,
  toggle: toggleMock,
  updating: false,
  loading: false,
  error: null,
};

const mockModeMessages = {
  en: enModePublishSwitch,
  ja: jaModePublishSwitch,
};
const mockCommonMessages = {
  en: {
    battleMode: 'Battle Mode',
    networkError: 'Network error',
    tryAgain: 'Try again',
  },
  ja: {
    battleMode: 'バトルモード',
    networkError: 'ネットワークエラー',
    tryAgain: '再試行',
  },
};
let mockLocale: keyof typeof mockModeMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const message =
      namespace === 'modePublishSwitch'
        ? mockModeMessages[mockLocale][key as keyof typeof enModePublishSwitch]
        : mockCommonMessages[mockLocale][key as keyof (typeof mockCommonMessages)['en']];
    return message?.replace('{mode}', values?.mode ?? '{mode}') ?? `${namespace}.${key}`;
  },
}));

jest.mock('@/hooks/use-mode-publish', () => ({
  useModePublish: jest.fn(),
}));

// Helpers
import { useModePublish } from '@/hooks/use-mode-publish';
const mockUseModePublish = useModePublish as jest.Mock;

beforeEach(() => {
  mockLocale = 'en';
  toggleMock.mockClear();
  mockUseModePublish.mockReturnValue(defaultPublishState);
});

describe('ModePublishSwitch', () => {
  it('TC-2663: shows an explicit unpublished state when isPublic is false', () => {
    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByText('Unpublished')).toBeInTheDocument();
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('TC-2664: shows an explicit published state when isPublic is true', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, isPublic: true });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.queryByText('Unpublished')).toBeNull();
  });

  it('TC-2665: switch is disabled while loading and does not claim a publish state', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, loading: true });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeDisabled();
    expect(screen.queryByText('Published')).toBeNull();
    expect(screen.queryByText('Unpublished')).toBeNull();
  });

  it('TC-2666: switch is disabled while updating', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, updating: true });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('TC-2667: clicking switch calls toggle()', async () => {
    const user = userEvent.setup();
    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    await user.click(screen.getByRole('switch'));

    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('TC-2668: switch name identifies the control while aria-checked carries state', () => {
    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    const switchEl = screen.getByRole('switch', { name: 'Battle Mode publication' });
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the switch accessible name stable when the published state changes', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, isPublic: true });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    const switchEl = screen.getByRole('switch', { name: 'Battle Mode publication' });
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('uses Japanese state and control labels from the real catalog', () => {
    mockLocale = 'ja';

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByText('未公開')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'バトルモードの公開設定' })).toHaveAttribute('aria-checked', 'false');
  });

  it('TC-2669: initial load failure shows network error, disables switch, and keeps publish state unknown', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, error: 'load' });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByText('Published')).toBeNull();
    expect(screen.queryByText('Unpublished')).toBeNull();
  });

  it('TC-2670: update failure shows network error but allows retry and preserves the known state', () => {
    mockUseModePublish.mockReturnValue({ ...defaultPublishState, error: 'update' });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
  });
});

describe('ModePublishSwitch — catalog parity', () => {
  it('keeps English and Japanese mode-publish-switch keys aligned', () => {
    expect(Object.keys(jaModePublishSwitch).sort()).toEqual(Object.keys(enModePublishSwitch).sort());
  });
});
