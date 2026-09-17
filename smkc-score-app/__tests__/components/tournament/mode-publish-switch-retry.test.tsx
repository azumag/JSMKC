/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModePublishSwitch } from '@/components/tournament/mode-publish-switch';

const retryLoad = jest.fn();

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/hooks/use-mode-publish', () => ({
  useModePublish: jest.fn(),
}));

import { useModePublish } from '@/hooks/use-mode-publish';

const mockUseModePublish = useModePublish as jest.Mock;

describe('ModePublishSwitch initial-load retry (issue #3624)', () => {
  beforeEach(() => {
    retryLoad.mockClear();
    mockUseModePublish.mockReturnValue({
      isPublic: false,
      toggle: jest.fn(),
      retryLoad,
      updating: false,
      loading: false,
      error: 'load',
    });
  });

  it('keeps the switch disabled and retries only when the administrator clicks tryAgain', async () => {
    const user = userEvent.setup();
    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    expect(screen.getByRole('switch')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'tryAgain' }));
    expect(retryLoad).toHaveBeenCalledTimes(1);
  });

  it('does not show the load retry action for an update failure', () => {
    mockUseModePublish.mockReturnValue({
      isPublic: false,
      toggle: jest.fn(),
      retryLoad,
      updating: false,
      loading: false,
      error: 'update',
    });

    render(<ModePublishSwitch tournamentId="t-1" mode="BM" modeLabelKey="battleMode" />);

    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'tryAgain' })).not.toBeInTheDocument();
  });
});
